import { describe, expect, test } from 'bun:test';
import { buildImport } from './migrate-upstash-zaps';

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
        expect(sql).toContain('INSERT OR IGNORE INTO zap_votes');
    });
});
