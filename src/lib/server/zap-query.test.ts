import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('cloudflare:workers', () => ({ env: {} }));
const { buildUserZapsQuery, buildZapDashboard, zapToolId } = await import(`./zap-query.ts?test=${Date.now()}`);
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
    });

    test('uses the canonical vote ID formula', () => {
        expect(zapToolId('Anysphere', 'Cursor')).toBe('anysphere-cursor');
    });
});
