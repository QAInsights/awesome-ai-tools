import { describe, expect, test } from 'bun:test';

import {
    SITE_HOSTS,
    buildRetentionChunks,
    buildRumQuery,
    fetchGitHubStats,
    fetchTrafficDetail,
    fetchTrafficStats,
    loadSiteStats,
    mergeDimensionGroups,
    mergeDailyHistory,
    topBreakdownRows,
    parseGitHubRepo,
    summarizeRumGroups,
} from './site-stats';

const credentials = { accountId: 'account-123', token: 'token-456' };
const now = new Date('2026-09-26T10:00:00Z');

function durationSeconds(chunk: { from: string; to: string }): number {
    return (new Date(chunk.to).getTime() - new Date(chunk.from).getTime()) / 1_000;
}

describe('Cloudflare retention chunks', () => {
    test('uses one whole-window chunk when max duration covers retention', () => {
        expect(buildRetentionChunks(now, 3_600, 4_000)).toEqual([{
            from: '2026-09-26T09:02:00Z',
            to: '2026-09-26T10:00:00Z',
        }]);
        expect(buildRetentionChunks(now, 3_600, 0)).toEqual([{
            from: '2026-09-26T09:02:00Z',
            to: '2026-09-26T10:00:00Z',
        }]);
    });

    test('splits the window into consecutive chunks ending at now', () => {
        const chunks = buildRetentionChunks(now, 4_000, 1_500);

        expect(chunks).toHaveLength(3);
        expect(chunks[0]?.from).toBe('2026-09-26T08:55:20Z');
        expect(chunks.at(-1)?.to).toBe('2026-09-26T10:00:00Z');
        for (let index = 1; index < chunks.length; index++) {
            expect(chunks[index]?.from).toBe(chunks[index - 1]?.to);
        }
        expect(chunks.every(chunk => durationSeconds(chunk) <= 1_500)).toBe(true);
    });

    test('caps the query at 24 max-duration chunks', () => {
        const chunks = buildRetentionChunks(now, 100_000, 100);

        expect(chunks).toHaveLength(24);
        expect(chunks.at(-1)?.to).toBe('2026-09-26T10:00:00Z');
        expect(chunks.every(chunk => durationSeconds(chunk) <= 100)).toBe(true);
    });
});

describe('RUM query and response helpers', () => {
    test('builds last30 and one RUM alias per retention chunk', () => {
        const chunks = buildRetentionChunks(now, 4_000, 2_000);
        const query = buildRumQuery('account-123', SITE_HOSTS[0]!, now, chunks);

        expect(query).toContain('accounts(filter: { accountTag: "account-123" })');
        expect(query).toContain('last30: rumPageloadEventsAdaptiveGroups');
        expect(query).toContain('w0: rumPageloadEventsAdaptiveGroups');
        expect(query).toContain('w1: rumPageloadEventsAdaptiveGroups');
        expect(query).not.toContain('w2: rumPageloadEventsAdaptiveGroups');
        expect(query).toContain('requestHost: "ai.dosa.dev"');
        expect(query).not.toContain('siteTag:');
        expect(query).toContain('dimensions { requestHost }');
    });

    test('sums only configured hosts case-insensitively and tolerates invalid values', () => {
        const groups = [
            { count: 10, sum: { visits: 4 }, dimensions: { requestHost: 'AI.DOSA.DEV' } },
            { count: 90, sum: { visits: 40 }, dimensions: { requestHost: 'other.example' } },
            { count: Number.NaN, sum: { visits: Number.POSITIVE_INFINITY }, dimensions: { requestHost: 'ai.dosa.dev' } },
        ];

        expect(summarizeRumGroups(groups)).toEqual({ pageViews: 10, visits: 4 });
        expect(summarizeRumGroups(undefined)).toEqual({ pageViews: 0, visits: 0 });
    });

    test('parses GitHub repository counters and rejects incomplete payloads', () => {
        expect(parseGitHubRepo({ stargazers_count: 125, forks_count: 17 })).toEqual({ stars: 125, forks: 17 });
        expect(parseGitHubRepo({ stargazers_count: 125 })).toBeNull();
        expect(parseGitHubRepo({ stargazers_count: '125', forks_count: 17 })).toBeNull();
        expect(parseGitHubRepo(null)).toBeNull();
    });
});

