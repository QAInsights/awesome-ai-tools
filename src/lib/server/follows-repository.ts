import type { Database } from './db';

export interface FollowRecord {
    slug: string;
    createdAt: number;
}

export interface FollowWriteResult {
    follow: FollowRecord;
    created: boolean;
}

interface FollowRow {
    tool_slug: string;
    created_at: number;
}

export async function listFollows(db: Database, userId: string): Promise<FollowRecord[]> {
    const result = await db.prepare(`
        SELECT tool_slug, created_at
        FROM follows
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).bind(userId).all<FollowRow>();

    return (result.results ?? []).map(row => ({
        slug: row.tool_slug,
        createdAt: row.created_at,
    }));
}

export async function addFollow(
    db: Database,
    userId: string,
    slug: string,
    createdAt = Date.now(),
): Promise<FollowWriteResult> {
    const result = await db.prepare(`
        INSERT OR IGNORE INTO follows (user_id, tool_slug, created_at)
        VALUES (?, ?, ?)
        RETURNING tool_slug, created_at
    `).bind(userId, slug, createdAt).run<FollowRow>();
    const inserted = result.results?.[0];
    if (inserted) {
        return {
            follow: { slug: inserted.tool_slug, createdAt: inserted.created_at },
            created: true,
        };
    }

    const existing = await db.prepare(`
        SELECT tool_slug, created_at
        FROM follows
        WHERE user_id = ? AND tool_slug = ?
    `).bind(userId, slug).first<FollowRow>();
    if (!existing) throw new Error('Follow insert did not return or persist a row');

    return {
        follow: { slug: existing.tool_slug, createdAt: existing.created_at },
        created: false,
    };
}

export async function followWithFavorite(
    db: Database,
    userId: string,
    slug: string,
    createdAt = Date.now(),
): Promise<FollowWriteResult> {
    const results = await db.batch([
        db.prepare(`
            INSERT OR IGNORE INTO follows (user_id, tool_slug, created_at)
            VALUES (?, ?, ?)
            RETURNING tool_slug, created_at
        `).bind(userId, slug, createdAt),
        db.prepare(`
            INSERT OR IGNORE INTO favorites (user_id, tool_slug, created_at)
            VALUES (?, ?, ?)
            RETURNING tool_slug, created_at
        `).bind(userId, slug, createdAt),
    ]);
    const inserted = results[0]?.results?.[0] as FollowRow | undefined;
    if (inserted) {
        return {
            follow: { slug: inserted.tool_slug, createdAt: inserted.created_at },
            created: true,
        };
    }

    const existing = await db.prepare(`
        SELECT tool_slug, created_at
        FROM follows
        WHERE user_id = ? AND tool_slug = ?
    `).bind(userId, slug).first<FollowRow>();
    if (!existing) throw new Error('Follow insert did not return or persist a row');

    return {
        follow: { slug: existing.tool_slug, createdAt: existing.created_at },
        created: false,
    };
}

export async function removeFollow(
    db: Database,
    userId: string,
    slug: string,
): Promise<boolean> {
    const result = await db.prepare(`
        DELETE FROM follows
        WHERE user_id = ? AND tool_slug = ?
    `).bind(userId, slug).run();

    return (result.meta?.changes ?? 0) > 0;
}
