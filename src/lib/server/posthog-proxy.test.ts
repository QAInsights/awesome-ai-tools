import { describe, expect, test } from 'bun:test';
import {
    filterPostHogHeaders,
    filterPostHogResponseHeaders,
    posthogUpstreamUrl,
    readBodyWithLimit,
} from './posthog-proxy';

describe('PostHog ingest proxy helpers', () => {
    test('maps static assets to the US asset host and preserves the query string', () => {
        expect(posthogUpstreamUrl('/ingest/static/array.js', '?v=1')).toBe(
            'https://us-assets.i.posthog.com/static/array.js?v=1',
        );
    });

    test('maps ingest requests to the US API host and preserves the query string', () => {
        expect(posthogUpstreamUrl('/ingest/i/v0/e/', '?ip=1')).toBe(
            'https://us.i.posthog.com/i/v0/e/?ip=1',
        );
    });

    test('strips cookies, host and Cloudflare headers while forwarding the Cloudflare client IP', () => {
        const forwarded = filterPostHogHeaders(new Headers({
            Cookie: 'session=secret',
            Host: 'ai.dosa.dev',
            'CF-Connecting-IP': '203.0.113.9',
            'CF-Ray': 'ray-id',
            Accept: 'application/json',
            'X-Request-Id': 'request-id',
        }));

        expect(forwarded.get('cookie')).toBeNull();
        expect(forwarded.get('host')).toBeNull();
        expect(forwarded.get('cf-ray')).toBeNull();
        expect(forwarded.get('accept')).toBe('application/json');
        expect(forwarded.get('x-request-id')).toBe('request-id');
        expect(forwarded.get('x-forwarded-for')).toBe('203.0.113.9');
    });

    test('strips Set-Cookie from upstream response headers', () => {
        const forwarded = filterPostHogResponseHeaders(new Headers({
            'Set-Cookie': 'session=secret',
            'Content-Type': 'application/json',
        }));

        expect(forwarded.get('set-cookie')).toBeNull();
        expect(forwarded.get('content-type')).toBe('application/json');
    });

    test('rejects a declared body length over the limit without reading the body', async () => {
        const request = {
            headers: new Headers({ 'Content-Length': '11' }),
            body: { getReader() { throw new Error('body should not be read'); } },
        } as unknown as Request;

        expect(await readBodyWithLimit(request, 10)).toBeNull();
    });

    test('cancels a streamed body that exceeds the limit', async () => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3, 4, 5, 6]));
                controller.enqueue(new Uint8Array([7, 8, 9, 10, 11, 12]));
            },
            cancel() { cancelled = true; },
        });
        const request = { headers: new Headers(), body } as Request;

        expect(await readBodyWithLimit(request, 10)).toBeNull();
        expect(cancelled).toBe(true);
    });

    test('round-trips a normal streamed body byte-for-byte', async () => {
        const expected = new Uint8Array([0, 1, 2, 127, 128, 255]);
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(expected.slice(0, 2));
                controller.enqueue(expected.slice(2));
                controller.close();
            },
        });
        const request = { headers: new Headers(), body } as Request;

        const actual = await readBodyWithLimit(request, 10);

        expect(Array.from(new Uint8Array(actual!))).toEqual(Array.from(expected));
    });
});
