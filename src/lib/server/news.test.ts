import { Database as SqliteDatabase } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Database } from './db';
import { runNewsSend } from './news';
import type { NewsPost } from './news-source';
import type { EmailSendResult, OutboundEmail } from './email';

const migrations = Array.from({ length: 7 }, (_, index) => new URL(
    `../../../migrations/${String(index + 1).padStart(4, '0')}_${[
        'accounts_and_favorites',
        'flatten_user_identity',
        'enforce_flattened_user_identity',
        'user_activity_columns',
        'follows',
        'notification_prefs',
        'news_prefs',
    ][index]}.sql`,
    import.meta.url,
));

function applyMigrations(db: SqliteDatabase) {
    for (const migration of migrations) {
        for (const statement of readFileSync(migration, 'utf8').split(';').map(value => value.trim()).filter(Boolean)) {
            db.exec(`${statement};`);
        }
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
                        all: async <T>() => ({ results: sqlite.query(sql).all(...values) as T[] }),
                        first: async <T>() => (sqlite.query(sql).get(...values) as T | null) ?? null,
                        run: async () => ({ meta: { changes: sqlite.query(sql).run(...values).changes } }),
                    };
                },
            };
        },
    } as unknown as Database;
    return { db, sqlite };
}

function addUser(db: SqliteDatabase, id: string, emailVerified = 1, createdAt = 1) {
    db.query(`
        INSERT INTO users (id, provider, provider_user_id, display_name, email, email_verified, created_at, updated_at)
        VALUES (?, 'github', ?, ?, ?, ?, ?, ?)
    `).run(id, id.replace('github:', ''), id, `${id}@example.com`, emailVerified, createdAt, createdAt);
}

function addPrefs(db: SqliteDatabase, id: string, newsEnabled: number) {
    db.query(`
        INSERT INTO notification_prefs (user_id, email_enabled, news_enabled, unsubscribe_token, updated_at)
        VALUES (?, 1, ?, ?, 1)
    `).run(id, newsEnabled, `token-${id}`);
}

const post: NewsPost = {
    id: 'today-in-ai-2026-09-02',
    date: '2026-09-02',
    title: 'A daily brief',
    description: 'A summary',
    intro: ['Intro'],
    items: [],
};

function sender(result: EmailSendResult = { messageId: 'message-1', dryRun: false }) {
    const calls: OutboundEmail[] = [];
    return {
        calls,
        sendEmail: async (message: OutboundEmail) => {
            calls.push(message);
            return result;
        },
    };
}

describe('news service', () => {
    test('sends a news email and records it', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, 'github:user-a');
        addPrefs(sqlite, 'github:user-a', 1);
        const mail = sender();

        const summary = await runNewsSend({
            db,
            post,
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            now: 100,
            throttleMs: 0,
        });

        expect(summary).toMatchObject({ candidates: 1, sent: 1, skippedAlreadySent: 0, failed: 0, dryRun: false });
        expect(mail.calls[0]?.unsubscribeUrl).toBe('https://ai.dosa.dev/unsubscribe?token=token-github%3Auser-a&kind=news');
        expect(sqlite.query('SELECT kind, tool_slugs, message_id FROM email_log').get()).toEqual({
            kind: 'news',
            tool_slugs: post.id,
            message_id: 'message-1',
        });
        sqlite.close();
    });

    test('deduplicates a previously sent post', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, 'github:user-a');
        addPrefs(sqlite, 'github:user-a', 1);
        const mail = sender();

        await runNewsSend({ db, post, sendEmail: mail.sendEmail, siteOrigin: 'https://ai.dosa.dev', throttleMs: 0 });
        const second = await runNewsSend({ db, post, sendEmail: mail.sendEmail, siteOrigin: 'https://ai.dosa.dev', throttleMs: 0 });

        expect(second).toMatchObject({ candidates: 0, sent: 0, skippedAlreadySent: 0, failed: 0 });
        expect(mail.calls).toHaveLength(1);
        sqlite.close();
    });

    test('fills the limit with users who have not received the post', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, 'github:user-a', 1, 1);
        addPrefs(sqlite, 'github:user-a', 1);
        addUser(sqlite, 'github:user-b', 1, 2);
        addPrefs(sqlite, 'github:user-b', 1);
        const mail = sender();

        const first = await runNewsSend({
            db,
            post,
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            maxUsers: 1,
            throttleMs: 0,
        });
        const second = await runNewsSend({
            db,
            post,
            sendEmail: mail.sendEmail,
            siteOrigin: 'https://ai.dosa.dev',
            maxUsers: 1,
            throttleMs: 0,
        });

        expect(first).toMatchObject({ candidates: 1, sent: 1, failed: 0 });
        expect(second).toMatchObject({ candidates: 1, sent: 1, failed: 0 });
        expect(mail.calls.map(call => call.to)).toEqual([
            'github:user-a@example.com',
            'github:user-b@example.com',
        ]);
        sqlite.close();
    });

    test('only selects verified users with news enabled', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, 'github:disabled');
        addPrefs(sqlite, 'github:disabled', 0);
        addUser(sqlite, 'github:unverified', 0);
        addPrefs(sqlite, 'github:unverified', 1);
        const mail = sender();

        const summary = await runNewsSend({ db, post, sendEmail: mail.sendEmail, siteOrigin: 'https://ai.dosa.dev', throttleMs: 0 });

        expect(summary).toMatchObject({ candidates: 0, sent: 0 });
        expect(mail.calls).toHaveLength(0);
        sqlite.close();
    });

    test('does not persist a dry-run send', async () => {
        const { db, sqlite } = makeDatabase();
        addUser(sqlite, 'github:user-a');
        addPrefs(sqlite, 'github:user-a', 1);
        const mail = sender({ messageId: null, dryRun: true });

        const summary = await runNewsSend({ db, post, sendEmail: mail.sendEmail, siteOrigin: 'https://ai.dosa.dev', throttleMs: 0 });

        expect(summary).toMatchObject({ candidates: 1, sent: 1, dryRun: true });
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_log').get()).toEqual({ count: 0 });
        sqlite.close();
    });
});
