import { describe, expect, test } from 'bun:test';
import { buildImport } from './migrate-upstash-zaps';
import { castZap, getZapCounts } from '../src/lib/server/zaps-repository';
import { createTestDatabase } from '../src/lib/server/test-d1-adapter';

describe('buildImport', () => {
    test('folds aliases, unions voters and escapes quotes', () => {
        const { sql, report } = buildImport(
            new Map([['cognition-devin', '3'], ['cognition-windsurf', '2'], ['Acme-Tool ', '1'], ['bad id!', '4'], ['x-y', 'NaN']]),
            new Map([['cognition-devin', ['github:1', 'github:2']], ['cognitionai-devin', ['github:2', "o'brien"]], ['acme-tool', ['g:9']]]),
            1000,
        );
        expect(report.totalVotes).toBe(6);
        expect(report.totalVoters).toBe(4);
        expect(report.skippedKeys).toEqual(['votes:bad id!', 'votes:x-y']);
        expect(report.aliasMerges['cognition-devin']).toEqual(['votes:cognition-windsurf', 'voters:cognitionai-devin']);
        expect(report.countVoterMismatches).toEqual([
            { toolId: 'cognition-devin', count: 5, voters: 3 },
        ]);
        expect(sql).toContain("('cognition-devin', 5)");
        expect(sql).toContain("('acme-tool', 1)");
        expect(sql).toContain("('cognition-devin', 'o''brien', 1000, 'redis')");
        expect(sql).toContain('ON CONFLICT(tool_id) DO UPDATE SET count = excluded.count;');
        expect(sql).toContain('INSERT INTO zap_votes');
        expect(sql).toContain("ON CONFLICT(tool_id, voter_id) DO UPDATE SET source = 'redis';");
    });

    test('catch-up import counts an overlapping D1 vote only once', async () => {
        const { db, sqlite } = createTestDatabase();
        const apply = (counts: Map<string, string | null>, voters: Map<string, string[]>) =>
            sqlite.exec(buildImport(counts, voters, 1000).sql);

        // First snapshot: cursor has no legacy votes.
        apply(new Map([['cursor', '0']]), new Map());
        // User zaps on AWS after the snapshot, then again on D1.
        expect(await castZap(db, 'cursor', 'alice', 1)).toBe('created');
        expect(await getZapCounts(db)).toEqual({ cursor: 1 });

        // Catch-up import: Redis now reports count 1 and voter alice.
        // The ON CONFLICT update marks the D1 row 'redis' so it is not counted twice.
        apply(new Map([['cursor', '1']]), new Map([['cursor', ['alice']]]));
        expect(await getZapCounts(db)).toEqual({ cursor: 1 });

        // A non-overlapping D1 vote still adds on top of the legacy count.
        expect(await castZap(db, 'cursor', 'bob', 2)).toBe('created');
        expect(await getZapCounts(db)).toEqual({ cursor: 2 });
    });
});
