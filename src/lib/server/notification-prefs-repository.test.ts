import { describe, expect, test } from 'bun:test';
import type { Database } from './db';
import {
    findPrefsByUnsubscribeToken,
    getOrCreatePrefs,
    setEmailEnabled,
    unsubscribeByToken,
} from './notification-prefs-repository';

function makeDatabase(firstResults: unknown[], runResult = { meta: { changes: 1 } }) {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    let firstIndex = 0;
    const db = {
        prepare(sql: string) {
            return {
                bind(...values: unknown[]) {
                    calls.push({ sql, values });
                    return {
                        first: async () => firstResults[firstIndex++],
                        run: async () => runResult,
                    };
                },
            };
        },
    } as unknown as Database;
    return { db, calls };
}

describe('notification preferences repository', () => {
    test('creates preferences with a token and returns the persisted row', async () => {
        const { db, calls } = makeDatabase([{
            email_enabled: 1,
            unsubscribe_token: 'token-1',
            last_digest_sent_at: null,
        }]);
        const originalRandomUUID = crypto.randomUUID;
        const originalNow = Date.now;
        crypto.randomUUID = () => 'token-1';
        Date.now = () => 30;

        try {
            expect(await getOrCreatePrefs(db, 'github:123')).toEqual({
                emailEnabled: true,
                unsubscribeToken: 'token-1',
                lastDigestSentAt: null,
            });
        } finally {
            crypto.randomUUID = originalRandomUUID;
            Date.now = originalNow;
        }
        expect(calls[0]?.sql).toContain('INSERT OR IGNORE');
        expect(calls[0]?.values).toEqual(['github:123', 'token-1', 30]);
        expect(calls[1]?.values).toEqual(['github:123']);
    });

    test('updates the enabled flag', async () => {
        const { db, calls } = makeDatabase([{
            email_enabled: 0,
            unsubscribe_token: 'token-1',
            last_digest_sent_at: 10,
        }]);
        const originalNow = Date.now;
        Date.now = () => 40;

        try {
            expect(await setEmailEnabled(db, 'github:123', false)).toEqual({
                emailEnabled: false,
                unsubscribeToken: 'token-1',
                lastDigestSentAt: 10,
            });
        } finally {
            Date.now = originalNow;
        }
        expect(calls[1]?.sql).toContain('UPDATE notification_prefs');
        expect(calls[1]?.values).toEqual([0, 40, 'github:123']);
    });

    test('returns whether an unsubscribe token matched', async () => {
        const { db, calls } = makeDatabase([]);
        expect(await unsubscribeByToken(db, 'token-1')).toBe(true);
        expect(calls[0]?.values).toEqual(expect.arrayContaining(['token-1']));

        const noMatch = makeDatabase([], { meta: { changes: 0 } });
        expect(await unsubscribeByToken(noMatch.db, 'missing')).toBe(false);
    });

    test('finds preferences by unsubscribe token without writing', async () => {
        const { db, calls } = makeDatabase([{
            email_enabled: 1,
            unsubscribe_token: 'token-1',
            last_digest_sent_at: 10,
        }]);
        expect(await findPrefsByUnsubscribeToken(db, 'token-1')).toEqual({
            emailEnabled: true,
            unsubscribeToken: 'token-1',
            lastDigestSentAt: 10,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.sql).toContain('SELECT');
        expect(calls[0]?.values).toEqual(['token-1']);

        const noMatch = makeDatabase([null]);
        await expect(findPrefsByUnsubscribeToken(noMatch.db, 'missing')).resolves.toBeNull();
    });
});
