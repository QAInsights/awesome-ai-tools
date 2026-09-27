import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SiteStats } from '../../../src/lib/server/site-stats';

let loadCalls = 0;
let stats: SiteStats = successfulStats();
let loadError: Error | null = null;

function successfulStats(): SiteStats {
    return {
        generatedAt: '2026-09-26T10:00:00.000Z',
        traffic: {
            last30: { pageViews: 100, visits: 40 },
            lifetime: { pageViews: 1_000, visits: 400, since: '2026-08-01T00:00:00Z' },
        },
        github: { stars: 250, forks: 30 },
    };
}

mock.module('../../../src/lib/server/site-stats', () => ({
    loadSiteStats: async () => {
        loadCalls++;
        if (loadError) throw loadError;
        return stats;
    },
}));

const { GET } = await import(`../../../src/pages/api/stats.ts?test=${Date.now()}`);
mock.restore();

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
let cacheHit: Response | undefined;
let puts: Array<{ key: Request; response: Response }> = [];

beforeEach(() => {
    loadCalls = 0;
    loadError = null;
    stats = successfulStats();
    cacheHit = undefined;
    puts = [];
    Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        value: {
            default: {
                match: async () => cacheHit,
                put: async (key: Request, response: Response) => {
                    puts.push({ key, response });
                },
            },
        },
    });
});

afterAll(() => {
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete (globalThis as Record<string, unknown>).caches;
});

function request(): Request {
    return new Request('https://ai.dosa.dev/api/stats?ignored=1');
}

describe('/api/stats', () => {
    test('loads, returns, and caches stats on a cache miss', async () => {
        const response = await GET({ request: request() } as never);

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
        expect(await response.json()).toEqual(successfulStats());
        expect(loadCalls).toBe(1);
        expect(puts).toHaveLength(1);
        expect(puts[0]?.key.url).toBe('https://ai.dosa.dev/api/stats');
        expect(await puts[0]?.response.json()).toEqual(successfulStats());
    });

    test('returns a cached response without loading fresh stats', async () => {
        cacheHit = Response.json({ cached: true }, { headers: { 'X-Cache': 'hit' } });

        const response = await GET({ request: request() } as never);

        expect(await response.json()).toEqual({ cached: true });
        expect(response.headers.get('X-Cache')).toBe('hit');
        expect(loadCalls).toBe(0);
        expect(puts).toHaveLength(0);
    });

    test('does not cache a response when both upstream sources fail', async () => {
        stats = {
            generatedAt: '2026-09-26T10:00:00.000Z',
            traffic: null,
            github: null,
        };

        const response = await GET({ request: request() } as never);

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual(stats);
        expect(puts).toHaveLength(0);
    });
});
