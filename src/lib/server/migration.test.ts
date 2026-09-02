import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration1 = new URL('../../../migrations/0001_accounts_and_favorites.sql', import.meta.url);
const migration2 = new URL('../../../migrations/0002_flatten_user_identity.sql', import.meta.url);
const migration3 = new URL('../../../migrations/0003_enforce_flattened_user_identity.sql', import.meta.url);
const migration4 = new URL('../../../migrations/0004_user_activity_columns.sql', import.meta.url);
const migration5 = new URL('../../../migrations/0005_follows.sql', import.meta.url);

function applyMigration(db: Database, migration: URL) {
    const statements = readFileSync(migration, 'utf8')
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean);
    statements.forEach(statement => db.exec(`${statement};`));
}

function insertLegacyUser(db: Database, withIdentity = true) {
    db.run(
        'INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ['legacy-user', 'Ada', 1, 1],
    );
    if (withIdentity) {
        db.run(
            'INSERT INTO auth_identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
            ['github', '42', 'legacy-user', 1],
        );
    }
}

describe('accounts and favorites migrations', () => {
    test('adds durable user activity columns and backfills last seen', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        insertLegacyUser(db);
        applyMigration(db, migration2);
        applyMigration(db, migration3);
        applyMigration(db, migration4);
        applyMigration(db, migration5);

        expect(db.query('SELECT last_seen_at FROM users').get()).toEqual({ last_seen_at: 1 });
        expect(db.query("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'index' AND name IN ('users_created_at_idx', 'users_last_seen_at_idx')").get()).toEqual({ count: 2 });
        expect(db.query("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'index' AND name = 'follows_user_created_idx'").get()).toEqual({ count: 1 });
    });

    test('normalizes existing identities and preserves related rows', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        insertLegacyUser(db);
        db.run(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
            ['token-hash', 'legacy-user', 1, 100],
        );
        db.run(
            'INSERT INTO favorites (user_id, tool_slug, created_at) VALUES (?, ?, ?)',
            ['legacy-user', 'cursor', 2],
        );
        applyMigration(db, migration2);
        applyMigration(db, migration3);

        expect(db.query('SELECT id, provider, provider_user_id FROM users').get()).toEqual({
            id: 'github:42',
            provider: 'github',
            provider_user_id: '42',
        });
        expect(db.query('SELECT user_id FROM sessions').get()).toEqual({ user_id: 'github:42' });
        expect(db.query('SELECT user_id FROM favorites').get()).toEqual({ user_id: 'github:42' });
        expect(db.query("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'auth_identities'").get()).toEqual({ count: 0 });

        const columns = db.query("PRAGMA table_info('users')").all() as Array<{
            name: string;
            notnull: number;
        }>;
        expect(columns.find(column => column.name === 'provider')?.notnull).toBe(1);
        expect(columns.find(column => column.name === 'provider_user_id')?.notnull).toBe(1);
        expect(() => db.run(
            `INSERT INTO users (
                id, provider, provider_user_id, display_name, email_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['other:7', 'other', '7', 'Invalid', 0, 1, 1],
        )).toThrow();
        expect(() => db.run(
            `INSERT INTO users (
                id, provider, provider_user_id, display_name, email_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['legacy-id', 'google', '7', 'Invalid', 0, 1, 1],
        )).toThrow();

        expect(() => db.run(
            'INSERT INTO favorites (user_id, tool_slug, created_at) VALUES (?, ?, ?)',
            ['github:42', 'cursor', 3],
        )).toThrow();
        db.run('DELETE FROM users WHERE id = ?', ['github:42']);
        expect(db.query('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 });
        expect(db.query('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 0 });
        db.close();
    });

    test('finishes the rebuild when staging already dropped auth identities', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        insertLegacyUser(db);
        applyMigration(db, migration2);
        db.exec('DROP TABLE auth_identities');

        applyMigration(db, migration3);

        expect(db.query('SELECT id FROM users').get()).toEqual({ id: 'github:42' });
        db.close();
    });

    test('aborts before rebuilding a user that has no provider identity', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        insertLegacyUser(db, false);
        applyMigration(db, migration2);

        expect(() => applyMigration(db, migration3)).toThrow();
        expect(db.query('SELECT id FROM users').get()).toEqual({ id: 'legacy-user' });
        expect(db.query("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'auth_identities'").get()).toEqual({ count: 1 });
        db.close();
    });

    test('aborts rather than dropping orphaned related rows', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        applyMigration(db, migration2);
        db.exec('PRAGMA foreign_keys = OFF');
        db.run(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
            ['orphan-token', 'missing-user', 1, 100],
        );
        db.exec('PRAGMA foreign_keys = ON');

        expect(db.query(`
            SELECT COUNT(*) AS count
            FROM sessions
            LEFT JOIN users ON users.id = sessions.user_id
            WHERE users.id IS NULL
        `).get()).toEqual({ count: 1 });
        expect(() => applyMigration(db, migration3)).toThrow();
        expect(db.query('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 1 });
        db.close();
    });
});
