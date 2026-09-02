import type { Database } from './db';

export interface FavoriteRecord {
    slug: string;
    createdAt: number;
}

export interface FavoriteWriteResult {
    favorite: FavoriteRecord;
    created: boolean;
}

interface FavoriteRow {
    tool_slug: string;
    created_at: number;
}

export async function listFavorites(db: Database, userId: string): Promise<FavoriteRecord[]> {
    const result = await db.prepare(`
        SELECT tool_slug, created_at
        FROM favorites
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).bind(userId).all<FavoriteRow>();

    return (result.results ?? []).map(row => ({
        slug: row.tool_slug,
        createdAt: row.created_at,
    }));
}

export async function addFavorite(
    db: Database,
    userId: string,
    slug: string,
    createdAt = Date.now(),
): Promise<FavoriteWriteResult> {
    const result = await db.prepare(`
        INSERT OR IGNORE INTO favorites (user_id, tool_slug, created_at)
        VALUES (?, ?, ?)
        RETURNING tool_slug, created_at
    `).bind(userId, slug, createdAt).run<FavoriteRow>();
    const inserted = result.results?.[0];
    if (inserted) {
        return {
            favorite: { slug: inserted.tool_slug, createdAt: inserted.created_at },
            created: true,
        };
    }

    const existing = await db.prepare(`
        SELECT tool_slug, created_at
        FROM favorites
        WHERE user_id = ? AND tool_slug = ?
    `).bind(userId, slug).first<FavoriteRow>();
    if (!existing) throw new Error('Favorite insert did not return or persist a row');

    return {
        favorite: { slug: existing.tool_slug, createdAt: existing.created_at },
        created: false,
    };
}

export async function removeFavorite(
    db: Database,
    userId: string,
    slug: string,
): Promise<boolean> {
    const result = await db.prepare(`
        DELETE FROM favorites
        WHERE user_id = ? AND tool_slug = ?
    `).bind(userId, slug).run();

    return (result.meta?.changes ?? 0) > 0;
}

export async function removeFavoriteWithFollow(
    db: Database,
    userId: string,
    slug: string,
): Promise<boolean> {
    const results = await db.batch([
        db.prepare(`
            DELETE FROM favorites
            WHERE user_id = ? AND tool_slug = ?
        `).bind(userId, slug),
        db.prepare(`
            DELETE FROM follows
            WHERE user_id = ? AND tool_slug = ?
        `).bind(userId, slug),
    ]);

    return (results[0]?.meta?.changes ?? 0) > 0;
}
