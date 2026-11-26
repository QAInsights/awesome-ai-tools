import { isFavoriteSlug, MAX_GUEST_FAVORITES } from '../src/lib/favorite-slugs.js';

export const GUEST_FAVORITES_KEY = 'dosa:guest-favorites:v1';

function readSlugs(storage) {
    const raw = storage.getItem(GUEST_FAVORITES_KEY);
    try {
        const parsed = JSON.parse(raw ?? '[]');
        return Array.isArray(parsed)
            ? [...new Set(parsed.filter(isFavoriteSlug))].slice(0, MAX_GUEST_FAVORITES)
            : [];
    } catch {
        return [];
    }
}

export function createGuestFavoritesStore({ getStorage = () => globalThis.localStorage } = {}) {
    function slugs() {
        try {
            return readSlugs(getStorage());
        } catch {
            return [];
        }
    }

    function toggle(slug) {
        if (!isFavoriteSlug(slug)) throw new TypeError('Invalid favorite');
        const storage = getStorage();
        const current = readSlugs(storage);
        const added = !current.includes(slug);
        if (added && current.length >= MAX_GUEST_FAVORITES) {
            throw new RangeError(`This browser can save up to ${MAX_GUEST_FAVORITES} favorites.`);
        }
        const next = added ? [slug, ...current] : current.filter(value => value !== slug);
        storage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(next));
        return added;
    }

    function removeImported(imported) {
        const storage = getStorage();
        const slugsToRemove = new Set(imported);
        const current = readSlugs(storage);
        const remaining = current.filter(slug => !slugsToRemove.has(slug));
        if (remaining.length !== current.length) {
            storage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(remaining));
        }
    }

    return { slugs, toggle, removeImported };
}
