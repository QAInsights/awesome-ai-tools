import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('cloudflare:workers', () => ({ env: {} }));
const {
    buildTrending,
    buildTrendingQuery,
    buildUserZapsQuery,
    buildZapDashboard,
    zapToolId,
} = await import(`./zap-query.ts?test=${Date.now()}`);
afterAll(() => mock.restore());

describe('zap queries', () => {
    test('validates user IDs before interpolating them into SQL', () => {
        expect(() => buildUserZapsQuery('aat_events', "github:1' OR 1=1")).toThrow('Invalid user id');
        expect(() => buildUserZapsQuery('aat_events', 'abc')).toThrow('Invalid user id');

        const query = buildUserZapsQuery('aat_events_staging', 'github:1');
        expect(query).toContain('FROM aat_events_staging');
        expect(query).toContain("blob3 = 'github:1'");
    });

    test('computes a deduplicated dashboard from zap rows', () => {
        const now = Date.parse('2026-08-20T12:00:00Z');
        const tools = [
            { slug: 'cursor', name: 'Cursor', company: 'Anysphere', category: 'AI IDEs' },
            { slug: 'claude-code', name: 'Claude Code', company: 'Anthropic', category: 'CLI Agents' },
            { slug: 'old-tool', name: 'Old Tool', company: 'Acme', category: 'AI IDEs' },
        ];
        const dashboard = buildZapDashboard([
            { tool_id: 'anysphere-cursor', timestamp: '2026-08-19T10:00:00Z' },
            { tool_id: 'anysphere-cursor', timestamp: '2026-08-20T11:00:00Z' },
            { tool_id: 'anthropic-claudecode', timestamp: '2026-07-01T11:00:00Z' },
            { tool_id: 'unknown-tool', timestamp: '2026-08-20T09:00:00Z' },
        ], tools, now);

        expect(dashboard.tools).toEqual([
            { toolId: 'anysphere-cursor', ...tools[0], zappedAt: '2026-08-20T11:00:00Z' },
            { toolId: 'anthropic-claudecode', ...tools[1], zappedAt: '2026-07-01T11:00:00Z' },
        ]);
        expect(dashboard.total).toBe(2);
        expect(dashboard.last30Days).toBe(1);
        expect(dashboard.topCategory).toBe('AI IDEs');
        expect(dashboard.weekly).toHaveLength(12);
    });

    test('buckets known zap activity by week from oldest to newest', () => {
        const now = Date.parse('2026-08-20T12:00:00Z');
        const tools = [
            { slug: 'cursor', name: 'Cursor', company: 'Anysphere', category: 'AI IDEs' },
        ];
        const dashboard = buildZapDashboard([
            { tool_id: 'anysphere-cursor', timestamp: '2026-08-20T12:00:00Z' },
            { tool_id: 'anysphere-cursor', timestamp: '2026-08-12T12:00:00Z' },
            { tool_id: 'anysphere-cursor', timestamp: '2026-05-12T12:00:00Z' },
            { tool_id: 'unknown-tool', timestamp: '2026-08-20T11:00:00Z' },
        ], tools, now);

        expect(dashboard.weekly).toHaveLength(12);
        expect(dashboard.weekly[11]).toBe(1);
        expect(dashboard.weekly[10]).toBe(1);
        expect(dashboard.weekly.reduce((sum, count) => sum + count, 0)).toBe(2);
    });

    test('builds the seven-day trending query', () => {
        const query = buildTrendingQuery('aat_events_staging');
        expect(query).toContain('FROM aat_events_staging');
        expect(query).toContain("INTERVAL '7' DAY");
    });

    test('maps, sorts, filters, and limits trending tools', () => {
        const tools = [
            { slug: 'cursor', name: 'Cursor', company: 'Anysphere', category: 'AI IDEs' },
            { slug: 'claude-code', name: 'Claude Code', company: 'Anthropic', category: 'CLI Agents' },
            { slug: 'aider', name: 'Aider', company: 'Aider', category: 'CLI Agents' },
        ];
        const trending = buildTrending([
            { tool_id: 'anysphere-cursor', n: '12' },
            { tool_id: 'anthropic-claudecode', n: 12 },
            { tool_id: 'aider-aider', n: '0' },
            { tool_id: 'unknown-tool', n: 99 },
            { tool_id: 'aider-aider', n: 'not-a-number' },
        ], tools, 2);

        expect(trending).toEqual([
            { toolId: 'anthropic-claudecode', ...tools[1], count: 12 },
            { toolId: 'anysphere-cursor', ...tools[0], count: 12 },
        ]);
    });

    test('uses the canonical vote ID formula', () => {
        expect(zapToolId('Anysphere', 'Cursor')).toBe('anysphere-cursor');
    });
});
