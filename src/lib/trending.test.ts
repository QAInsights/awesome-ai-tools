import { describe, expect, test } from 'bun:test';
import {
    MAX_TOOLS_PER_ACTOR,
    aggregateSignals,
    aggregateToolViews,
    buildSnapshot,
    buildToolViewsQuery,
    buildWeeklySignalsQuery,
    computeStarGrowth,
    diffNewSlugs,
    formatWeekSpan,
    formatWeekTitle,
    githubRepoFromUrl,
    isValidWeekId,
    isoWeekId,
    lastCompletedWeekId,
    previousWeekId,
    scoreAll,
    scoreTool,
    splitRange,
    toolSlugFromPath,
    upsertSnapshot,
    weekRange,
    withViews,
    type TrendingSnapshot,
} from './trending';

const tools = [
    { slug: 'cursor', name: 'Cursor', company: 'Anysphere' },
    { slug: 'claude-code', name: 'Claude Code', company: 'Anthropic' },
    { slug: 'aider', name: 'Aider', company: 'Aider' },
];

describe('ISO weeks', () => {
    test('computes ISO week ids across year boundaries', () => {
        expect(isoWeekId(new Date('2026-09-28T00:00:00Z'))).toBe('2026-w40');
        expect(isoWeekId(new Date('2026-10-04T23:59:59Z'))).toBe('2026-w40');
        expect(isoWeekId(new Date('2027-01-01T12:00:00Z'))).toBe('2026-w53');
        expect(isoWeekId(new Date('2024-12-30T00:00:00Z'))).toBe('2025-w01');
    });

    test('maps a week id to its Monday-to-Monday UTC range', () => {
        const { start, end } = weekRange('2026-w40');
        expect(start.toISOString()).toBe('2026-09-28T00:00:00.000Z');
        expect(end.toISOString()).toBe('2026-10-05T00:00:00.000Z');
        expect(weekRange('2025-w01').start.toISOString()).toBe('2024-12-30T00:00:00.000Z');
    });

    test('rejects malformed and nonexistent weeks', () => {
        expect(isValidWeekId('2026-w40')).toBe(true);
        expect(isValidWeekId('2026-w53')).toBe(true);
        expect(isValidWeekId('2025-w53')).toBe(false);
        expect(isValidWeekId('2026-w00')).toBe(false);
        expect(isValidWeekId('2026-W40')).toBe(false);
        expect(isValidWeekId('../2026-w40')).toBe(false);
        expect(() => weekRange('2025-w53')).toThrow('Invalid ISO week id');
    });

    test('finds previous and last completed weeks', () => {
        expect(previousWeekId('2026-w01')).toBe('2025-w52');
        expect(lastCompletedWeekId(new Date('2026-10-05T00:15:00Z'))).toBe('2026-w40');
        expect(lastCompletedWeekId(new Date('2026-10-04T23:00:00Z'))).toBe('2026-w39');
    });

    test('formats week labels', () => {
        expect(formatWeekTitle('2026-w40')).toBe('Week 40, 2026');
        expect(formatWeekSpan('2026-w40')).toBe('Sep 28 to Oct 4, 2026');
    });
});

describe('weekly signals query', () => {
    test('bounds the query to the week and the trending events', () => {
        const query = buildWeeklySignalsQuery('aat_events_staging', '2026-w40');
        expect(query).toContain('FROM aat_events_staging');
        expect(query).toContain("timestamp >= toDateTime('2026-09-28 00:00:00')");
        expect(query).toContain("timestamp < toDateTime('2026-10-05 00:00:00')");
        expect(query).toContain("'zap_cast'");
        expect(query).toContain("'outbound_click'");
        expect(query).toContain('GROUP BY event, subject, user_id, anon_id');
    });

    test('refuses invalid week ids instead of interpolating them', () => {
        expect(() => buildWeeklySignalsQuery('aat_events', "2026-w40') OR 1=1 --")).toThrow();
    });
});

