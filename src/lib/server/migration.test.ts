import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration1 = new URL('../../../migrations/0001_accounts_and_favorites.sql', import.meta.url);
const migration2 = new URL('../../../migrations/0002_flatten_user_identity.sql', import.meta.url);
const migration3 = new URL('../../../migrations/0003_enforce_flattened_user_identity.sql', import.meta.url);
const migration4 = new URL('../../../migrations/0004_user_activity_columns.sql', import.meta.url);
const migration5 = new URL('../../../migrations/0005_follows.sql', import.meta.url);
const migration6 = new URL('../../../migrations/0006_notification_prefs.sql', import.meta.url);
const migration7 = new URL('../../../migrations/0007_news_prefs.sql', import.meta.url);
const migration8 = new URL('../../../migrations/0008_onboarding.sql', import.meta.url);
const migration9 = new URL('../../../migrations/0009_tool_stacks.sql', import.meta.url);
const migration10 = new URL('../../../migrations/0010_zaps.sql', import.meta.url);
const migration11 = new URL('../../../migrations/0011_email_otp.sql', import.meta.url);

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
    test('adds notification preferences and email log tables', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        applyMigration(db, migration2);
        applyMigration(db, migration3);
        applyMigration(db, migration4);
        applyMigration(db, migration6);
        applyMigration(db, migration7);

        const tables = db.query(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name IN ('notification_prefs', 'email_log')
            ORDER BY name
        `).all();
        expect(tables).toEqual([{ name: 'email_log' }, { name: 'notification_prefs' }]);
        expect(db.query(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'index' AND name = 'email_log_user_sent_idx'
        `).get()).toEqual({ name: 'email_log_user_sent_idx' });

        db.run(
            'INSERT INTO users (id, provider, provider_user_id, display_name, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['github:42', 'github', '42', 'Ada', 1, 1, 1],
        );
        db.run(
            'INSERT INTO notification_prefs (user_id, unsubscribe_token, updated_at) VALUES (?, ?, ?)',
            ['github:42', 'token', 2],
        );
        expect(db.query('SELECT email_enabled, news_enabled, last_digest_sent_at FROM notification_prefs').get()).toEqual({
            email_enabled: 1,
            news_enabled: 0,
            last_digest_sent_at: null,
        });
        expect(() => db.run(
            'UPDATE notification_prefs SET news_enabled = ? WHERE user_id = ?',
            [2, 'github:42'],
        )).toThrow();
        expect(() => db.run(
            'INSERT INTO notification_prefs (user_id, unsubscribe_token, updated_at) VALUES (?, ?, ?)',
            ['github:42', 'other-token', 3],
        )).toThrow();
        db.run('DELETE FROM users WHERE id = ?', ['github:42']);
        expect(db.query('SELECT COUNT(*) AS count FROM notification_prefs').get()).toEqual({ count: 0 });
        db.close();
    });

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

    test('adds per-user onboarding progress that cascades with the account', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        insertLegacyUser(db);
        applyMigration(db, migration2);
        applyMigration(db, migration3);
        applyMigration(db, migration4);
        applyMigration(db, migration5);
        applyMigration(db, migration8);

        const columns = db.query("PRAGMA table_info('user_onboarding')").all() as Array<{
            name: string;
            notnull: number;
        }>;
        expect(columns.map(column => column.name)).toEqual([
            'user_id',
            'badge_completed_at',
            'dismissed_at',
            'completed_at',
            'updated_at',
        ]);
        expect(columns.find(column => column.name === 'updated_at')?.notnull).toBe(1);

        db.run(
            'INSERT INTO user_onboarding (user_id, badge_completed_at, updated_at) VALUES (?, ?, ?)',
            ['github:42', 10, 10],
        );
        expect(db.query('SELECT badge_completed_at, dismissed_at, completed_at FROM user_onboarding').get()).toEqual({
            badge_completed_at: 10,
            dismissed_at: null,
            completed_at: null,
        });
        // One row per user
        expect(() => db.run(
            'INSERT INTO user_onboarding (user_id, updated_at) VALUES (?, ?)',
            ['github:42', 20],
        )).toThrow();
        // Rows follow account deletion
        db.run('DELETE FROM users WHERE id = ?', ['github:42']);
        expect(db.query('SELECT COUNT(*) AS count FROM user_onboarding').get()).toEqual({ count: 0 });
        db.close();
    });

    test('adds usernames, username history, and shareable tool stacks', () => {
        const db = new Database(':memory:');
        applyMigration(db, migration1);
        applyMigration(db, migration2);
        applyMigration(db, migration3);
        applyMigration(db, migration4);
        applyMigration(db, migration5);
        applyMigration(db, migration6);
        applyMigration(db, migration7);
        applyMigration(db, migration8);
        applyMigration(db, migration9);

        const userColumns = db.query("PRAGMA table_info('users')").all() as Array<{ name: string }>;
        expect(userColumns.some(column => column.name === 'username')).toBe(true);
        expect(db.query(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name IN ('username_history', 'stacks', 'stack_slug_history', 'stack_items')
            ORDER BY name
        `).all()).toEqual([
            { name: 'stack_items' },
            { name: 'stack_slug_history' },
            { name: 'stacks' },
            { name: 'username_history' },
        ]);
        expect(db.query(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'index' AND name IN (
                'users_username_idx', 'stacks_user_updated_idx',
                'stacks_public_updated_idx', 'stack_items_tool_idx'
            )
            ORDER BY name
        `).all()).toEqual([
            { name: 'stack_items_tool_idx' },
            { name: 'stacks_public_updated_idx' },
            { name: 'stacks_user_updated_idx' },
            { name: 'users_username_idx' },
        ]);

        db.run(
            'INSERT INTO users (id, provider, provider_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['github:42', 'github', '42', 'Ada', 1, 1],
        );
        db.run('UPDATE users SET username = ? WHERE id = ?', ['ada', 'github:42']);
        expect(() => db.run(
            'INSERT INTO users (id, provider, provider_user_id, display_name, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['github:43', 'github', '43', 'Ada Two', 'ada', 1, 1],
        )).toThrow();
        db.run(
            'INSERT INTO stacks (id, user_id, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['stack-id', 'github:42', 'my-stack', 'My stack', 1, 1],
        );
        expect(() => db.run(
            'INSERT INTO stacks (id, user_id, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['invalid-stack', 'github:42', 'my-stack', 'Other', 1, 1],
        )).toThrow();
        expect(() => db.run('UPDATE stacks SET is_public = 2 WHERE id = ?', ['stack-id'])).toThrow();
        expect(() => db.run(
            'INSERT INTO stack_items (stack_id, tool_slug, position, purpose, enabled) VALUES (?, ?, ?, ?, ?)',
            ['stack-id', 'cursor', 0, 'Code', 2],
        )).toThrow();

        db.run(
            'INSERT INTO stack_items (stack_id, tool_slug, position, purpose) VALUES (?, ?, ?, ?)',
            ['stack-id', 'cursor', 0, 'Code'],
        );
        db.run('DELETE FROM users WHERE id = ?', ['github:42']);
        expect(db.query('SELECT COUNT(*) AS count FROM stacks').get()).toEqual({ count: 0 });
        expect(db.query('SELECT COUNT(*) AS count FROM stack_items').get()).toEqual({ count: 0 });
        db.close();
    });

    test('preserves every user-dependent row and adds email OTP storage', () => {
        const db = new Database(':memory:');
        for (const migration of [
            migration1,
            migration2,
            migration3,
            migration4,
            migration5,
            migration6,
            migration7,
            migration8,
            migration9,
            migration10,
        ]) {
            applyMigration(db, migration);
        }

        db.run(`
            INSERT INTO users (
                id, provider, provider_user_id, display_name, email, email_verified,
                created_at, updated_at, last_seen_at, username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, ['google:42', 'google', '42', 'Ada Lovelace', 'ada@example.com', 1, 1, 2, 3, 'ada']);
        db.run(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
            ['session-hash', 'google:42', 100, 200],
        );
        db.run(
            'INSERT INTO favorites (user_id, tool_slug, created_at) VALUES (?, ?, ?)',
            ['google:42', 'cursor', 101],
        );
        db.run(
            'INSERT INTO follows (user_id, tool_slug, created_at) VALUES (?, ?, ?)',
            ['google:42', 'claude-code', 102],
        );
        db.run(`
            INSERT INTO notification_prefs (
                user_id, email_enabled, unsubscribe_token, last_digest_sent_at, updated_at, news_enabled
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, ['google:42', 1, 'unsubscribe-42', 103, 104, 1]);
        db.run(
            'INSERT INTO email_log (user_id, kind, tool_slugs, message_id, sent_at) VALUES (?, ?, ?, ?, ?)',
            ['google:42', 'digest', 'cursor', 'message-42', 105],
        );
        db.run(
            'INSERT INTO user_onboarding (user_id, badge_completed_at, dismissed_at, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            ['google:42', 106, 107, 108, 109],
        );
        db.run(
            'INSERT INTO username_history (username, user_id, retired_at) VALUES (?, ?, ?)',
            ['ada-old', 'google:42', 110],
        );
        db.run(
            'INSERT INTO stacks (id, user_id, slug, title, description, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['stack-42', 'google:42', 'ada-stack', 'Ada stack', 'A saved setup', 1, 111, 112],
        );
        db.run(
            'INSERT INTO stack_slug_history (user_id, slug, stack_id) VALUES (?, ?, ?)',
            ['google:42', 'ada-previous', 'stack-42'],
        );
        db.run(
            'INSERT INTO stack_items (stack_id, tool_slug, position, purpose, usage_notes, enabled) VALUES (?, ?, ?, ?, ?, ?)',
            ['stack-42', 'cursor', 1, 'Build', 'Use for implementation', 1],
        );
        db.run(
            'INSERT INTO zap_votes (tool_id, voter_id, created_at, source) VALUES (?, ?, ?, ?)',
            ['cursor', 'google:42', 113, 'd1'],
        );
        db.run('INSERT INTO zap_legacy_counts (tool_id, count) VALUES (?, ?)', ['cursor', 7]);

        const tables = [
            'users',
            'sessions',
            'favorites',
            'follows',
            'notification_prefs',
            'email_log',
            'user_onboarding',
            'username_history',
            'stacks',
            'stack_slug_history',
            'stack_items',
            'zap_votes',
            'zap_legacy_counts',
        ];
        const snapshot = () => Object.fromEntries(tables.map(table => [
            table,
            db.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]));
        const before = snapshot();
        expect(db.query("SELECT name FROM sqlite_schema WHERE type = 'trigger'").all()).toEqual([]);

        applyMigration(db, migration11);

        expect(snapshot()).toEqual(before);
        expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(db.query("PRAGMA foreign_key_list('sessions')").all()).toContainEqual(
            expect.objectContaining({ table: 'users', on_delete: 'CASCADE' }),
        );
        expect(db.query(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'index'
                AND name IN (
                    'users_provider_identity_idx',
                    'users_created_at_idx',
                    'users_last_seen_at_idx',
                    'users_username_idx',
                    'email_otps_email_created_idx'
                )
            ORDER BY name
        `).all()).toEqual([
            { name: 'email_otps_email_created_idx' },
            { name: 'users_created_at_idx' },
            { name: 'users_last_seen_at_idx' },
            { name: 'users_provider_identity_idx' },
            { name: 'users_username_idx' },
        ]);

        const emailId = `email:${'a'.repeat(32)}`;
        db.run(`
            INSERT INTO users (
                id, provider, provider_user_id, display_name, email, email_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [emailId, 'email', 'a'.repeat(32), 'Ada', 'ada@example.com', 1, 200, 200]);
        expect(() => db.run(`
            INSERT INTO users (
                id, provider, provider_user_id, display_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, ['bogus:7', 'bogus', '7', 'Invalid', 200, 200])).toThrow();

        db.run('DELETE FROM users WHERE id = ?', ['google:42']);
        for (const table of [
            'sessions',
            'favorites',
            'follows',
            'notification_prefs',
            'user_onboarding',
            'username_history',
            'stacks',
            'stack_slug_history',
            'stack_items',
        ]) {
            expect(db.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
        }
        expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
        db.close();
    });
});
