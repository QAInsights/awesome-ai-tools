import { describe, expect, test } from 'bun:test';

import {
    SITE_HOSTS,
    buildRetentionChunks,
    buildRumQuery,
    fetchGitHubStats,
    fetchTrafficDetail,
    fetchTrafficStats,
    mergeDimensionGroups,
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

    test('sorts breakdown rows by page views and caps the list', () => {
        const totals = new Map([
            ['/b', { pageViews: 5, visits: 1 }],
            ['/a', { pageViews: 9, visits: 4 }],
            ['/c', { pageViews: 5, visits: 3 }],
        ]);
        expect(topBreakdownRows(totals, 2)).toEqual([
            { label: '/a', pageViews: 9, visits: 4 },
            { label: '/c', pageViews: 5, visits: 3 },
        ]);
    });

    test('builds complete-day series and per-range breakdowns', async () => {
        const bodies: string[] = [];
        const settings = Response.json({
            data: { viewer: { accounts: [{ settings: { rumPageloadEventsAdaptiveGroups: { enabled: true, maxDuration: 400 * 86_400, notOlderThan: 400 * 86_400 } } }] } },
        });
        const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
            bodies.push(String(init?.body));
            if (bodies.length === 1) return settings;
            if (bodies.length === 2) {
                return Response.json({
                    data: { viewer: { accounts: [{ d0: [
                        { count: 8, sum: { visits: 5 }, dimensions: { date: '2026-09-25' } },
                        { count: 2, sum: { visits: 1 }, dimensions: { date: '2026-09-24' } },
                        { count: 1, sum: { visits: 1 }, dimensions: { date: '2026-09-26' } },
                    ] }] } },
                });
            }
            return Response.json({
                data: { viewer: { accounts: [{
                    pages0: [{ count: 7, sum: { visits: 3 }, dimensions: { requestPath: '/advertise' } }],
                    referrers0: [{ count: 2, sum: { visits: 2 }, dimensions: { refererHost: '' } }],
                    countries0: [{ count: 4, sum: { visits: 2 }, dimensions: { countryName: 'IN' } }],
                    devices0: [{ count: 5, sum: { visits: 2 }, dimensions: { deviceType: 'desktop' } }],
                }] } },
            });
        };

        const detail = await fetchTrafficDetail(credentials, fetchImpl, now);

        expect(detail.daily).toEqual([
            { date: '2026-09-24', pageViews: 2, visits: 1 },
            { date: '2026-09-25', pageViews: 8, visits: 5 },
        ]);
        expect(Object.keys(detail.breakdowns)).toEqual(['7', '30', '90']);
        expect(detail.breakdowns['30']).toEqual({
            pages: [{ label: '/advertise', pageViews: 7, visits: 3 }],
            referrers: [{ label: 'Direct / none', pageViews: 2, visits: 2 }],
            countries: [{ label: 'IN', pageViews: 4, visits: 2 }],
            devices: [{ label: 'desktop', pageViews: 5, visits: 2 }],
        });
        expect(bodies).toHaveLength(5);
        const dailyQuery = JSON.parse(bodies[1]!).query as string;
        expect(dailyQuery).toContain('dimensions { date }');
        expect(dailyQuery).toContain('datetime_leq: "2026-09-26T00:00:00Z"');
        const breakdownQuery = JSON.parse(bodies[2]!).query as string;
        for (const dimension of ['requestPath', 'refererHost', 'countryName', 'deviceType']) {
            expect(breakdownQuery).toContain(`dimensions { ${dimension} }`);
        }
    });
});
