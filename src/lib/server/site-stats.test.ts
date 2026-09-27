import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('cloudflare:workers', () => ({
    env: {
        CF_ACCOUNT_ID: 'account-123',
        CF_ANALYTICS_TOKEN: 'token-456',
    },
}));

const {
    SITE_HOSTS,
    buildRetentionChunks,
    buildRumQuery,
    fetchTrafficStats,
    parseGitHubRepo,
    summarizeRumGroups,
} = await import(`./site-stats.ts?test=${Date.now()}`) as typeof import('./site-stats');

afterAll(() => mock.restore());

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

        const stats = await fetchTrafficStats(fetchImpl, now);

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

        await expect(fetchTrafficStats(fetchImpl, now)).rejects.toThrow('dataset unavailable');
    });
});
