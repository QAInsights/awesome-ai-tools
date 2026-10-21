import { describe, expect, test } from 'bun:test';
import { createAuthAttribution } from './auth-attribution.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
}

describe('auth attribution', () => {
    test('keeps a trigger across a page redirect and writes one shared cookie', () => {
        const storage = memoryStorage();
        const firstLocation = { href: '', protocol: 'https:' };
        createAuthAttribution({ storage, documentRef: {}, locationRef: firstLocation }).open('favorite_heart');
        expect(firstLocation.href).toBe('/?signin=1');

        const documentRef = { cookie: '', getElementById: () => null };
        const attribution = createAuthAttribution({ storage, documentRef, locationRef: { protocol: 'https:' } });
        expect(attribution.begin()).toBe('favorite_heart');
        expect(documentRef.cookie).toContain('aat_auth_trigger=favorite_heart');
    });

    test('uses sidebar for unknown triggers', () => {
        const attribution = createAuthAttribution({
            storage: memoryStorage(),
            documentRef: {},
            locationRef: { protocol: 'http:' },
        });
        attribution.setPending('unknown');
        expect(attribution.begin()).toBe('sidebar');
    });

    test('keeps a follow subject with its trigger until the modal opens', () => {
        const attribution = createAuthAttribution({
            storage: memoryStorage(),
            documentRef: {},
            locationRef: { protocol: 'https:', href: '' },
        });

        attribution.setPending('follow_bell', 'Cursor');
        expect(attribution.begin()).toBe('follow_bell');
        expect(attribution.subject()).toBe('Cursor');
        attribution.clear();
        expect(attribution.subject()).toBe('');
    });
});
