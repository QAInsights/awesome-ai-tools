import { Database as SqliteDatabase } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import type { Database } from './db';
import {
    releaseToolEmailSend,
    reserveToolEmailSend,
    secondsUntilNextUtcDay,
    utcDay,
} from './tool-email-quota';

const migrationsDir = new URL('../../../migrations/', import.meta.url);

function migratedDatabase() {
    const sqlite = new SqliteDatabase(':memory:');
    for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
        readFileSync(new URL(file, migrationsDir), 'utf8')
            .split(';')
            .map(statement => statement.trim())
            .filter(Boolean)
            .forEach(statement => sqlite.exec(`${statement};`));
    }
    sqlite.exec('PRAGMA foreign_keys = ON;');
    sqlite.run(`
        INSERT INTO users (id, provider, provider_user_id, display_name, email, email_verified, created_at, updated_at)
        VALUES ('github:1', 'github', '1', 'Ada', 'ada@example.com', 1, 1, 1)
    `);
    const d1 = {
        prepare(sql: string) {
            return {
                bind(...values: unknown[]) {
                    const params = values as never[];
                    return {
                        first: async () => sqlite.query(sql).get(...params) ?? null,
                        run: async () => sqlite.query(sql).run(...params),
                    };
                },
            };
        },
    } as unknown as Database;
    return { sqlite, d1 };
}

const NOON = Date.UTC(2026, 9, 24, 12, 0, 0);
const countFor = (sqlite: SqliteDatabase, day: string) =>
    (sqlite.query('SELECT count FROM tool_email_daily_counts WHERE user_id = ? AND day = ?').get('github:1', day) as { count: number } | null)?.count ?? null;

describe('tool email daily quota', () => {
    test('allows sends up to the limit, then refuses until the next UTC day', async () => {
        const { sqlite, d1 } = migratedDatabase();
        for (let i = 0; i < 3; i += 1) expect(await reserveToolEmailSend(d1, 'github:1', NOON, 3)).toBe(true);
        expect(await reserveToolEmailSend(d1, 'github:1', NOON, 3)).toBe(false);
        expect(countFor(sqlite, '2026-10-24')).toBe(3);

        const tomorrow = NOON + 24 * 60 * 60 * 1000;
        expect(await reserveToolEmailSend(d1, 'github:1', tomorrow, 3)).toBe(true);
        expect(countFor(sqlite, '2026-10-25')).toBe(1);
        expect(countFor(sqlite, '2026-10-24')).toBeNull();
    });

    test('release gives a failed send back without going below zero', async () => {
        const { sqlite, d1 } = migratedDatabase();
        await reserveToolEmailSend(d1, 'github:1', NOON, 1);
        expect(await reserveToolEmailSend(d1, 'github:1', NOON, 1)).toBe(false);
        await releaseToolEmailSend(d1, 'github:1', NOON);
        await releaseToolEmailSend(d1, 'github:1', NOON);
        expect(countFor(sqlite, '2026-10-24')).toBe(0);
        expect(await reserveToolEmailSend(d1, 'github:1', NOON, 1)).toBe(true);
    });

    test('rows are removed with the account', async () => {
        const { sqlite, d1 } = migratedDatabase();
        await reserveToolEmailSend(d1, 'github:1', NOON);
        sqlite.run("DELETE FROM users WHERE id = 'github:1'");
        expect(sqlite.query('SELECT COUNT(*) AS count FROM tool_email_daily_counts').get()).toEqual({ count: 0 });
    });

    test('day helpers use UTC boundaries', () => {
        expect(utcDay(Date.UTC(2026, 9, 24, 23, 59, 59))).toBe('2026-10-24');
        expect(secondsUntilNextUtcDay(NOON)).toBe(12 * 60 * 60);
        expect(secondsUntilNextUtcDay(Date.UTC(2026, 9, 24, 23, 59, 59, 500))).toBe(1);
    });
});
