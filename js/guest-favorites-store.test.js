import { describe, expect, test } from 'bun:test';
import { createGuestFavoritesStore, GUEST_FAVORITES_KEY } from './guest-favorites-store.js';
import { MAX_GUEST_FAVORITES } from '../src/lib/favorite-slugs.js';

function setup(raw) {
    const data = new Map(raw === undefined ? [] : [[GUEST_FAVORITES_KEY, raw]]);
    const getStorage = () => ({
        getItem: key => data.get(key),
        setItem: (key, value) => data.set(key, value),
    });
    return { store: createGuestFavoritesStore({ getStorage }), getStorage };
}

describe('guest Favorites storage', () => {
    test('preserves saves across page instances and removes them', () => {
        const { store, getStorage } = setup();
        expect(store.toggle('cursor')).toBe(true);
        expect(store.toggle('claude-code')).toBe(true);
        const nextPage = createGuestFavoritesStore({ getStorage });
        expect(nextPage.slugs()).toEqual(['claude-code', 'cursor']);
        expect(nextPage.toggle('cursor')).toBe(false);
        expect(store.slugs()).toEqual(['claude-code']);
    });

    test('handles malformed JSON and filters invalid or duplicate values', () => {
        expect(setup('{').store.slugs()).toEqual([]);
        expect(setup('{"cursor":true}').store.slugs()).toEqual([]);
        const { store } = setup(JSON.stringify(['cursor', 'cursor', null, '../../account', 'a'.repeat(129)]));
        expect(store.slugs()).toEqual(['cursor']);
        expect(() => store.toggle('Cursor')).toThrow('Invalid favorite');
    });

    test('does not pretend a blocked or failed storage write succeeded', () => {
        const blocked = createGuestFavoritesStore({ getStorage: () => { throw new Error('Blocked'); } });
        expect(blocked.slugs()).toEqual([]);
        expect(() => blocked.toggle('cursor')).toThrow('Blocked');
        const full = createGuestFavoritesStore({
            getStorage: () => ({
                getItem: () => '["cursor"]',
                setItem: () => { throw new Error('Quota exceeded'); },
            }),
        });
        expect(() => full.toggle('cursor')).toThrow('Quota exceeded');
        expect(full.slugs()).toEqual(['cursor']);
    });

    test('limits the list but still allows removal', () => {
        const existing = Array.from({ length: MAX_GUEST_FAVORITES }, (_, i) => `tool-${i}`);
        const { store } = setup(JSON.stringify(existing));
        expect(() => store.toggle('cursor')).toThrow(RangeError);
        expect(store.toggle('tool-0')).toBe(false);
        expect(store.toggle('cursor')).toBe(true);
    });

    test('keeps other saves from the browser after import', () => {
        const { store } = setup('["claude-code","cursor"]');
        const imported = store.slugs();
        store.toggle('windsurf');
        store.removeImported(imported);
        expect(store.slugs()).toEqual(['windsurf']);
    });
});
