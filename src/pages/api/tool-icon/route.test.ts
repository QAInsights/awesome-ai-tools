import { afterEach, describe, expect, test } from 'bun:test';
import { GET } from './[slug]';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function requestIcon(slug: string) {
    return GET({ params: { slug } } as unknown as Parameters<typeof GET>[0]);
}

describe('tool icon route', () => {
    test('returns 404 for an unknown slug without fetching', async () => {
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            return new Response('icon');
        }) as unknown as typeof fetch;

        const response = await requestIcon('not-a-catalog-tool');

        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toStartWith('text/plain');
        expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
        expect(fetchCalled).toBe(false);
    });

    test('returns an image and shared cache headers for a known tool', async () => {
        let requestedUrl = '';
        let redirectMode: RequestRedirect | undefined;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            requestedUrl = String(input);
            redirectMode = init?.redirect;
            return new Response('icon bytes', {
                headers: { 'Content-Type': 'image/png' },
            });
        }) as unknown as typeof fetch;

        const response = await requestIcon('cursor');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=604800');
        expect(await response.text()).toBe('icon bytes');
        expect(requestedUrl).toBe('https://www.google.com/s2/favicons?domain=cursor.com&sz=128');
        expect(redirectMode).toBe('follow');
    });

    test('returns 404 when the upstream response is not an image', async () => {
        globalThis.fetch = (async () => new Response('<html></html>', {
            headers: { 'Content-Type': 'text/html' },
        })) as unknown as typeof fetch;

        const response = await requestIcon('cursor');

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    });

    test('returns 404 when the upstream response is not ok', async () => {
        globalThis.fetch = (async () => new Response('unavailable', {
            status: 502,
            headers: { 'Content-Type': 'image/png' },
        })) as unknown as typeof fetch;

        const response = await requestIcon('cursor');

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    test('returns 404 when the upstream fetch throws', async () => {
        globalThis.fetch = (async () => {
            throw new Error('network failure');
        }) as unknown as typeof fetch;

        const response = await requestIcon('cursor');

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
});