describe('aggregateSignals', () => {
    test('counts each signed-in user once per tool and maps zap ids to slugs', () => {
        const { signals, guard } = aggregateSignals([
            { event: 'zap_cast', subject: 'anysphere-cursor', user_id: 'github:1', anon_id: 'a1' },
            { event: 'zap_cast', subject: 'anysphere-cursor', user_id: 'github:1', anon_id: 'a2' },
            { event: 'zap_cast', subject: 'anysphere-cursor', user_id: 'google:2', anon_id: '' },
            { event: 'zap_cast', subject: 'unknown-tool', user_id: 'github:1', anon_id: '' },
            { event: 'favorite_added', subject: 'cursor', user_id: 'github:1', anon_id: '' },
            { event: 'follow_added', subject: 'claude-code', user_id: 'github:1', anon_id: '' },
            { event: 'outbound_click', subject: 'cursor', user_id: '', anon_id: 'a1' },
            { event: 'outbound_click', subject: 'cursor', user_id: '', anon_id: 'a1' },
            { event: 'outbound_click', subject: 'cursor', user_id: 'github:1', anon_id: 'a1' },
            { event: 'outbound_click', subject: 'cursor', user_id: '', anon_id: '' },
            { event: 'signin_completed', subject: 'cursor', user_id: 'github:1', anon_id: '' },
        ], tools);

        expect(signals.get('cursor')).toEqual({ zaps: 2, favorites: 1, follows: 0, outboundClicks: 2, views: 0 });
        expect(signals.get('claude-code')).toEqual({ zaps: 0, favorites: 0, follows: 1, outboundClicks: 0, views: 0 });
        expect(guard).toEqual({ ungatedZapsDropped: 0, burstActorsDropped: 0 });
    });

    test('drops zaps that bypassed the sign-in gate', () => {
        const { signals, guard } = aggregateSignals([
            { event: 'zap_cast', subject: 'anysphere-cursor', user_id: '', anon_id: 'bot-1' },
            { event: 'zap_cast', subject: 'anysphere-cursor', user_id: '', anon_id: 'bot-2' },
        ], tools);
        expect(signals.get('cursor')).toBeUndefined();
        expect(guard.ungatedZapsDropped).toBe(2);
    });

    test('ignores anonymous favorites and follows', () => {
        const { signals } = aggregateSignals([
            { event: 'favorite_added', subject: 'cursor', user_id: '', anon_id: 'a1' },
            { event: 'follow_added', subject: 'cursor', user_id: '', anon_id: 'a1' },
        ], tools);
        expect(signals.size).toBe(0);
    });

    test('nets favorites and follows against removals in the same week', () => {
        const { signals } = aggregateSignals([
            { event: 'favorite_added', subject: 'cursor', user_id: 'github:1' },
            { event: 'favorite_removed', subject: 'cursor', user_id: 'github:1' },
            { event: 'favorite_removed', subject: 'cursor', user_id: 'github:2' },
            { event: 'follow_added', subject: 'aider', user_id: 'github:3' },
        ], tools);
        expect(signals.get('cursor')?.favorites).toBe(-1);
        expect(signals.get('aider')?.follows).toBe(1);
    });

    test('drops actors spreading one signal over too many tools', () => {
        const many = Array.from({ length: MAX_TOOLS_PER_ACTOR + 1 }, (_, i) => ({ slug: `tool-${i}`, name: `Tool ${i}`, company: 'Acme' }));
        const catalog = [...tools, ...many];
        const { signals, guard } = aggregateSignals([
            ...many.map(tool => ({ event: 'outbound_click', subject: tool.slug, user_id: '', anon_id: 'crawler' })),
            { event: 'outbound_click', subject: 'tool-0', user_id: '', anon_id: 'human' },
        ], catalog);
        expect(signals.get('tool-0')?.outboundClicks).toBe(1);
        expect(signals.get('tool-1')).toBeUndefined();
        expect(guard.burstActorsDropped).toBe(1);
    });

    test('tolerates malformed rows', () => {
        const { signals } = aggregateSignals([
            {},
            { event: 42, subject: null, user_id: undefined },
            { event: 'favorite_added', subject: ' cursor ', user_id: ' github:1 ' },
        ], tools);
        expect(signals.get('cursor')?.favorites).toBe(1);
    });
});

