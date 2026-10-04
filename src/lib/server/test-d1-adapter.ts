import { Database as SqliteDatabase, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import type { Database } from './db';

const migrations = [
    new URL('../../../migrations/0001_accounts_and_favorites.sql', import.meta.url),
    new URL('../../../migrations/0002_flatten_user_identity.sql', import.meta.url),
    new URL('../../../migrations/0003_enforce_flattened_user_identity.sql', import.meta.url),
    new URL('../../../migrations/0004_user_activity_columns.sql', import.meta.url),
    new URL('../../../migrations/0005_follows.sql', import.meta.url),
    new URL('../../../migrations/0006_notification_prefs.sql', import.meta.url),
    new URL('../../../migrations/0007_news_prefs.sql', import.meta.url),
    new URL('../../../migrations/0008_onboarding.sql', import.meta.url),
    new URL('../../../migrations/0009_tool_stacks.sql', import.meta.url),
];

export function createTestDatabase() {
    const sqlite = new SqliteDatabase(':memory:');
    for (const migration of migrations) {
        const statements = readFileSync(migration, 'utf8')
            .split(';')
            .map(statement => statement.trim())
            .filter(Boolean);
        statements.forEach(statement => sqlite.exec(`${statement};`));
    }

    const db = {
        prepare(sql: string) {
            return {
                bind(...values: SQLQueryBindings[]) {
                    return {
                        all: async <T>() => ({
                            results: sqlite.query(sql).all(...values) as T[],
                        }),
                        first: async <T>() => (sqlite.query(sql).get(...values) as T | null) ?? null,
                        run: async () => {
                            const result = sqlite.query(sql).run(...values);
                            return { meta: { changes: result.changes } };
                        },
                    };
                },
            };
        },
        batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) results.push(await statement.run());
                sqlite.exec('COMMIT');
                return results;
            } catch (error) {
                sqlite.exec('ROLLBACK');
                throw error;
            }
        },
    } as unknown as Database;

    return { db, sqlite };
}

export function addTestUser(
    sqlite: SqliteDatabase,
    id: string,
    displayName = id,
): void {
    const providerUserId = id.replace(/^github:/, '');
    sqlite.query(`
        INSERT INTO users (
            id, provider, provider_user_id, display_name, email,
            created_at, updated_at
        ) VALUES (?, 'github', ?, ?, ?, 1, 1)
    `).run(id, providerUserId, displayName, `${providerUserId}@example.com`);
}
