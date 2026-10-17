import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

export const NEWS_SUBSCRIBE_PENDING_KEY = 'aat_news_subscribe_pending';

const defaultPrefsApi = {
    async getPrefs() {
        const response = await fetch('/api/notifications/prefs');
        if (!response.ok) {
            const error = new Error('Unable to load notification preferences');
            error.status = response.status;
            throw error;
        }
        return response.json();
    },
    async setNewsEnabled(newsEnabled) {
        const response = await fetch('/api/notifications/prefs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newsEnabled }),
        });
        if (!response.ok) {
            const error = new Error('Unable to save notification preferences');
            error.status = response.status;
            throw error;
        }
        return response.json();
    },
};

function setButtonLabel(button, text) {
    const labelEl = button.querySelector?.('[data-subscribe-label]');
    if (labelEl) labelEl.textContent = text;
    else button.textContent = text;
}

export function renderNewsSubscribeButtons(root = document, {
    authenticated = false,
    newsEnabled = false,
    email = null,
} = {}) {
    const active = Boolean(authenticated && newsEnabled);
    root.querySelectorAll?.('[data-news-subscribe]').forEach(button => {
        button.classList.toggle('is-subscribed', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const defaultLabel = button.dataset?.subscribeDefault || 'Get daily brief by email';
        const activeLabel = button.dataset?.subscribeActive || 'Subscribed to daily brief';
        setButtonLabel(button, active ? activeLabel : defaultLabel);
    });

    root.querySelectorAll?.('[data-news-subscribe-status]').forEach(statusEl => {
        if (active) {
            statusEl.textContent = email
                ? `Delivering to ${email} · manage anytime in Settings`
                : 'Subscribed · manage anytime in Settings';
            statusEl.classList.remove('hidden');
        } else {
            statusEl.textContent = '';
            statusEl.classList.add('hidden');
        }
    });
}

function readPending(storage) {
    try {
        return storage?.getItem(NEWS_SUBSCRIBE_PENDING_KEY) === '1';
    } catch {
        return false;
    }
}

function writePending(storage, enabled) {
    try {
        if (enabled) storage?.setItem(NEWS_SUBSCRIBE_PENDING_KEY, '1');
        else storage?.removeItem(NEWS_SUBSCRIBE_PENDING_KEY);
    } catch {}
}

export async function handleNewsSubscribeClick(button, {
    authManager = auth,
    attribution = authAttribution,
    analyticsClient = analytics,
    prefsApi = defaultPrefsApi,
    storage = globalThis.sessionStorage,
    root = document,
} = {}) {
    if (button.disabled) return { status: 'busy' };
    button.disabled = true;

    try {
        await authManager.initialize();
        if (!authManager.isAuthenticated()) {
            const subject = button.dataset?.subscribeSubject || 'today-in-ai';
            writePending(storage, true);
            analyticsClient.track(EVENTS.GATE_BLOCKED, { trigger: 'news_cta', subject });
            attribution.open('news_cta');
            return { status: 'unauthenticated' };
        }

        const nextValue = button.getAttribute('aria-pressed') !== 'true';
        setButtonLabel(button, nextValue ? 'Subscribing…' : 'Updating…');

        try {
            const prefs = await prefsApi.setNewsEnabled(nextValue);
            renderNewsSubscribeButtons(root, {
                authenticated: true,
                newsEnabled: prefs.newsEnabled,
                email: prefs.email,
            });
            return { status: prefs.newsEnabled ? 'subscribed' : 'unsubscribed', prefs };
        } catch (error) {
            if (error?.status === 401) {
                await authManager.signOut();
                writePending(storage, true);
                renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: false });
                attribution.open('news_cta');
                return { status: 'unauthenticated' };
            }
            setButtonLabel(button, 'Could not save — try again');
            setTimeout(() => {
                renderNewsSubscribeButtons(root, {
                    authenticated: authManager.isAuthenticated(),
                    newsEnabled: !nextValue,
                });
            }, 2200);
            return { status: 'error', message: error?.message || 'Unable to save' };
        }
    } finally {
        button.disabled = false;
    }
}

export async function syncNewsSubscribe(user, {
    prefsApi = defaultPrefsApi,
    storage = globalThis.sessionStorage,
    root = document,
    isCurrent = () => true,
} = {}) {
    const buttons = root.querySelectorAll?.('[data-news-subscribe]') ?? [];
    if (!buttons.length) return { status: 'idle' };

    if (!user) {
        renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: false });
        return { status: 'signed_out' };
    }

    const shouldAutoSubscribe = readPending(storage);
    if (shouldAutoSubscribe) writePending(storage, false);

    try {
        const prefs = shouldAutoSubscribe
            ? await prefsApi.setNewsEnabled(true)
            : await prefsApi.getPrefs();
        if (!isCurrent()) return { status: 'stale' };
        renderNewsSubscribeButtons(root, {
            authenticated: true,
            newsEnabled: prefs.newsEnabled,
            email: prefs.email,
        });
        return { status: prefs.newsEnabled ? 'subscribed' : 'unsubscribed', prefs };
    } catch {
        if (shouldAutoSubscribe) writePending(storage, true);
        return { status: 'error' };
    }
}

const initializedRoots = new WeakSet();

export function initializeNewsSubscribe({
    authManager = auth,
    attribution = authAttribution,
    analyticsClient = analytics,
    prefsApi = defaultPrefsApi,
    storage = globalThis.sessionStorage,
    root = document,
} = {}) {
    if (initializedRoots.has(root)) return;
    initializedRoots.add(root);

    root.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-news-subscribe]');
        if (!button) return;
        event.preventDefault();
        void handleNewsSubscribeClick(button, {
            authManager,
            attribution,
            analyticsClient,
            prefsApi,
            storage,
            root,
        });
    });
}
