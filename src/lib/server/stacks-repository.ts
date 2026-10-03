import {
    MAX_ITEMS_PER_STACK,
    MAX_STACKS_PER_USER,
    newStackId,
    slugifyStackName,
    type StackItemInput,
} from '../stacks';
import type { BoundStatement, Database } from './db';
import { findUserByUsername } from './username-repository';

export interface StackItem {
    slug: string;
    position: number;
    purpose: string;
    usageNotes: string | null;
    enabled: boolean;
}

export interface StackSummary {
    id: string;
    userId: string;
    slug: string;
    title: string;
    description: string | null;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    itemCount: number;
    enabledItemCount: number;
}

export interface OwnedStack extends StackSummary {
    items: StackItem[];
}

export interface PublicStack extends OwnedStack {
    username: string;
    displayName: string;
}

export interface SitemapStack {
    username: string;
    slug: string;
    updatedAt: number;
}

export interface UpdateStackInput {
    title?: string;
    description?: string | null;
    slug?: string;
    isPublic?: boolean;
}

export interface AppendItemInput {
    slug: string;
    purpose: string;
    usageNotes?: string | null;
}

export type AppendItemResult =
    | { status: 'added'; item: StackItem }
    | { status: 'exists'; item: StackItem }
    | { status: 'limit' }
    | { status: 'not_found' };

export type PublicStackResult =
    | { status: 'found'; stack: PublicStack }
    | { status: 'redirect'; username: string; slug: string }
    | { status: 'not_found' };

interface StackRow {
    id: string;
    user_id: string;
    slug: string;
    title: string;
    description: string | null;
    is_public: number;
    created_at: number;
    updated_at: number;
    item_count?: number;
    enabled_item_count?: number;
    username?: string;
    display_name?: string;
}

interface StackItemRow {
    tool_slug: string;
    position: number;
    purpose: string;
    usage_notes: string | null;
    enabled: number;
}

export class StackLimitError extends Error {
    constructor() {
        super(`A user can create at most ${MAX_STACKS_PER_USER} stacks.`);
        this.name = 'StackLimitError';
    }
}

export class StackSlugTakenError extends Error {
    constructor() {
        super('That stack name is already in use.');
        this.name = 'StackSlugTakenError';
    }
}

function mapStack(row: StackRow): StackSummary {
    return {
        id: row.id,
        userId: row.user_id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        isPublic: Boolean(row.is_public),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemCount: Number(row.item_count ?? 0),
        enabledItemCount: Number(row.enabled_item_count ?? 0),
    };
}

function mapItem(row: StackItemRow): StackItem {
    return {
        slug: row.tool_slug,
        position: row.position,
        purpose: row.purpose,
        usageNotes: row.usage_notes,
        enabled: Boolean(row.enabled),
    };
}

async function loadItems(
    db: Database,
    stackId: string,
    enabledOnly = false,
): Promise<StackItem[]> {
    const result = await db.prepare(`
        SELECT tool_slug, position, purpose, usage_notes, enabled
        FROM stack_items
        WHERE stack_id = ? ${enabledOnly ? 'AND enabled = 1' : ''}
        ORDER BY position ASC
    `).bind(stackId).all<StackItemRow>();
    return (result.results ?? []).map(mapItem);
}

async function findOwnedStackRow(db: Database, userId: string, id: string): Promise<StackRow | null> {
    return db.prepare(`
        SELECT id, user_id, slug, title, description, is_public, created_at, updated_at
        FROM stacks
        WHERE user_id = ? AND id = ?
        LIMIT 1
    `).bind(userId, id).first<StackRow>();
}

async function slugIsReserved(db: Database, userId: string, slug: string): Promise<boolean> {
    const current = await db.prepare(`
        SELECT 1 AS found
        FROM stacks
        WHERE user_id = ? AND slug = ?
        LIMIT 1
    `).bind(userId, slug).first<{ found: number }>();
    if (current) return true;

    const historical = await db.prepare(`
        SELECT 1 AS found
        FROM stack_slug_history
        WHERE user_id = ? AND slug = ?
        LIMIT 1
    `).bind(userId, slug).first<{ found: number }>();
    return Boolean(historical);
}

async function uniqueStackSlug(db: Database, userId: string, title: string): Promise<string> {
    const base = slugifyStackName(title);
    for (let suffix = 1; suffix <= MAX_STACKS_PER_USER + 1; suffix += 1) {
        const suffixText = suffix === 1 ? '' : `-${suffix}`;
        const stem = base.slice(0, 60 - suffixText.length);
        const slug = `${stem}${suffixText}`;
        if (!await slugIsReserved(db, userId, slug)) return slug;
    }
    throw new Error('Unable to allocate a unique stack name.');
}

export async function listStacks(db: Database, userId: string): Promise<StackSummary[]> {
    const result = await db.prepare(`
        SELECT
            s.id, s.user_id, s.slug, s.title, s.description, s.is_public,
            s.created_at, s.updated_at,
            COUNT(i.tool_slug) AS item_count,
            SUM(CASE WHEN i.enabled = 1 THEN 1 ELSE 0 END) AS enabled_item_count
        FROM stacks s
        LEFT JOIN stack_items i ON i.stack_id = s.id
        WHERE s.user_id = ?
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    `).bind(userId).all<StackRow>();

    return (result.results ?? []).map(mapStack);
}