describe('fetchTrafficStats', () => {
    test('loads settings then sums all host-filtered retention windows', async () => {
        const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
        const responses = [
            Response.json({
                data: {
                    viewer: {
                        accounts: [{
                            settings: {
                                rumPageloadEventsAdaptiveGroups: {
                                    enabled: true,
                                    maxDuration: 2_000,
                                    notOlderThan: 4_000,
                                },
                            },
                        }],
                    },
                },
            }),
            Response.json({
                data: {
                    viewer: {
                        accounts: [{
                            last30: [
                                { count: 10, sum: { visits: 4 }, dimensions: { requestHost: 'ai.dosa.dev' } },
                                { count: 50, sum: { visits: 20 }, dimensions: { requestHost: 'example.com' } },
                            ],
                            w0: [{ count: 5, sum: { visits: 2 }, dimensions: { requestHost: 'ai.dosa.dev' } }],
                            w1: [{ count: 7, sum: { visits: 3 }, dimensions: { requestHost: 'AI.DOSA.DEV' } }],
                        }],
                    },
                },
            }),
        ];
        const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ input, init });
            return responses.shift()!;
        };

        const stats = await fetchTrafficStats(credentials, fetchImpl, now);

        expect(stats).toEqual({
            last30: { pageViews: 10, visits: 4 },
            lifetime: { pageViews: 12, visits: 5, since: '2026-09-26T08:55:20Z' },
        });
        expect(calls).toHaveLength(2);
        expect(calls[0]?.input).toBe('https://api.cloudflare.com/client/v4/graphql');
        expect(calls[0]?.init?.headers).toEqual({
            Authorization: 'Bearer token-456',
            'Content-Type': 'application/json',
        });
        const settingsBody = JSON.parse(String(calls[0]?.init?.body));
        const dataBody = JSON.parse(String(calls[1]?.init?.body));
        expect(settingsBody.query).toContain('settings { rumPageloadEventsAdaptiveGroups');
        expect(dataBody.query).toContain('w0: rumPageloadEventsAdaptiveGroups');
        expect(dataBody.query).toContain('w1: rumPageloadEventsAdaptiveGroups');
    });

    test('throws the first GraphQL error even when Cloudflare returns HTTP 200', async () => {
        const fetchImpl = async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
            errors: [{ message: 'dataset unavailable' }, { message: 'second error' }],
        });

        await expect(fetchTrafficStats(credentials, fetchImpl, now)).rejects.toThrow('dataset unavailable');
    });
});

describe('fetchGitHubStats', () => {
    test('sends the Authorization header when a token is provided', async () => {
        const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
        const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ input, init });
            return Response.json({ stargazers_count: 125, forks_count: 17 });
        };

        const stats = await fetchGitHubStats(fetchImpl, 'gh-token-1');

        expect(stats).toEqual({ stars: 125, forks: 17 });
        expect(calls[0]?.init?.headers).toEqual({
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ai.dosa.dev-stats',
            Authorization: 'Bearer gh-token-1',
        });
    });

    test('omits the Authorization header when no token is provided', async () => {
        const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
        const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ input, init });
            return Response.json({ stargazers_count: 125, forks_count: 17 });
        };

        await fetchGitHubStats(fetchImpl);

        expect(calls[0]?.init?.headers).toEqual({
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ai.dosa.dev-stats',
        });
    });
});