describe('tool page views', () => {
    const slugs = new Set(tools.map(tool => tool.slug));

    test('maps tool, pricing and alternatives paths to their slug', () => {
        expect(toolSlugFromPath('/tools/cursor', slugs)).toBe('cursor');
        expect(toolSlugFromPath('/tools/cursor/', slugs)).toBe('cursor');
        expect(toolSlugFromPath('/tools/Claude-Code/pricing', slugs)).toBe('claude-code');
        expect(toolSlugFromPath('/tools/aider/alternatives/?ref=x', slugs)).toBe('aider');
    });

    test('ignores non-tool pages, unknown slugs and malformed paths', () => {
        for (const path of ['/', '/compare/cursor-vs-aider', '/tools/token-counter', '/tools/cursor/reviews', '/tools/', '/xtools/cursor', 42, null]) {
            expect(toolSlugFromPath(path, slugs)).toBeNull();
        }
    });

    test('splits a week into windows within the dataset maxDuration', () => {
        const { start, end } = weekRange('2026-w40');
        const daily = splitRange(start, end, 86_400);
        expect(daily).toHaveLength(7);
        expect(daily[0]!.from.toISOString()).toBe('2026-09-28T00:00:00.000Z');
        expect(daily[6]!.to.toISOString()).toBe('2026-10-05T00:00:00.000Z');
        expect(splitRange(start, end, 31 * 86_400)).toHaveLength(1);
        expect(splitRange(start, end, 0)).toHaveLength(1);
    });

    test('queries page views by path with an exclusive week end', () => {
        const { start, end } = weekRange('2026-w40');
        const query = buildToolViewsQuery('acct', 'ai.dosa.dev', splitRange(start, end, 4 * 86_400));
        expect(query).toContain('accountTag: "acct"');
        expect(query).toContain('w0: rumPageloadEventsAdaptiveGroups');
        expect(query).toContain('w1: rumPageloadEventsAdaptiveGroups');
        expect(query).toContain('requestHost: "ai.dosa.dev", datetime_geq: "2026-09-28T00:00:00Z", datetime_lt: "2026-10-02T00:00:00Z"');
        expect(query).toContain('datetime_lt: "2026-10-05T00:00:00Z"');
        expect(query).toContain('dimensions { requestHost requestPath }');
    });

    test('sums views per tool across paths and windows', () => {
        const views = aggregateToolViews([
            { count: 10, dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/tools/cursor' } },
            { count: 4, dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/tools/cursor/pricing' } },
            { count: 3, dimensions: { requestHost: 'AI.DOSA.DEV', requestPath: '/tools/cursor/' } },
            { count: 6, dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/tools/aider' } },
            { count: 50, dimensions: { requestHost: 'preview.workers.dev', requestPath: '/tools/aider' } },
            { count: 99, dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/' } },
            { count: 'oops', dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/tools/claude-code' } },
            { count: 5, dimensions: { requestHost: 'ai.dosa.dev', requestPath: '/tools/ghost' } },
        ], tools, 'ai.dosa.dev');
        expect([...views.entries()]).toEqual([['cursor', 17], ['aider', 6]]);
    });

    test('merges views into engagement signals without mutating them', () => {
        const signals = new Map([['cursor', { zaps: 1, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }]]);
        const merged = withViews(signals, new Map([['cursor', 16], ['aider', 9]]));
        expect(merged.get('cursor')).toEqual({ zaps: 1, favorites: 0, follows: 0, outboundClicks: 0, views: 16 });
        expect(merged.get('aider')).toEqual({ zaps: 0, favorites: 0, follows: 0, outboundClicks: 0, views: 9 });
        expect(signals.get('cursor')!.views).toBe(0);
        expect(withViews(signals, new Map())).toEqual(signals);
    });
});

describe('GitHub stars', () => {
    test('extracts repositories from github URLs only', () => {
        expect(githubRepoFromUrl('https://github.com/Aider-AI/aider')).toBe('Aider-AI/aider');
        expect(githubRepoFromUrl('https://www.github.com/owner/repo.git')).toBe('owner/repo');
        expect(githubRepoFromUrl('https://github.com/owner/repo/tree/main')).toBe('owner/repo');
        expect(githubRepoFromUrl('https://github.com/features/copilot')).toBeNull();
        expect(githubRepoFromUrl('https://github.com/owner')).toBeNull();
        expect(githubRepoFromUrl('https://cursor.com')).toBeNull();
    });

    test('computes growth only when both captures exist', () => {
        const growth = computeStarGrowth({ aider: 1200, cursor: 50 }, { aider: 1000 });
        expect(growth.get('aider')).toBe(200);
        expect(growth.get('cursor')).toBeNull();
    });
});

describe('scoring', () => {
    test('weights signed-in actions linearly and damps clicks and stars', () => {
        expect(scoreTool({ zaps: 1, favorites: 1, follows: 1, outboundClicks: 0, views: 0 })).toBe(12);
        expect(scoreTool({ zaps: 0, favorites: 0, follows: 0, outboundClicks: 100, views: 0 })).toBe(20);
        expect(scoreTool({ zaps: 0, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }, 400)).toBe(40);
        expect(scoreTool({ zaps: 0, favorites: 0, follows: 0, outboundClicks: 0, views: 144 })).toBe(12);
    });

    test('never lets removals or star losses go below zero', () => {
        expect(scoreTool({ zaps: 0, favorites: -3, follows: -1, outboundClicks: 0, views: 0 }, -50)).toBe(0);
    });

    test('keeps only tools with a positive score', () => {
        const scores = scoreAll(
            new Map([['cursor', { zaps: 1, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }], ['aider', { zaps: 0, favorites: -1, follows: 0, outboundClicks: 0, views: 0 }]]),
            new Map([['claude-code', 25], ['aider', null]]),
        );
        expect([...scores.entries()]).toEqual([['cursor', 3], ['claude-code', 10]]);
    });
});

describe('buildSnapshot', () => {
    const base = {
        week: '2026-w40',
        generatedAt: new Date('2026-10-05T00:15:00Z'),
        tools,
        guard: { ungatedZapsDropped: 1, burstActorsDropped: 0 },
    };

    test('ranks tools, computes rising deltas, and lists new tools', () => {
        const snapshot = buildSnapshot({
            ...base,
            signals: new Map([
                ['cursor', { zaps: 4, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }],
                ['claude-code', { zaps: 2, favorites: 1, follows: 0, outboundClicks: 0, views: 0 }],
                ['aider', { zaps: 1, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }],
            ]),
            starGrowth: new Map([['aider', 100]]),
            previousScores: new Map([['cursor', 12], ['aider', 1]]),
            newSlugs: ['aider', 'aider', 'removed-tool'],
        });

        expect(snapshot.week).toBe('2026-w40');
        expect(snapshot.start).toBe('2026-09-28T00:00:00.000Z');
        expect(snapshot.end).toBe('2026-10-05T00:00:00.000Z');
        expect(snapshot.entries.map(e => [e.slug, e.rank, e.score])).toEqual([
            ['aider', 1, 23],
            ['cursor', 2, 12],
            ['claude-code', 3, 10],
        ]);
        expect(snapshot.entries[0]).toMatchObject({ name: 'Aider', company: 'Aider', zaps: 1, starGrowth: 100 });
        expect(snapshot.rising.map(r => [r.slug, r.delta, r.previousRank])).toEqual([
            ['aider', 22, 2],
            ['claude-code', 10, null],
        ]);
        expect(snapshot.newTools).toEqual([{ slug: 'aider', name: 'Aider', company: 'Aider' }]);
        expect(snapshot.guard.ungatedZapsDropped).toBe(1);
    });

    test('ranks a week from page views alone when there is no engagement', () => {
        const snapshot = buildSnapshot({
            ...base,
            signals: withViews(new Map(), new Map([['cursor', 81], ['aider', 16], ['claude-code', 0]])),
            starGrowth: new Map(),
            previousScores: new Map(),
            newSlugs: [],
        });
        expect(snapshot.entries.map(e => [e.slug, e.rank, e.score, e.views])).toEqual([
            ['cursor', 1, 9, 81],
            ['aider', 2, 4, 16],
        ]);
    });

    test('ignores scored slugs that are no longer in the catalog', () => {
        const snapshot = buildSnapshot({
            ...base,
            signals: new Map([['ghost', { zaps: 9, favorites: 0, follows: 0, outboundClicks: 0, views: 0 }]]),
            starGrowth: new Map(),
            previousScores: new Map(),
            newSlugs: [],
        });
        expect(snapshot.entries).toEqual([]);
        expect(snapshot.rising).toEqual([]);
    });
});

describe('snapshot archive helpers', () => {
    test('diffs newly added slugs', () => {
        expect(diffNewSlugs([{ slug: 'cursor' }], [{ slug: 'cursor' }, { slug: 'aider' }])).toEqual(['aider']);
    });

    test('upserts a week and keeps newest first', () => {
        const snap = (week: string, generatedAt = 'x') => ({ week, start: weekRange(week).start.toISOString(), generatedAt }) as TrendingSnapshot;
        const list = upsertSnapshot([snap('2026-w39'), snap('2026-w38')], snap('2026-w40'));
        expect(list.map(s => s.week)).toEqual(['2026-w40', '2026-w39', '2026-w38']);
        const replaced = upsertSnapshot(list, snap('2026-w39', 'y'));
        expect(replaced.map(s => [s.week, s.generatedAt])).toEqual([['2026-w40', 'x'], ['2026-w39', 'y'], ['2026-w38', 'x']]);
    });
});
