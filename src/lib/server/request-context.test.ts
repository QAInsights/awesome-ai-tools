import { describe, expect, test } from 'bun:test';
import { getRequestContext, normalizeRoute } from './request-context';

describe('analytics request context', () => {
    test('normalizes high-cardinality content routes', () => {
        expect(normalizeRoute('/tools/cursor')).toBe('/tools/:slug');
        expect(normalizeRoute('/tools/cursor/alternatives')).toBe('/tools/:slug/alternatives');
        expect(normalizeRoute('/compare/cursor-vs-devin')).toBe('/compare/:pair');
        expect(normalizeRoute('/api/follows/cursor')).toBe('/api/follows/:slug');
    });

    test('attributes collector requests to the same-origin referring page', () => {
        const request = new Request('https://ai.dosa.dev/api/events', {
            headers: {
                Referer: 'https://ai.dosa.dev/tools/cursor?source=directory',
                'User-Agent': 'Mozilla/5.0 (iPhone; Mobile)',
            },
        });
        expect(getRequestContext(request)).toMatchObject({
            route: '/tools/:slug',
            referrerHost: 'ai.dosa.dev',
            device: 'mobile',
        });
    });

    test('does not trust a cross-origin referrer as the event route', () => {
        const request = new Request('https://ai.dosa.dev/api/events', {
            headers: { Referer: 'https://example.com/private/path' },
        });
        expect(getRequestContext(request).route).toBe('/api/events');
    });

    test('collapses unknown same-origin paths', () => {
        const request = new Request('https://ai.dosa.dev/api/events', {
            headers: { Referer: 'https://ai.dosa.dev/spoofed/path' },
        });
        expect(getRequestContext(request).route).toBe('/other');
    });
});