describe('traffic detail', () => {
    test('merges grouped rows across chunks and labels empty values', () => {
        const totals = mergeDimensionGroups([
            [
                { count: 4, sum: { visits: 2 }, dimensions: { refererHost: 'google.com' } },
                { count: 3, sum: { visits: 3 }, dimensions: { refererHost: '' } },
            ],
            [{ count: 6, sum: { visits: 1 }, dimensions: { refererHost: 'google.com' } }],
            undefined,
        ], 'refererHost', 'Direct / none');

        expect(Object.fromEntries(totals)).toEqual({
            'google.com': { pageViews: 10, visits: 3 },
            'Direct / none': { pageViews: 3, visits: 3 },
        });
        expect(mergeDimensionGroups([[{ count: 1, sum: { visits: 1 }, dimensions: { requestPath: '' } }]], 'requestPath').size).toBe(0);
    });

    test('keeps the top rows by either metric, sorted by page views', () => {
        const totals = new Map([
            ['/b', { pageViews: 5, visits: 1 }],
            ['/a', { pageViews: 9, visits: 4 }],
            ['/c', { pageViews: 5, visits: 3 }],
            ['/d', { pageViews: 2, visits: 8 }],
        ]);
        expect(topBreakdownRows(totals, 1)).toEqual([
            { label: '/a', pageViews: 9, visits: 4 },
            { label: '/d', pageViews: 2, visits: 8 },
        ]);
    });

    test('builds complete-day series and per-dimension breakdowns', async () => {
        const queries: string[] = [];
        const settings = { settings: { rumPageloadEventsAdaptiveGroups: { enabled: true, maxDuration: 400 * 86_400, notOlderThan: 400 * 86_400 } } };
        const rows: Record<string, Array<{ count: number; sum: { visits: number }; dimensions: Record<string, string> }>> = {
            date: [
                { count: 8, sum: { visits: 5 }, dimensions: { date: '2026-09-25' } },
                { count: 2, sum: { visits: 1 }, dimensions: { date: '2026-09-24' } },
                { count: 1, sum: { visits: 1 }, dimensions: { date: '2026-09-26' } },
                { count: 1, sum: { visits: 1 }, dimensions: { date: '2026-03-30' } },
            ],
            requestPath: [{ count: 7, sum: { visits: 3 }, dimensions: { requestPath: '/advertise' } }],
            refererHost: [{ count: 2, sum: { visits: 2 }, dimensions: { refererHost: '' } }],
            deviceType: [{ count: 5, sum: { visits: 2 }, dimensions: { deviceType: 'desktop' } }],
        };
        const dailyQueries: string[] = [];
        const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
            const query = JSON.parse(String(init?.body)).query as string;
            queries.push(query);
            if (query.includes('settings {')) return Response.json({ data: { viewer: { accounts: [settings] } } });
            if (query.includes('avg { sampleInterval }')) {
                dailyQueries.push(query);
                const from = query.match(/datetime_geq: "([^"]+)"/)?.[1]?.slice(0, 10) ?? '';
                const to = query.match(/datetime_lt: "([^"]+)"/)?.[1]?.slice(0, 10) ?? '';
                const dailyRows = rows.date!
                    .filter(row => (row.dimensions.date ?? '') >= from && (row.dimensions.date ?? '') < to)
                    .map(row => ({ ...row, avg: { sampleInterval: row.dimensions.date === '2026-09-24' ? 100 : 50 } }));
                return Response.json({ data: { viewer: { accounts: [{ daily: dailyRows }] } } });
            }
            const dimension = query.match(/dimensions \{ (\w+) \}/)?.[1] ?? '';
            if (dimension === 'countryName') return Response.json({ errors: [{ message: 'unknown field countryName' }] });
            const aliases = [...query.matchAll(/(\w+): rumPageloadEventsAdaptiveGroups/g)].map(match => match[1]!);
            return Response.json({ data: { viewer: { accounts: [Object.fromEntries(aliases.map(alias => [alias, rows[dimension]]))] } } });
        };

        const detail = await fetchTrafficDetail(credentials, fetchImpl, now);

        expect(detail.coverage).toEqual({ from: '2026-03-31', to: '2026-09-25' });
        expect(detail.daily).toEqual([
            { date: '2026-09-22', pageViews: 0, visits: 0 },
            { date: '2026-09-23', pageViews: 0, visits: 0 },
            { date: '2026-09-24', pageViews: 2, visits: 1, sampleInterval: 100 },
            { date: '2026-09-25', pageViews: 8, visits: 5, sampleInterval: 50 },
        ]);
        expect(Object.keys(detail.breakdowns)).toEqual(['7', '30', '90']);
        expect(detail.breakdowns['30']).toEqual({
            pages: [{ label: '/advertise', pageViews: 7, visits: 3 }],
            referrers: [{ label: 'Direct / none', pageViews: 2, visits: 2 }],
            countries: [],
            devices: [{ label: 'desktop', pageViews: 5, visits: 2 }],
        });
        expect(dailyQueries).toHaveLength(26);
        for (const query of dailyQueries) {
            expect([...query.matchAll(/\w+: rumPageloadEventsAdaptiveGroups/g)]).toHaveLength(1);
            expect(query).toContain('avg { sampleInterval }');
            expect(query).toContain('datetime_lt:');
            expect(query).not.toContain('datetime_leq');
            const from = query.match(/datetime_geq: "([^"]+)"/)?.[1];
            const to = query.match(/datetime_lt: "([^"]+)"/)?.[1];
            expect((new Date(to!).getTime() - new Date(from!).getTime()) / 86_400_000).toBeLessThanOrEqual(7);
        }
        expect(queries).toHaveLength(31);
    });

    test('zero-fills days without sampling intervals and lets observed rows replace inferred zeros', async () => {
        const settings = { settings: { rumPageloadEventsAdaptiveGroups: { enabled: true, maxDuration: 400 * 86_400, notOlderThan: 15 * 86_400 } } };
        const dailyQueries: string[] = [];
        const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
            const query = JSON.parse(String(init?.body)).query as string;
            if (query.includes('settings {')) return Response.json({ data: { viewer: { accounts: [settings] } } });
            if (query.includes('avg { sampleInterval }')) {
                dailyQueries.push(query);
                const from = query.match(/datetime_geq: "([^"]+)"/)?.[1] ?? '';
                const dates = from.startsWith('2026-09-12')
                    ? [
                        { date: '2026-09-14', count: 8, sum: { visits: 5 }, avg: { sampleInterval: 100 } },
                        { date: '2026-09-18', count: 2, sum: { visits: 1 }, avg: { sampleInterval: 1_000 } },
                    ]
                    : [];
                return Response.json({ data: { viewer: { accounts: [{ daily: dates.map(row => ({ ...row, dimensions: { date: row.date } })) }] } } });
            }
            const aliases = [...query.matchAll(/(\w+): rumPageloadEventsAdaptiveGroups/g)].map(match => match[1]!);
            return Response.json({ data: { viewer: { accounts: [Object.fromEntries(aliases.map(alias => [alias, []]))] } } });
        };

        const detail = await fetchTrafficDetail(credentials, fetchImpl, now);

        expect(dailyQueries).toHaveLength(2);
        expect(detail.daily).toHaveLength(7);
        expect(detail.daily.filter(point => point.pageViews === 0)).toHaveLength(5);
        expect(detail.daily.filter(point => point.pageViews === 0).every(point => point.sampleInterval === undefined)).toBe(true);
        expect(detail.daily.find(point => point.date === '2026-09-14')).toMatchObject({ pageViews: 8, visits: 5, sampleInterval: 100 });
        expect(detail.daily.find(point => point.date === '2026-09-18')).toMatchObject({ pageViews: 2, visits: 1 });

        const inferredTuesday = detail.daily.find(point => point.date === '2026-09-15')!;
        expect(inferredTuesday).toEqual({ date: '2026-09-15', pageViews: 0, visits: 0 });
        expect(mergeDailyHistory(
            [inferredTuesday],
            [{ date: '2026-09-15', pageViews: 100, visits: 100, sampleInterval: 1_000 }],
            400,
            '2026-09-25',
        )).toEqual([{ date: '2026-09-15', pageViews: 100, visits: 100, sampleInterval: 1_000 }]);
    });

    test('retries windows without sampleInterval and does not zero-fill fallback data', async () => {
        const settings = { settings: { rumPageloadEventsAdaptiveGroups: { enabled: true, maxDuration: 400 * 86_400, notOlderThan: 15 * 86_400 } } };
        const dailyQueries: string[] = [];
        const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
            const query = JSON.parse(String(init?.body)).query as string;
            if (query.includes('settings {')) return Response.json({ data: { viewer: { accounts: [settings] } } });
            if (query.includes('dimensions { date }')) {
                dailyQueries.push(query);
                if (query.includes('avg { sampleInterval }')) {
                    return Response.json({ errors: [{ message: 'unknown field "sampleInterval"' }] });
                }
                const from = query.match(/datetime_geq: "([^"]+)"/)?.[1] ?? '';
                const daily = from.startsWith('2026-09-12')
                    ? [{ count: 8, sum: { visits: 5 }, dimensions: { date: '2026-09-13' } }]
                    : [];
                return Response.json({ data: { viewer: { accounts: [{ daily }] } } });
            }
            const aliases = [...query.matchAll(/(\w+): rumPageloadEventsAdaptiveGroups/g)].map(match => match[1]!);
            return Response.json({ data: { viewer: { accounts: [Object.fromEntries(aliases.map(alias => [alias, []]))] } } });
        };

        const detail = await fetchTrafficDetail(credentials, fetchImpl, now);

        expect(dailyQueries.filter(query => query.includes('avg { sampleInterval }'))).toHaveLength(1);
        expect(dailyQueries.filter(query => !query.includes('avg { sampleInterval }'))).toHaveLength(2);
        expect(detail.daily).toEqual([{ date: '2026-09-13', pageViews: 8, visits: 5 }]);
    });

    test('rejects a failed daily window and reports unavailable detail from loadSiteStats', async () => {
        const settings = { settings: { rumPageloadEventsAdaptiveGroups: { enabled: true, maxDuration: 400 * 86_400, notOlderThan: 15 * 86_400 } } };
        const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes('api.github.com')) {
                return Response.json({ stargazers_count: 1, forks_count: 2 });
            }
            const query = JSON.parse(String(init?.body)).query as string;
            if (query.includes('settings {')) return Response.json({ data: { viewer: { accounts: [settings] } } });
            if (query.includes('dimensions { date }')) {
                const message = query.includes('avg { sampleInterval }')
                    ? 'unknown field "sampleInterval"'
                    : 'temporary daily window failure';
                return Response.json({ errors: [{ message }] });
            }
            const aliases = [...query.matchAll(/(\w+): rumPageloadEventsAdaptiveGroups/g)].map(match => match[1]!);
            return Response.json({ data: { viewer: { accounts: [Object.fromEntries(aliases.map(alias => [alias, []]))] } } });
        };

        await expect(fetchTrafficDetail(credentials, fetchImpl, now)).rejects.toThrow('temporary daily window failure');
        await expect(loadSiteStats({ accountId: credentials.accountId, token: credentials.token }, fetchImpl))
            .resolves.toMatchObject({ detail: null });
    });
});

