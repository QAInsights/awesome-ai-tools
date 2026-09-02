import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

function makeClassList(initial = []) {
    const classes = new Set(initial);
    const removals = [];
    return {
        add: token => classes.add(token),
        remove: token => {
            classes.delete(token);
            removals.push(token);
        },
        contains: token => classes.has(token),
        removals,
    };
}

function makeElement(initialClasses = []) {
    return {
        classList: makeClassList(initialClasses),
        innerHTML: '',
        textContent: '',
    };
}

describe('favorites page bootstrap', () => {
    let elements;

    beforeEach(() => {
        elements = {
            'favorites-tools-data': {
                textContent: JSON.stringify([{
                    slug: 'cursor',
                    name: 'Cursor',
                    company: 'Anysphere',
                    category: 'AI IDEs',
                    description: 'AI code editor',
                }]),
            },
            favoritesLoading: makeElement(),
            favoritesSignedOut: makeElement(['hidden']),
            favoritesError: makeElement(['hidden']),
            favoritesEmpty: makeElement(['hidden']),
            favoritesGrid: makeElement(['hidden']),
            favoriteCount: makeElement(['hidden']),
        };
        global.document = {
            addEventListener: () => {},
            getElementById: id => elements[id] ?? null,
        };
        global.window = { location: { href: '' } };
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    test('does not render signed-out state when the initial authenticated load emits', async () => {
        let authenticated = false;
        let storeListener = null;
        const authListeners = [];
        const user = { id: 'github:user-1', provider: 'github' };
        const authManager = {
            initialize: async () => { authenticated = true; },
            getCurrentUser: () => authenticated ? user : null,
            isAuthenticated: () => authenticated,
            onAuthChange: listener => authListeners.push(listener),
            signOut: async () => {
                authenticated = false;
                authListeners.forEach(listener => listener({ event: 'signout', user: null, error: null }));
                return true;
            },
        };
        const favoritesApi = {
            getFavoriteRecords: () => [{ slug: 'cursor', createdAt: 10 }],
            initFavorites: () => {},
            syncFavorites: async () => {
                storeListener?.();
                return { authenticated: true, favorites: [{ slug: 'cursor', createdAt: 10 }], stale: false };
            },
            refreshFavoriteButtons: () => {},
            subscribeFavorites: listener => {
                storeListener = listener;
                return () => {};
            },
        };
        const followsApi = {
            initFollows: () => {},
            syncFollows: async () => ({ authenticated: true, follows: [], stale: false }),
            refreshFollowButtons: () => {},
            subscribeFollows: () => () => {},
        };
        const { initializeFavoritesPage } = await import(`./favorites-page.js?test=${Date.now()}`);

        await initializeFavoritesPage({ authManager, favoritesApi, followsApi });

        expect(elements.favoritesSignedOut.classList.removals).toEqual([]);
        expect(elements.favoritesGrid.classList.contains('hidden')).toBe(false);
        expect(elements.favoriteCount.textContent).toBe('1 saved');
        expect(elements.favoritesGrid.innerHTML).toContain('follow-btn');
    });
});
