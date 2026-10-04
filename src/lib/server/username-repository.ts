import type { BoundStatement, Database } from './db';

export interface UsernameUser {
    id: string;
    username: string | null;
    displayName: string;
    githubUsername: string | null;
}

interface UsernameRow {
    id: string;
    username: string | null;
    display_name: string;
    github_username: string | null;
}

export class UsernameTakenError extends Error {
    constructor() {
        super('That username is already taken.');
        this.name = 'UsernameTakenError';
    }
}

export class UsernameUserNotFoundError extends Error {
    constructor() {
        super('User account was not found.');
        this.name = 'UsernameUserNotFoundError';
    }
}

export class UsernameChangeLimitError extends Error {
    constructor() {
        super('Username change limit reached.');
        this.name = 'UsernameChangeLimitError';
    }
}

function mapUser(row: UsernameRow): UsernameUser {
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        githubUsername: row.github_username,
    };
}

function isUniqueUsernameError(error: unknown): boolean {
    return error instanceof Error && /UNIQUE constraint failed: (users\.username|username_history\.username)/i.test(error.message);
}

export async function getUsername(db: Database, userId: string): Promise<string | null> {
    const row = await db.prepare(`
        SELECT username
        FROM users
        WHERE id = ?
        LIMIT 1
    `).bind(userId).first<{ username: string | null }>();
    return row?.username ?? null;
}

export async function findUserByUsername(
    db: Database,
    username: string,
): Promise<{ user: UsernameUser; redirectTo?: string } | null> {
    const current = await db.prepare(`
        SELECT id, username, display_name, github_username
        FROM users
        WHERE username = ?
        LIMIT 1
    `).bind(username).first<UsernameRow>();

    if (current) return { user: mapUser(current) };

    const historical = await db.prepare(`
        SELECT u.id, u.username, u.display_name, u.github_username
        FROM username_history h
        JOIN users u ON u.id = h.user_id
        WHERE h.username = ?
        LIMIT 1
    `).bind(username).first<UsernameRow>();
    if (!historical) return null;

    const user = mapUser(historical);
    return {
        user,
        ...(user.username && user.username !== username ? { redirectTo: user.username } : {}),
    };
}

export async function setUsername(
    db: Database,
    userId: string,
    username: string,
    now = Date.now(),
): Promise<void> {
    const currentRow = await db.prepare(`
        SELECT username
        FROM users
        WHERE id = ?
        LIMIT 1
    `).bind(userId).first<{ username: string | null }>();
    if (!currentRow) throw new UsernameUserNotFoundError();
    if (currentRow.username === username) return;

    const currentOwner = await db.prepare(`
        SELECT id
        FROM users
        WHERE username = ? AND id != ?
        LIMIT 1
    `).bind(username, userId).first<{ id: string }>();
    if (currentOwner) throw new UsernameTakenError();

    const historyOwner = await db.prepare(`
        SELECT user_id
        FROM username_history
        WHERE username = ?
        LIMIT 1
    `).bind(username).first<{ user_id: string }>();
    if (historyOwner && historyOwner.user_id !== userId) throw new UsernameTakenError();

    const historyCount = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM username_history
        WHERE user_id = ?
    `).bind(userId).first<{ count: number }>();
    const reclaimingOwnName = historyOwner?.user_id === userId;
    if (currentRow.username && !reclaimingOwnName && (historyCount?.count ?? 0) >= 5) {
        throw new UsernameChangeLimitError();
    }

    const statements: BoundStatement[] = [];
    if (reclaimingOwnName) {
        statements.push(db.prepare(`
            DELETE FROM username_history
            WHERE username = ? AND user_id = ?
        `).bind(username, userId));
    }
    if (currentRow.username) {
        statements.push(db.prepare(`
            INSERT INTO username_history (username, user_id, retired_at)
            VALUES (?, ?, ?)
        `).bind(currentRow.username, userId, now));
    }
    statements.push(db.prepare(`
        UPDATE users
        SET username = ?
        WHERE id = ?
    `).bind(username, userId));

    try {
        await db.batch(statements);
    } catch (error) {
        if (isUniqueUsernameError(error)) throw new UsernameTakenError();
        throw error;
    }
}