describe('mergeDailyHistory', () => {
    test('keeps finer samples and replaces entries without prior sampling metadata', () => {
        const previous = [
            { date: '2026-09-24', pageViews: 400, visits: 300, sampleInterval: 100 },
            { date: '2026-09-25', pageViews: 0, visits: 0, sampleInterval: 1_000 },
            { date: '2026-09-26', pageViews: 10, visits: 5 },
        ];
        const fresh = [
            { date: '2026-09-24', pageViews: 0, visits: 0, sampleInterval: 1_000 },
            { date: '2026-09-25', pageViews: 100, visits: 50, sampleInterval: 100 },
            { date: '2026-09-26', pageViews: 12, visits: 6, sampleInterval: 100 },
        ];

        expect(mergeDailyHistory(previous, fresh, 400, '2026-09-26')).toEqual([
            previous[0]!,
            fresh[1]!,
            fresh[2]!,
        ]);
    });

    test('replaces unsampled history but does not replace sampled entries with unknown intervals', () => {
        const previous = [{ date: '2026-09-24', pageViews: 400, visits: 300, sampleInterval: 100 }];
        const fresh = [
            { date: '2026-09-24', pageViews: 0, visits: 0 },
            { date: '2026-09-25', pageViews: 8, visits: 5 },
        ];

        expect(mergeDailyHistory(previous, fresh, 400, '2026-09-25')).toEqual([
            previous[0]!,
            fresh[1]!,
        ]);

        const previousWithoutInterval = [{ date: '2026-09-24', pageViews: 400, visits: 300 }];
        expect(mergeDailyHistory(previousWithoutInterval, [fresh[0]!], 400, '2026-09-25'))
            .toEqual([fresh[0]!]);
    });

    test('filters invalid and future dates, sorts, and keeps only the last maxDays', () => {
        const history = [
            { date: '2026-09-26', pageViews: 3, visits: 2 },
            { date: '2026-09-24', pageViews: 1, visits: 1 },
            { date: '2026-02-30', pageViews: 1, visits: 1 },
            { date: '2026-10-01', pageViews: 1, visits: 1 },
        ];
        const fresh = [{ date: '2026-09-25', pageViews: 2, visits: 1 }];

        expect(mergeDailyHistory(history, fresh, 2, '2026-09-30').map(point => point.date))
            .toEqual(['2026-09-25', '2026-09-26']);
    });
});