export async function createStack(
    db: Database,
    userId: string,
    input: { title: string; description?: string | null },
    now = Date.now(),
): Promise<StackSummary> {
    const count = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM stacks
        WHERE user_id = ?
    `).bind(userId).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_STACKS_PER_USER) throw new StackLimitError();

    const slug = await uniqueStackSlug(db, userId, input.title);
    const id = newStackId();
    await db.prepare(`
        INSERT INTO stacks (id, user_id, slug, title, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, slug, input.title, input.description ?? null, now, now).run();

    return {
        id,
        userId,
        slug,
        title: input.title,
        description: input.description ?? null,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        enabledItemCount: 0,
    };
}

export async function getOwnedStack(db: Database, userId: string, id: string): Promise<OwnedStack | null> {
    const row = await findOwnedStackRow(db, userId, id);
    if (!row) return null;
    const summary = mapStack(row);
    const items = await loadItems(db, id);
    return {
        ...summary,
        itemCount: items.length,
        enabledItemCount: items.filter(item => item.enabled).length,
        items,
    };
}

export async function updateStack(
    db: Database,
    userId: string,
    id: string,
    changes: UpdateStackInput,
    now = Date.now(),
): Promise<boolean> {
    const current = await findOwnedStackRow(db, userId, id);
    if (!current) return false;

    const nextSlug = changes.slug ?? current.slug;
    const slugChanged = nextSlug !== current.slug;
    if (slugChanged) {
        const currentSlugOwner = await db.prepare(`
            SELECT id
            FROM stacks
            WHERE user_id = ? AND slug = ? AND id != ?
            LIMIT 1
        `).bind(userId, nextSlug, id).first<{ id: string }>();
        const historyOwner = await db.prepare(`
            SELECT stack_id
            FROM stack_slug_history
            WHERE user_id = ? AND slug = ?
            LIMIT 1
        `).bind(userId, nextSlug).first<{ stack_id: string }>();
        if (currentSlugOwner || (historyOwner && historyOwner.stack_id !== id)) {
            throw new StackSlugTakenError();
        }
    }

    const statements: BoundStatement[] = [];
    if (slugChanged) {
        statements.push(db.prepare(`
            DELETE FROM stack_slug_history
            WHERE user_id = ? AND slug = ? AND stack_id = ?
        `).bind(userId, nextSlug, id));
        statements.push(db.prepare(`
            INSERT INTO stack_slug_history (user_id, slug, stack_id)
            VALUES (?, ?, ?)
        `).bind(userId, current.slug, id));
    }
    statements.push(db.prepare(`
        UPDATE stacks
        SET title = ?, description = ?, slug = ?, is_public = ?, updated_at = ?
        WHERE user_id = ? AND id = ?
    `).bind(
        changes.title ?? current.title,
        changes.description !== undefined ? changes.description : current.description,
        nextSlug,
        changes.isPublic === undefined ? current.is_public : Number(changes.isPublic),
        now,
        userId,
        id,
    ));

    try {
        await db.batch(statements);
    } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed: stacks\.(user_id, slug)|UNIQUE constraint failed: stack_slug_history\.(user_id, slug)/i.test(error.message)) {
            throw new StackSlugTakenError();
        }
        throw error;
    }
    return true;
}

