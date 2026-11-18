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
        toggle: (token, enabled) => enabled ? classes.add(token) : classes.delete(token),
        contains: token => classes.has(token),
        removals,
    };
}

function makeElement(initialClasses = []) {
    const listeners = new Map();
    return {
        classList: makeClassList(initialClasses),
        innerHTML: '',
        textContent: '',
        addEventListener: (name, listener) => listeners.set(name, listener),
        click: () => listeners.get('click')?.(),
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
            guestFavoritesImport: makeElement(['hidden']),
            guestFavoritesImportConfirm: makeElement(),
            guestFavoritesImportDismiss: makeElement(),
            guestFavoritesImportList: makeElement(),
            guestFavoritesImportStatus: makeElement(),
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
        let followOptions = null;
        let favoriteOptions = null;
        let loadFavoritesCalls = 0;
        let loadFollowsCalls = 0;
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
            initFavorites: options => {
                favoriteOptions = options;
            },
            loadFavorites: async () => {
                loadFavoritesCalls += 1;
            },
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
            initFollows: options => {
                followOptions = options;
            },
            loadFollows: async () => {
                loadFollowsCalls += 1;
            },
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
        const actionWrapper = /<div class="grid grid-cols-2 gap-2 @lg:flex @lg:shrink-0">([\s\S]*?)<\/div>/.exec(elements.favoritesGrid.innerHTML)?.[1];
        expect(actionWrapper).toContain('class="favorite-btn detail favorited"');
        expect(actionWrapper).toContain('class="follow-btn detail"');

        followOptions.onToggle(true, 'cursor');
        expect(loadFavoritesCalls).toBe(1);

        favoriteOptions.onToggle(false, 'cursor');
        expect(loadFollowsCalls).toBe(1);
    });

    function guestScenario() {
        let user = null;
        let localSlugs = ['cursor', 'removed-tool'];
        let serverRecords = [];
        const imports = [];
        const listeners = [];
        const guestStore = {
            slugs: () => localSlugs,
            removeImported: slugs => { localSlugs = localSlugs.filter(slug => !slugs.includes(slug)); },
        };
        const authManager = {
            initialize: async () => {},
            getCurrentUser: () => user,
            isAuthenticated: () => Boolean(user),
            onAuthChange: listener => listeners.push(listener),
        };
        const result = () => ({ authenticated: Boolean(user), stale: false });
        const favoritesApi = {
            getFavoriteRecords: () => serverRecords,
            initFavorites: () => {},
            importGuestFavorites: async (slugs, id) => {
                imports.push({ slugs, id });
                serverRecords = [{ slug: 'cursor', createdAt: 10 }];
                return result();
            },
            syncFavorites: async () => result(),
            refreshFavoriteButtons: () => {},
            subscribeFavorites: () => {},
        };
        const followsApi = {
            initFollows: () => {},
            syncFollows: async () => result(),
            refreshFollowButtons: () => {},
            subscribeFollows: () => {},
        };
        async function changeUser(id) {
            user = id ? { id } : null;
            listeners.forEach(listener => listener({ user }));
            await new Promise(resolve => setImmediate(resolve));
        }
        return { options: { authManager, favoritesApi, followsApi, guestStore }, imports, changeUser, guestStore };
    }

    test('shows the guest shortlist and only uploads after explicit consent', async () => {
        const scenario = guestScenario();
        const { initializeFavoritesPage } = await import('./favorites-page.js?test=guest-consent');
        await initializeFavoritesPage(scenario.options);
        expect(elements.favoritesGrid.innerHTML).toContain('Cursor');
        expect(elements.favoritesGrid.innerHTML).not.toContain('follow-btn');
        expect(elements.favoritesSignedOut.classList.contains('hidden')).toBe(false);

        await scenario.changeUser('github:1');
        expect(elements.guestFavoritesImport.classList.contains('hidden')).toBe(false);
        expect(elements.guestFavoritesImportList.innerHTML).toBe('<li>Cursor</li>');
        expect(scenario.imports).toEqual([]);
        elements.guestFavoritesImportDismiss.click();
        expect(elements.guestFavoritesImport.classList.contains('hidden')).toBe(true);
        expect(scenario.guestStore.slugs()).toEqual(['cursor', 'removed-tool']);

        await scenario.changeUser(null);
        await scenario.changeUser('github:1');
        await elements.guestFavoritesImportConfirm.click();
        expect(scenario.imports).toEqual([{ slugs: ['cursor'], id: 'github:1' }]);
        expect(scenario.guestStore.slugs()).toEqual(['removed-tool']);
        expect(elements.guestFavoritesImport.classList.contains('hidden')).toBe(true);
        expect(elements.guestFavoritesImportStatus.textContent).toBe('Browser favorites synced to your account.');
    });

    test('keeps local saves after failure or an account switch during import', async () => {
        const scenario = guestScenario();
        const { initializeFavoritesPage } = await import('./favorites-page.js?test=guest-retry');
        let finishImport;
        scenario.options.favoritesApi.importGuestFavorites = () => new Promise(resolve => { finishImport = resolve; });
        await initializeFavoritesPage(scenario.options);
        await scenario.changeUser('github:1');

        const failed = elements.guestFavoritesImportConfirm.click();
        finishImport({ authenticated: false, stale: false });
        await failed;
        expect(elements.guestFavoritesImportStatus.textContent).toContain('Try again');
        expect(elements.guestFavoritesImportConfirm.disabled).toBe(false);
        expect(scenario.guestStore.slugs()).toEqual(['cursor', 'removed-tool']);

        const retry = elements.guestFavoritesImportConfirm.click();
        await scenario.changeUser('github:2');
        finishImport({ authenticated: true, stale: false });
        await retry;
        expect(elements.guestFavoritesImportStatus.textContent).toBe('');
        expect(scenario.guestStore.slugs()).toEqual(['cursor', 'removed-tool']);
    });
});
