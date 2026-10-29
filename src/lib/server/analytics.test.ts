import { afterAll, describe, expect, mock, test } from 'bun:test';

const points: unknown[] = [];
const waitUntilPromises: Promise<unknown>[] = [];
const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];
let shouldThrow = false;
const originalFetch = globalThis.fetch;

const env = {
    CF_VERSION_METADATA: { id: 'version-123' },
    POSTHOG_KEY: 'phc-test-key',
    POSTHOG_HOST: 'https://posthog.example',
    ANALYTICS: {
        writeDataPoint(point: unknown) {
            if (shouldThrow) throw new Error('unavailable');
            points.push(point);
        },
    },
};

mock.module('cloudflare:workers', () => ({
    env,
    waitUntil(promise: Promise<unknown>) { waitUntilPromises.push(promise); },
}));

const { EVENTS } = await import('../analytics-events.js');
const { buildDataPoint, track } = await import(`./analytics.ts?test=${Date.now()}`);

afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
});

describe('analytics event schema', () => {
    test('keeps the positional Analytics Engine schema stable', () => {
        const point = buildDataPoint(EVENTS.SIGNIN_COMPLETED, {
            anonId: 'anon-1',
            userId: 'github:42',
            trigger: 'sidebar',
            subject: 'cursor',
            route: '/tools/:slug',
            provider: 'github',
            referrerHost: 'example.com',
            authState: 'auth',
            device: 'desktop',
            country: 'US',
            variant: 'control',
            value: 1,
            durationMs: 25,
        });

        expect(point.indexes).toEqual(['signin_completed']);
        expect(point.blobs.slice(0, 11)).toEqual([
            'signin_completed', 'anon-1', 'github:42', 'sidebar', 'cursor',
            '/tools/:slug', 'github', 'example.com', 'auth', 'desktop', 'US',
        ]);
        expect(point.blobs[11]).toBe('version-123');
        expect(point.blobs[12]).toBe('control');
        expect(point.doubles).toEqual([1, 25]);
    });

    test('truncates blobs and normalizes missing values', () => {
        const point = buildDataPoint(EVENTS.OUTBOUND_CLICK, { subject: 'x'.repeat(300) });
        expect(point.blobs[4]).toHaveLength(256);
        expect(point.blobs[1]).toBe('');
        expect(point.blobs[8]).toBe('anon');
        expect(point.doubles).toEqual([1, 0]);
    });

    test('never lets a binding failure escape', () => {
        shouldThrow = true;
        expect(() => track(EVENTS.AUTH_ERROR)).not.toThrow();
        shouldThrow = false;
    });

    test('mirrors server events when the Analytics Engine write throws', async () => {
        waitUntilPromises.length = 0;
        fetchCalls.length = 0;
        globalThis.fetch = ((...args: [RequestInfo | URL, RequestInit?]) => {
            fetchCalls.push(args);
            return Promise.resolve(new Response(null, { status: 200 }));
        }) as typeof fetch;
        shouldThrow = true;

        try {
            expect(() => track(EVENTS.FAVORITE_ADDED, {
                userId: 'github:42',
                trigger: 'favorite_heart',
                subject: 'cursor',
            })).not.toThrow();
            await Promise.all(waitUntilPromises);

            expect(fetchCalls).toHaveLength(1);
            const [, options] = fetchCalls[0]!;
            expect(JSON.parse(String(options?.body))).toMatchObject({
                event: EVENTS.FAVORITE_ADDED,
                distinct_id: 'github:42',
            });
        } finally {
            shouldThrow = false;
            globalThis.fetch = originalFetch;
        }
    });
});