export async function replaceItems(
    db: Database,
    userId: string,
    id: string,
    items: StackItemInput[],
    now = Date.now(),
): Promise<boolean> {
    if (!await findOwnedStackRow(db, userId, id)) return false;

    const statements: BoundStatement[] = [
        db.prepare('DELETE FROM stack_items WHERE stack_id = ?').bind(id),
    ];
    items.forEach((item, position) => {
        statements.push(db.prepare(`
            INSERT INTO stack_items (stack_id, tool_slug, position, purpose, usage_notes, enabled)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(id, item.slug, position, item.purpose, item.usageNotes, Number(item.enabled)));
    });
    statements.push(db.prepare(`
        UPDATE stacks
        SET updated_at = ?
        WHERE user_id = ? AND id = ?
    `).bind(now, userId, id));

    await db.batch(statements);
    return true;
}

export async function appendItem(
    db: Database,
    userId: string,
    id: string,
    input: AppendItemInput,
    now = Date.now(),
): Promise<AppendItemResult> {
    if (!await findOwnedStackRow(db, userId, id)) return { status: 'not_found' };

    const existing = await db.prepare(`
        SELECT tool_slug, position, purpose, usage_notes, enabled
        FROM stack_items
        WHERE stack_id = ? AND tool_slug = ?
        LIMIT 1
    `).bind(id, input.slug).first<StackItemRow>();
    if (existing) return { status: 'exists', item: mapItem(existing) };

    const aggregate = await db.prepare(`
        SELECT COUNT(*) AS item_count, MAX(position) AS max_position
        FROM stack_items
        WHERE stack_id = ?
    `).bind(id).first<{ item_count: number; max_position: number | null }>();
    if (Number(aggregate?.item_count ?? 0) >= MAX_ITEMS_PER_STACK) return { status: 'limit' };

    const item: StackItem = {
        slug: input.slug,
        position: (aggregate?.max_position ?? -1) + 1,
        purpose: input.purpose,
        usageNotes: input.usageNotes ?? null,
        enabled: true,
    };
    try {
        await db.batch([
            db.prepare(`
                INSERT INTO stack_items (stack_id, tool_slug, position, purpose, usage_notes, enabled)
                VALUES (?, ?, ?, ?, ?, 1)
            `).bind(id, item.slug, item.position, item.purpose, item.usageNotes),
            db.prepare('UPDATE stacks SET updated_at = ? WHERE user_id = ? AND id = ?').bind(now, userId, id),
        ]);
    } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed: stack_items\.stack_id, stack_items\.tool_slug/i.test(error.message)) {
            const racedItem = await db.prepare(`
                SELECT tool_slug, position, purpose, usage_notes, enabled
                FROM stack_items
                WHERE stack_id = ? AND tool_slug = ?
                LIMIT 1
            `).bind(id, input.slug).first<StackItemRow>();
            if (racedItem) return { status: 'exists', item: mapItem(racedItem) };
        }
        throw error;
    }
    return { status: 'added', item };
}

export async function deleteStack(db: Database, userId: string, id: string): Promise<boolean> {
    const result = await db.prepare(`
        DELETE FROM stacks
        WHERE user_id = ? AND id = ?
    `).bind(userId, id).run();
    return (result.meta?.changes ?? 0) > 0;
}

export async function getPublicStack(
    db: Database,
    username: string,
    slug: string,
): Promise<PublicStackResult> {
    const usernameLookup = await findUserByUsername(db, username);
    const user = usernameLookup?.user;
    if (!user?.username) return { status: 'not_found' };

    const row = await db.prepare(`
        SELECT
            s.id, s.user_id, s.slug, s.title, s.description, s.is_public,
            s.created_at, s.updated_at, u.username, u.display_name
        FROM stacks s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ? AND s.slug = ? AND s.is_public = 1
        LIMIT 1
    `).bind(user.id, slug).first<StackRow>();

    if (row) {
        if (usernameLookup?.redirectTo) {
            return { status: 'redirect', username: user.username, slug: row.slug };
        }
        const items = await loadItems(db, row.id, true);
        return {
            status: 'found',
            stack: {
                ...mapStack(row),
                username: row.username ?? user.username,
                displayName: row.display_name ?? user.displayName,
                items,
                itemCount: items.length,
                enabledItemCount: items.length,
            },
        };
    }

    const historicalSlug = await db.prepare(`
        SELECT s.slug
        FROM stack_slug_history h
        JOIN stacks s ON s.id = h.stack_id
        WHERE h.user_id = ? AND h.slug = ? AND s.is_public = 1
        LIMIT 1
    `).bind(user.id, slug).first<{ slug: string }>();
    if (historicalSlug) {
        return { status: 'redirect', username: user.username, slug: historicalSlug.slug };
    }

    return { status: 'not_found' };
}

export async function listPublicStacksByUser(db: Database, userId: string): Promise<StackSummary[]> {
    const result = await db.prepare(`
        SELECT
            s.id, s.user_id, s.slug, s.title, s.description, s.is_public,
            s.created_at, s.updated_at,
            COUNT(i.tool_slug) AS item_count,
            SUM(CASE WHEN i.enabled = 1 THEN 1 ELSE 0 END) AS enabled_item_count
        FROM stacks s
        LEFT JOIN stack_items i ON i.stack_id = s.id
        WHERE s.user_id = ? AND s.is_public = 1
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    `).bind(userId).all<StackRow>();
    return (result.results ?? []).map(mapStack);
}

export async function listPublicStacksForSitemap(db: Database, limit = 5000): Promise<SitemapStack[]> {
    const result = await db.prepare(`
        SELECT s.slug, s.updated_at, u.username
        FROM stacks s
        JOIN users u ON u.id = s.user_id
        WHERE s.is_public = 1
            AND u.username IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM stack_items i
                WHERE i.stack_id = s.id AND i.enabled = 1
            )
        ORDER BY s.updated_at DESC
        LIMIT ?
    `).bind(Math.max(0, Math.trunc(limit))).all<{
        username: string;
        slug: string;
        updated_at: number;
    }>();

    return (result.results ?? []).map(row => ({
        username: row.username,
        slug: row.slug,
        updatedAt: row.updated_at,
    }));
}

export async function listPublicStackProfileUsernames(db: Database): Promise<string[]> {
    const result = await db.prepare(`
        SELECT DISTINCT u.username
        FROM users u
        JOIN stacks s ON s.user_id = u.id
        WHERE s.is_public = 1 AND u.username IS NOT NULL
        ORDER BY u.username
    `).bind().all<{ username: string }>();
    return (result.results ?? []).map(row => row.username);
}
