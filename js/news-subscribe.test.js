import { describe, expect, test } from 'bun:test';
import {
    NEWS_SUBSCRIBE_PENDING_KEY,
    handleNewsSubscribeClick,
    renderNewsSubscribeButtons,
    syncNewsSubscribe,
} from './news-subscribe.js';

function createMemoryStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
    };
}

function createFakeDom({ pressed = 'false', defaultLabel = 'Get daily brief by email', activeLabel = 'Subscribed to daily brief' } = {}) {
    const classes = new Set();
    const statusClasses = new Set(['hidden']);
    const labelEl = { textContent: defaultLabel };
    const statusEl = {
        textContent: '',
        classList: {
            add: cls => statusClasses.add(cls),
            remove: cls => statusClasses.delete(cls),
            contains: cls => statusClasses.has(cls),
        },
    };
    const attrs = new Map([['aria-pressed', pressed]]);
    const button = {
        disabled: false,
        dataset: {
            subscribeDefault: defaultLabel,
            subscribeActive: activeLabel,
            subscribeSubject: 'today-in-ai',
        },
        classList: {
            toggle: (cls, force) => {
                if (force) classes.add(cls);
                else classes.delete(cls);
            },
            contains: cls => classes.has(cls),
        },
        getAttribute: name => attrs.get(name) ?? null,
        setAttribute: (name, value) => attrs.set(name, String(value)),
        querySelector: selector => (selector === '[data-subscribe-label]' ? labelEl : null),
    };
    const root = {
        querySelectorAll: selector => {
            if (selector === '[data-news-subscribe]') return [button];
            if (selector === '[data-news-subscribe-status]') return [statusEl];
            return [];
        },
    };
    return { root, button, labelEl, statusEl };
}

describe('news-subscribe', () => {
    test('unauthenticated click stores pending intent, tracks gate_blocked, and opens sign-in modal', async () => {
        const { root, button } = createFakeDom();
        const storage = createMemoryStorage();
        const opened = [];
        const tracked = [];

        const res = await handleNewsSubscribeClick(button, {
            authManager: {
                initialize: async () => {},
                isAuthenticated: () => false,
            },
            attribution: { open: trigger => opened.push(trigger) },
            analyticsClient: { track: (event, payload) => tracked.push({ event, payload }) },
            storage,
            root,
        });

        expect(res.status).toBe('unauthenticated');
        expect(storage.getItem(NEWS_SUBSCRIBE_PENDING_KEY)).toBe('1');
        expect(opened).toEqual(['news_cta']);
        expect(tracked).toEqual([
            { event: 'gate_blocked', payload: { trigger: 'news_cta', subject: 'today-in-ai' } },
        ]);
    });

    test('authenticated click toggles subscription and renders active state with email', async () => {
        const { root, button, labelEl, statusEl } = createFakeDom();
        const calls = [];

        const res = await handleNewsSubscribeClick(button, {
            authManager: {
                initialize: async () => {},
                isAuthenticated: () => true,
            },
            prefsApi: {
                setNewsEnabled: async enabled => {
                    calls.push(enabled);
                    return { newsEnabled: enabled, emailEnabled: true, email: 'dev@example.com' };
                },
            },
            storage: createMemoryStorage(),
            root,
        });

        expect(res.status).toBe('subscribed');
        expect(calls).toEqual([true]);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.classList.contains('is-subscribed')).toBe(true);
        expect(labelEl.textContent).toBe('Subscribed to daily brief');
        expect(statusEl.classList.contains('hidden')).toBe(false);
        expect(statusEl.textContent).toContain('dev@example.com');
    });

    test('syncNewsSubscribe auto-enables news digest when returning from sign-in with pending flag', async () => {
        const { root, button, labelEl } = createFakeDom();
        const storage = createMemoryStorage();
        storage.setItem(NEWS_SUBSCRIBE_PENDING_KEY, '1');
        const setCalls = [];

        const res = await syncNewsSubscribe({ id: 'github:ada' }, {
            prefsApi: {
                getPrefs: async () => ({ newsEnabled: false, email: 'ada@example.com' }),
                setNewsEnabled: async enabled => {
                    setCalls.push(enabled);
                    return { newsEnabled: enabled, email: 'ada@example.com' };
                },
            },
            storage,
            root,
        });

        expect(res.status).toBe('subscribed');
        expect(setCalls).toEqual([true]);
        expect(storage.getItem(NEWS_SUBSCRIBE_PENDING_KEY)).toBeNull();
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(labelEl.textContent).toBe('Subscribed to daily brief');
    });

    test('handleNewsSubscribeClick returns busy when button is already disabled', async () => {
        const { root, button } = createFakeDom();
        button.disabled = true;
        const res = await handleNewsSubscribeClick(button, { root });
        expect(res.status).toBe('busy');
    });

    test('syncNewsSubscribe restores pending intent if auto-subscribe fails', async () => {
        const { root } = createFakeDom();
        const storage = createMemoryStorage();
        storage.setItem(NEWS_SUBSCRIBE_PENDING_KEY, '1');

        const res = await syncNewsSubscribe({ id: 'github:ada' }, {
            prefsApi: {
                setNewsEnabled: async () => {
                    throw new Error('API failure');
                },
            },
            storage,
            root,
        });

        expect(res.status).toBe('error');
        expect(storage.getItem(NEWS_SUBSCRIBE_PENDING_KEY)).toBe('1');
    });

    test('syncNewsSubscribe aborts and returns stale if isCurrent returns false', async () => {
        const { root, button } = createFakeDom();
        const res = await syncNewsSubscribe({ id: 'github:ada' }, {
            prefsApi: {
                getPrefs: async () => ({ newsEnabled: true, email: 'ada@example.com' }),
            },
            root,
            isCurrent: () => false,
        });

        expect(res.status).toBe('stale');
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    test('renderNewsSubscribeButtons resets state when signed out', () => {
        const { root, button, labelEl, statusEl } = createFakeDom({ pressed: 'true' });
        renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: true });
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(labelEl.textContent).toBe('Get daily brief by email');
        expect(statusEl.classList.contains('hidden')).toBe(true);
    });
});

