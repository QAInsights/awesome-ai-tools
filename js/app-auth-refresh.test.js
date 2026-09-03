import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { AuthManager } from './auth.js';

let domReadyHandler = null;
let refreshVotingButtonsCalls = 0;
let setVotingContextCalls = 0;
let loadFavoritesCalls = 0;
let loadFollowsCalls = 0;
let capturedFavoriteOptions = null;
let capturedOnStateChange = null;

function flushMicrotasks(times = 5) {
    let chain = Promise.resolve();
    for (let i = 0; i < times; i += 1) {
        chain = chain.then(() => Promise.resolve());
    }
    return chain;
}

function makeButton(id) {
    const listeners = {};
    return {
        id,
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: (event, fn) => {
            listeners[event] = fn;
        }
    };
}

function makeContainer() {
    let html = '';
    const queryMap = {};

    return {
        set innerHTML(value) {
            html = value;
            for (const key of Object.keys(queryMap)) delete queryMap[key];
            const idMatches = [...value.matchAll(/id="([^"]+)"/g)];
            idMatches.forEach(([, id]) => {
                queryMap[`#${id}`] = makeButton(id);
            });
        },
        get innerHTML() {
            return html;
        },
        querySelector: (selector) => queryMap[selector] ?? null
    };
}

mock.module('./renderer.js', () => ({
    initRenderer: () => {},
    renderTools: () => {},
    hydrateGrid: () => {},
    setFavoriteContext: () => {},
    setVotingContext: () => {
        setVotingContextCalls += 1;
    },
    refreshVotingButtons: () => {
        refreshVotingButtonsCalls += 1;
    }
}));

mock.module('./gradient-selection.js', () => ({
    initGradientSelection: () => {}
}));

mock.module('./modules/filter-manager.js', () => ({
    isSearchShortcutEvent: event => event?.key === '/'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.defaultPrevented
        && !event.target?.isContentEditable
        && event.target?.tagName !== 'INPUT'
        && event.target?.tagName !== 'TEXTAREA'
        && event.target?.tagName !== 'SELECT',
    initFilterManager: () => ({
        renderFilters: () => {},
        filterAndRender: () => {}
    })
}));

mock.module('./modules/ui-manager.js', () => ({
    initUiManager: () => {}
}));

mock.module('./modules/sort-manager.js', () => ({
    initSortManager: () => {}
}));

mock.module('./modules/auth-manager.js', () => ({
    initAuthManager: ({ onStateChange }) => {
        capturedOnStateChange = onStateChange;
        return {
            initializeAuth: async () => {}
        };
    }
}));

mock.module('./favorites.js', () => ({
    initFavorites: options => {
        capturedFavoriteOptions = options;
    },
    clearFavorites: () => {},
    getFavoriteRecords: () => [],
    loadFavorites: async () => {
        loadFavoritesCalls += 1;
    },
    refreshFavoriteButtons: () => {},
    subscribeFavorites: () => () => {},
    syncFavorites: async () => {
        loadFavoritesCalls += 1;
        return { authenticated: true, favorites: [], stale: false };
    }
}));

mock.module('./follows.js', () => ({
    initFollows: () => {},
    clearFollows: () => {},
    getFollowRecords: () => [],
    loadFollows: async () => {
        loadFollowsCalls += 1;
    },
    refreshFollowButtons: () => {},
    subscribeFollows: () => () => {},
    syncFollows: async () => ({ authenticated: true, follows: [], stale: false }),
}));

mock.module('./auth.js', () => ({
    AuthManager,
    auth: {
        getCurrentUser: () => ({ id: 'github:user-1', provider: 'github' }),
        isAuthenticated: () => true,
        signOut: async () => true
    }
}));

afterAll(() => mock.restore());

describe('app deferred auth bootstrap', () => {
    beforeEach(() => {
        domReadyHandler = null;
        refreshVotingButtonsCalls = 0;
        setVotingContextCalls = 0;
        loadFavoritesCalls = 0;
        loadFollowsCalls = 0;
        capturedFavoriteOptions = null;
        capturedOnStateChange = null;
        const iconSidebar = makeContainer();

        const elements = {
            toolGrid: { hasAttribute: () => false },
            searchInput: { value: '', focus: () => {} },
            'tools-data': {
                textContent: JSON.stringify([
                    { name: 'Cursor', company: 'Anysphere', category: 'AI IDEs', enriched: { ignore: true } }
                ])
            },
            openSidebarDesktop: { click: () => {} },
            signInTriggerBtn: { click: () => {} },
            userProfileBtn: { click: () => {} },
            iconSidebar
        };

        global.window = {
            location: { search: '' },
            requestIdleCallback: (callback) => {
                callback();
                return 1;
            }
        };

        global.document = {
            addEventListener: (event, handler) => {
                if (event === 'DOMContentLoaded') {
                    domReadyHandler = handler;
                }
            },
            getElementById: (id) => elements[id] ?? null,
            querySelectorAll: () => [],
            querySelector: () => null,
            body: { style: {} }
        };
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    test('refreshes zap buttons again when auth state changes after bootstrap', async () => {
        await import(`./app.js?test=${Date.now()}`);

        expect(typeof domReadyHandler).toBe('function');

        await domReadyHandler();
        await flushMicrotasks();
        await new Promise(resolve => setTimeout(resolve, 0));
        await flushMicrotasks();

        expect(setVotingContextCalls).toBeGreaterThanOrEqual(2);
        expect(refreshVotingButtonsCalls).toBe(1);
        expect(typeof capturedOnStateChange).toBe('function');

        capturedOnStateChange({ id: 'user-1' });
        await flushMicrotasks();

        expect(setVotingContextCalls).toBeGreaterThanOrEqual(3);
        expect(refreshVotingButtonsCalls).toBe(2);
        expect(loadFavoritesCalls).toBeGreaterThanOrEqual(2);

        capturedFavoriteOptions.onToggle(false, 'cursor');
        await flushMicrotasks();
        expect(loadFollowsCalls).toBe(1);
    });
});
