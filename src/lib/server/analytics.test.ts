import { afterAll, describe, expect, mock, test } from 'bun:test';

const points: unknown[] = [];
let shouldThrow = false;
mock.module('cloudflare:workers', () => ({
    env: {
        CF_VERSION_METADATA: { id: 'version-123' },
        ANALYTICS: {
            writeDataPoint(point: unknown) {
                if (shouldThrow) throw new Error('unavailable');
                points.push(point);
            },
        },
    },
    waitUntil() {},
}));

const { EVENTS } = await import('../analytics-events.js');
const { buildDataPoint, track } = await import(`./analytics.ts?test=${Date.now()}`);

afterAll(() => mock.restore());

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
});
