import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

let domReadyHandler = null;
let refreshVotingButtonsCalls = 0;
let setVotingContextCalls = 0;
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

mock.module('./auth.js', () => ({
    auth: {
        isAuthenticated: () => true
    }
}));

describe('app deferred auth bootstrap', () => {
    beforeEach(() => {
        domReadyHandler = null;
        refreshVotingButtonsCalls = 0;
        setVotingContextCalls = 0;
        capturedOnStateChange = null;
        const iconSidebar = makeContainer();

        const elements = {
            toolGrid: {},
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

        expect(setVotingContextCalls).toBeGreaterThanOrEqual(3);
        expect(refreshVotingButtonsCalls).toBe(2);
    });
});
