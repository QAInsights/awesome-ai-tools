import { Database as SqliteDatabase } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Database } from './db';
import { runDigest, type DigestToolSource } from './digest';
import type { EmailSendResult, OutboundEmail } from './email';

const migrations = [
    new URL('../../../migrations/0001_accounts_and_favorites.sql', import.meta.url),
    new URL('../../../migrations/0002_flatten_user_identity.sql', import.meta.url),
    new URL('../../../migrations/0003_enforce_flattened_user_identity.sql', import.meta.url),
    new URL('../../../migrations/0004_user_activity_columns.sql', import.meta.url),
    new URL('../../../migrations/0005_follows.sql', import.meta.url),
    new URL('../../../migrations/0006_notification_prefs.sql', import.meta.url),
];

function applyMigrations(db: SqliteDatabase) {
    for (const migration of migrations) {
        const statements = readFileSync(migration, 'utf8')
            .split(';')
            .map(statement => statement.trim())
            .filter(Boolean);
        statements.forEach(statement => db.exec(`${statement};`));
    }
}

function makeDatabase() {
    const sqlite = new SqliteDatabase(':memory:');
    applyMigrations(sqlite);
    const db = {
        prepare(sql: string) {
            return {
                bind(...values: unknown[]) {
                    return {
                        all: async <T>() => ({
                            results: sqlite.query(sql).all(...values) as T[],
                        }),
                        first: async <T>() => (sqlite.query(sql).get(...values) as T | null) ?? null,
                        run: async () => ({
                            meta: { changes: sqlite.query(sql).run(...values).changes },
                        }),
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

function addUser(
    db: SqliteDatabase,
    {
        id,
        email = `${id.replace('github:', '')}@example.com`,
        emailVerified = 1,
        createdAt = 1_000,
    }: {
        id: string;
        email?: string | null;
        emailVerified?: number;
        createdAt?: number;
    },
) {
    const providerUserId = id.replace(/^github:/, '');
    db.query(`
        INSERT INTO users (
            id, provider, provider_user_id, display_name, email, email_verified, created_at, updated_at
        ) VALUES (?, 'github', ?, ?, ?, ?, ?, ?)
    `).run(id, providerUserId, id, email, emailVerified, createdAt, createdAt);
}

function addFollow(db: SqliteDatabase, userId: string, slug: string, createdAt: number) {
    db.query('INSERT INTO follows (user_id, tool_slug, created_at) VALUES (?, ?, ?)').run(userId, slug, createdAt);
}

function addPrefs(db: SqliteDatabase, userId: string, token: string, emailEnabled = 1, lastDigestSentAt: number | null = null) {
    db.query(`
        INSERT INTO notification_prefs (user_id, email_enabled, unsubscribe_token, last_digest_sent_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, emailEnabled, token, lastDigestSentAt, 1_000);
}

const tool: DigestToolSource = {
    slug: 'cursor',
    name: 'Cursor',
    description: 'An AI editor',
    recentUpdates: 'A new release',
    lastUpdated: '2026-09-01',
};

function sender(
    result: EmailSendResult = { messageId: 'message-1', dryRun: false },
    calls: OutboundEmail[] = [],
) {
    return {
        calls,
        sendEmail: async (message: OutboundEmail) => {
            calls.push(message);
            return result;
        },
    };
}

describe('digest service', () => {
    test('has no candidates when there are no follows', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a' });
        const mail = sender();

        await expect(runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
        })).resolves.toMatchObject({ candidates: 0, sent: 0, skippedNoChanges: 0, failed: 0 });
        expect(mail.calls).toHaveLength(0);
        sqlite.close();
    });

    test('sends a digest for a followed tool that changed', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a', email: 'ada@example.com' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'unsubscribe-a');
        const mail = sender();

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
        });

        expect(summary).toMatchObject({ candidates: 1, sent: 1, skippedNoChanges: 0, failed: 0, dryRun: false });
        expect(mail.calls[0]?.subject).toMatch(/^Updates for 1 tools/);
        expect(mail.calls[0]?.unsubscribeUrl).toBe('https://ai.dosa.dev/unsubscribe?token=unsubscribe-a');
        expect(sqlite.query('SELECT tool_slugs, message_id FROM email_log').get()).toEqual({
            tool_slugs: '["cursor@2026-09-01"]',
            message_id: 'message-1',
        });
        expect(sqlite.query('SELECT last_digest_sent_at FROM notification_prefs').get()).toEqual({
            last_digest_sent_at: Date.parse('2026-09-02'),
        });
        sqlite.close();
    });

    test('does not persist a dry-run send', async () => {
        const { db, sqlite } = makeDatabase();
        const sentAt = Date.parse('2026-08-01');
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-07-01'));
        addPrefs(sqlite, 'github:user-a', 'token-a', 1, sentAt);
        const mail = sender({ messageId: null, dryRun: true });

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
        });

        expect(summary).toMatchObject({ candidates: 1, sent: 1, dryRun: true });
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_log').get()).toEqual({ count: 0 });
        expect(sqlite.query('SELECT last_digest_sent_at FROM notification_prefs WHERE user_id = ?').get('github:user-a')).toEqual({
            last_digest_sent_at: sentAt,
        });
        sqlite.close();
    });

    test('skips a tool last updated before the follow was created', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-09-02'));
        const mail = sender();

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-03'),
        });

        expect(summary).toMatchObject({ candidates: 1, sent: 0, skippedNoChanges: 1 });
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_log').get()).toEqual({ count: 0 });
        sqlite.close();
    });

    test('excludes users with disabled email preferences', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'unsubscribe-a', 0);

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: sender().sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(summary.candidates).toBe(0);
        sqlite.close();
    });

    test('excludes users without a verified email address', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:unverified', emailVerified: 0 });
        addUser(sqlite, { id: 'github:missing-email', email: null });
        addFollow(sqlite, 'github:unverified', 'cursor', Date.parse('2026-08-01'));
        addFollow(sqlite, 'github:missing-email', 'cursor', Date.parse('2026-08-01'));

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: sender().sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(summary.candidates).toBe(0);
        sqlite.close();
    });

    test('deduplicates a same-day rerun using the latest digest log', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'unsubscribe-a');
        const mail = sender();
        const options = {
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
            minIntervalDays: 0,
        };

        await runDigest(options);
        const second = await runDigest(options);

        expect(second).toMatchObject({ candidates: 1, sent: 0, skippedNoChanges: 1 });
        expect(mail.calls).toHaveLength(1);
        sqlite.close();
    });

    test('continues sending when one user fails', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a', createdAt: 1 });
        addUser(sqlite, { id: 'github:user-b', createdAt: 2 });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addFollow(sqlite, 'github:user-b', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'token-a');
        addPrefs(sqlite, 'github:user-b', 'token-b');
        const calls: OutboundEmail[] = [];

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: async message => {
                calls.push(message);
                if (message.to === 'user-a@example.com') throw new Error('send failed');
                return { messageId: 'message-b', dryRun: false };
            },
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
        });

        expect(summary).toMatchObject({ candidates: 2, sent: 1, failed: 1 });
        expect(summary.errors).toEqual(['github:user-a: send failed']);
        expect(calls.map(call => call.to)).toEqual(['user-a@example.com', 'user-b@example.com']);
        sqlite.close();
    });

    test('creates missing preferences lazily before sending', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        const mail = sender();

        await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: Date.parse('2026-09-02'),
        });

        const prefs = sqlite.query('SELECT email_enabled, unsubscribe_token FROM notification_prefs WHERE user_id = ?').get('github:user-a') as {
            email_enabled: number;
            unsubscribe_token: string;
        };
        expect(prefs.email_enabled).toBe(1);
        expect(prefs.unsubscribe_token).toBeTruthy();
        expect(mail.calls[0]?.unsubscribeUrl).toContain(encodeURIComponent(prefs.unsubscribe_token));
        sqlite.close();
    });

    test('skips a changed digest when the previous send was too recent', async () => {
        const { db, sqlite } = makeDatabase();
        const now = Date.parse('2026-09-10');
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'token-a', 1, now - 5 * 86_400_000);
        const mail = sender();

        const summary = await runDigest({
            db,
            tools: [{ ...tool, lastUpdated: '2026-09-10' }],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now,
        });

        expect(summary).toMatchObject({ candidates: 1, skippedTooSoon: 1, sent: 0 });
        expect(mail.calls).toHaveLength(0);
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_log').get()).toEqual({ count: 0 });
        sqlite.close();
    });

    test('sends a changed digest after the minimum spacing interval', async () => {
        const { db, sqlite } = makeDatabase();
        const now = Date.parse('2026-09-15');
        addUser(sqlite, { id: 'github:user-a' });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addPrefs(sqlite, 'github:user-a', 'token-a', 1, Date.parse('2026-09-01'));
        const mail = sender();

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now,
        });

        expect(summary).toMatchObject({ candidates: 1, skippedTooSoon: 0, sent: 1 });
        expect(mail.calls).toHaveLength(1);
        sqlite.close();
    });

    test('limits the candidate list', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, { id: 'github:user-a', createdAt: 1 });
        addUser(sqlite, { id: 'github:user-b', createdAt: 2 });
        addFollow(sqlite, 'github:user-a', 'cursor', Date.parse('2026-08-01'));
        addFollow(sqlite, 'github:user-b', 'cursor', Date.parse('2026-08-01'));
        const mail = sender();

        const summary = await runDigest({
            db,
            tools: [tool],
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            maxUsers: 1,
            now: Date.parse('2026-09-02'),
        });

        expect(summary.candidates).toBe(1);
        expect(mail.calls).toHaveLength(1);
        expect(mail.calls[0]?.to).toBe('user-a@example.com');
        sqlite.close();
    });
});
