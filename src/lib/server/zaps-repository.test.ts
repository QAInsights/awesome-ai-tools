import { describe, expect, test } from 'bun:test';
import { castZap, getZapCounts } from './zaps-repository';
import { createTestDatabase } from './test-d1-adapter';

describe('zaps repository', () => {
    test('merges legacy counts and d1 votes for the same tool', async () => {
        const { db, sqlite } = createTestDatabase();
        sqlite.exec(`INSERT INTO zap_legacy_counts (tool_id, count) VALUES ('cursor', 40);`);
        await castZap(db, 'cursor', 'github:1', 100);
        await castZap(db, 'cursor', 'github:2', 101);

        expect(await getZapCounts(db)).toEqual({ cursor: 42 });
    });

    test('does not count imported redis rows', async () => {
        const { db, sqlite } = createTestDatabase();
        sqlite.exec(`INSERT INTO zap_legacy_counts (tool_id, count) VALUES ('cursor', 5);`);
        sqlite.exec(`INSERT INTO zap_votes (tool_id, voter_id, created_at, source) VALUES ('cursor', 'fp:abc', 1, 'redis');`);

        expect(await getZapCounts(db)).toEqual({ cursor: 5 });
    });

    test('returns tools that only have a legacy count', async () => {
        const { db, sqlite } = createTestDatabase();
        sqlite.exec(`INSERT INTO zap_legacy_counts (tool_id, count) VALUES ('zed', 7);`);

        expect(await getZapCounts(db)).toEqual({ zed: 7 });
    });

    test('omits zero-count legacy rows', async () => {
        const { db, sqlite } = createTestDatabase();
        sqlite.exec(`INSERT INTO zap_legacy_counts (tool_id, count) VALUES ('zed', 0);`);

        expect(await getZapCounts(db)).toEqual({});
    });

    test('castZap reports created then duplicate for the same voter', async () => {
        const { db } = createTestDatabase();

        expect(await castZap(db, 'cursor', 'github:1', 100)).toBe('created');
        expect(await castZap(db, 'cursor', 'github:1', 200)).toBe('duplicate');
    });

    test('castZap reports duplicate against an imported redis voter row', async () => {
        const { db, sqlite } = createTestDatabase();
        sqlite.exec(`INSERT INTO zap_votes (tool_id, voter_id, created_at, source) VALUES ('cursor', 'github:1', 1, 'redis');`);

        expect(await castZap(db, 'cursor', 'github:1', 200)).toBe('duplicate');
    });
});
