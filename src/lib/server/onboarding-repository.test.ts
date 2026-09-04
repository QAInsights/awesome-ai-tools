import { describe, expect, test } from 'bun:test';
import type { Database } from './db';
import {
    dismissOnboarding,
    FAVORITES_TARGET,
    FOLLOWS_TARGET,
    getOnboardingState,
    loadOnboardingState,
    markBadgeCompleted,
} from './onboarding-repository';

interface QueuedResult {
    first?: unknown;
    all?: unknown;
    run?: unknown;
    batch?: unknown[];
}

/**
 * Fake D1 database that replays queued results in call order so multi-statement
 * flows (write timestamp -> re-read state) can be asserted precisely.
 */
function makeDatabase(queue: QueuedResult[] = []) {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
    const results = [...queue];
    const db = {
        prepare(sql: string) {
            return {
                bind(...values: unknown[]) {
                    calls.push({ sql, values });
                    // Bound statements keep their SQL so batch() assertions can inspect them.
                    // The queue only shifts when a method actually executes.
                    return {
                        sql,
                        values,
                        all: async () => (results.shift() ?? {}).all ?? { results: [] },
                        first: async () => (results.shift() ?? {}).first ?? null,
                        run: async () => (results.shift() ?? {}).run ?? { success: true, meta: { changes: 0 } },
                    };
                },
            };
        },
        batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
            batches.push(statements.map(statement => ({ sql: statement.sql, values: statement.values })));
            const result = results.shift();
            if (result?.batch) return result.batch;
            return statements.map(() => ({ success: true, meta: { changes: 0 } }));
        },
    } as unknown as Database;
    return { db, calls, batches };
}

describe('onboarding repository', () => {
    test('exposes fixed activation targets', () => {
        expect(FAVORITES_TARGET).toBe(3);
        expect(FOLLOWS_TARGET).toBe(1);
    });

    test('reads state in a single query and derives step completion', async () => {
        const { db, calls } = makeDatabase([{
            first: {
                favorites_count: 2,
                follows_count: 1,
                badge_completed_at: null,
                dismissed_at: null,
                completed_at: null,
            },
        }]);

        const state = await getOnboardingState(db, 'github:1');

        expect(state).toMatchObject({
            favoritesCount: 2,
            followsCount: 1,
            favoritesStepComplete: false,
            followsStepComplete: true,
            badgeStepComplete: false,
            completed: false,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.sql).toContain('COUNT(*) FROM favorites');
        expect(calls[0]?.sql).toContain('LEFT JOIN user_onboarding');
        expect(calls[0]?.values).toEqual(['github:1']);
    });

    test('treats a missing onboarding row as zero progress', async () => {
        const { db } = makeDatabase([{ first: null }]);

        expect(await getOnboardingState(db, 'github:1')).toMatchObject({
            badgeCompletedAt: null,
            dismissedAt: null,
            completedAt: null,
            favoritesCount: 0,
            followsCount: 0,
            completed: false,
        });
    });

    test('marks completion derived from live counts without a stored timestamp', async () => {
        const { db } = makeDatabase([{
            first: {
                favorites_count: 3,
                follows_count: 2,
                badge_completed_at: 10,
                dismissed_at: null,
                completed_at: null,
            },
        }]);

        expect(await getOnboardingState(db, 'github:1')).toMatchObject({
            favoritesStepComplete: true,
            followsStepComplete: true,
            badgeStepComplete: true,
            completed: true,
            completedAt: null,
        });
    });

    test('keeps completion sticky once completed_at is stamped', async () => {
        const { db } = makeDatabase([{
            first: {
                favorites_count: 0,
                follows_count: 0,
                badge_completed_at: 10,
                dismissed_at: null,
                completed_at: 99,
            },
        }]);

        expect(await getOnboardingState(db, 'github:1')).toMatchObject({
            completed: true,
            completedAt: 99,
        });
    });

    test('markBadgeCompleted inserts the row, keeps the first timestamp, and re-reads state', async () => {
        const { db, batches, calls } = makeDatabase([
            { batch: [] },
            {
                first: {
                    favorites_count: 1,
                    follows_count: 0,
                    badge_completed_at: 500,
                    dismissed_at: null,
                    completed_at: null,
                },
            },
        ]);

        const state = await markBadgeCompleted(db, 'github:2', 500);

        expect(state.badgeStepComplete).toBe(true);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(2);
        expect(batches[0]?.[0]?.sql).toContain('INSERT OR IGNORE INTO user_onboarding');
        expect(batches[0]?.[0]?.values).toEqual(['github:2', 500]);
        expect(batches[0]?.[1]?.sql).toContain('SET badge_completed_at = ?');
        expect(batches[0]?.[1]?.sql).toContain('badge_completed_at IS NULL');
        expect(batches[0]?.[1]?.values).toEqual([500, 500, 'github:2']);
        expect(calls.at(-1)?.sql).toContain('LEFT JOIN user_onboarding');
    });

    test('dismissOnboarding stamps the dismissal timestamp the same way', async () => {
        const { db, batches } = makeDatabase([
            { batch: [] },
            {
                first: {
                    favorites_count: 0,
                    follows_count: 0,
                    badge_completed_at: null,
                    dismissed_at: 700,
                    completed_at: null,
                },
            },
        ]);

        const state = await dismissOnboarding(db, 'github:3', 700);

        expect(state.dismissedAt).toBe(700);
        expect(batches[0]?.[1]?.sql).toContain('SET dismissed_at = ?');
    });

    test('loadOnboardingState stamps completed_at when activation is newly detected', async () => {
        const { db, batches } = makeDatabase([
            {
                first: {
                    favorites_count: 3,
                    follows_count: 1,
                    badge_completed_at: 10,
                    dismissed_at: null,
                    completed_at: null,
                },
            },
            { batch: [] },
        ]);

        const state = await loadOnboardingState(db, 'github:4', 900);

        expect(state.completed).toBe(true);
        expect(state.completedAt).toBe(900);
        expect(batches).toHaveLength(1);
        expect(batches[0]?.[1]?.sql).toContain('SET completed_at = ?');
        expect(batches[0]?.[1]?.values).toEqual([900, 900, 'github:4']);
    });

    test('loadOnboardingState avoids the stamp write when already stamped or incomplete', async () => {
        const stamped = makeDatabase([{
            first: {
                favorites_count: 3,
                follows_count: 1,
                badge_completed_at: 10,
                dismissed_at: null,
                completed_at: 800,
            },
        }]);
        expect((await loadOnboardingState(stamped.db, 'github:5')).completedAt).toBe(800);
        expect(stamped.batches).toHaveLength(0);

        const incomplete = makeDatabase([{
            first: {
                favorites_count: 1,
                follows_count: 0,
                badge_completed_at: null,
                dismissed_at: null,
                completed_at: null,
            },
        }]);
        expect((await loadOnboardingState(incomplete.db, 'github:5')).completed).toBe(false);
        expect(incomplete.batches).toHaveLength(0);
    });
});
