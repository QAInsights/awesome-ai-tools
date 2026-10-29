import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const env: Record<string, unknown> = {
    POSTHOG_KEY: 'phc-test-key',
    POSTHOG_HOST: 'https://posthog.example',
    ANALYTICS: {
        writeDataPoint(point: unknown) {
            dataPoints.push(point);
        },
    },
};
const waitUntilPromises: Promise<unknown>[] = [];
const dataPoints: unknown[] = [];
const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];

mock.module('cloudflare:workers', () => ({
    env,
    waitUntil(promise: Promise<unknown>) {
        waitUntilPromises.push(promise);
    },
}));

const { EVENTS } = await import('../analytics-events.js');
const { buildPostHogEvent, capturePostHog } = await import(`./posthog.ts?test=${Date.now()}`);
const { track } = await import(`./analytics.ts?posthog-test=${Date.now()}`);
const originalFetch = globalThis.fetch;

beforeEach(() => {
    fetchCalls.length = 0;
    waitUntilPromises.length = 0;
    dataPoints.length = 0;
    env.POSTHOG_KEY = 'phc-test-key';
    env.POSTHOG_HOST = 'https://posthog.example';
    globalThis.fetch = ((...args: [RequestInfo | URL, RequestInit?]) => {
        fetchCalls.push(args);
        return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
});

afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
});

describe('server PostHog capture', () => {
    test('builds a capture payload with normalized properties and the user id', () => {
        const payload = buildPostHogEvent(EVENTS.SIGNIN_COMPLETED, {
            userId: 'github:42',
            anonId: 'anon-1',
            trigger: 'sidebar',
            provider: 'github',
            route: '/tools/:slug',
            device: 'desktop',
            country: 'US',
            value: 1,
            durationMs: 25,
            email: 'private@example.com',
        });

        expect(payload.api_key).toBe('phc-test-key');
        expect(payload.event).toBe(EVENTS.SIGNIN_COMPLETED);
        expect(payload.distinct_id).toBe('github:42');
        expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
        expect(payload.properties).toEqual({
            source: 'server',
            $lib: 'ai-dosa-dev-worker',
            $geoip_disable: true,
            trigger: 'sidebar',
            provider: 'github',
            route: '/tools/:slug',
            device: 'desktop',
            country: 'US',
            value: 1,
            durationMs: 25,
        });
    });

    test('uses anonId before a generated id and disables anonymous profile processing', () => {
        const anonymousPayload = buildPostHogEvent(EVENTS.SIGNOUT, { anonId: 'anon-2' });
        const generatedPayload = buildPostHogEvent(EVENTS.SIGNOUT);

        expect(anonymousPayload.distinct_id).toBe('anon-2');
        expect(anonymousPayload.properties.$process_person_profile).toBe(false);
        expect(generatedPayload.distinct_id).toMatch(/^[0-9a-f-]{36}$/i);
        expect(generatedPayload.properties.$process_person_profile).toBe(false);
    });

    test('does not fetch when the project key is empty', () => {
        env.POSTHOG_KEY = '';

        expect(() => capturePostHog(EVENTS.SIGNOUT)).not.toThrow();
        expect(fetchCalls).toHaveLength(0);
        expect(waitUntilPromises).toHaveLength(0);
    });

    test('mirrors server-only events but does not mirror client events', async () => {
        track(EVENTS.SIGNIN_COMPLETED, { userId: 'github:42', provider: 'github', trigger: 'sidebar' });
        track(EVENTS.ZAP_CAST, { subject: 'cursor', trigger: 'zap_btn' });
        await Promise.all(waitUntilPromises);

        expect(dataPoints).toHaveLength(2);
        expect(fetchCalls).toHaveLength(1);
        const [url, options] = fetchCalls[0]!;
        expect(url).toBe('https://posthog.example/i/v0/e/');
        expect(JSON.parse(String(options?.body))).toMatchObject({
            event: EVENTS.SIGNIN_COMPLETED,
            distinct_id: 'github:42',
            properties: { source: 'server', provider: 'github' },
        });
    });
});
