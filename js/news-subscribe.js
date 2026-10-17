import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

export const NEWS_SUBSCRIBE_PENDING_KEY = 'aat_news_subscribe_pending';

const UNVERIFIED_EMAIL_STATUS =
    'Preference saved — your account does not have a verified email address, so emails will not send until verified in Settings';

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

let rollbackTimerId = null;

function clearRollbackTimer() {
    if (rollbackTimerId !== null) {
        clearTimeout(rollbackTimerId);
        rollbackTimerId = null;
    }
}

function setButtonLabel(button, text) {
    const labelEl = button.querySelector?.('[data-subscribe-label]');
    if (labelEl) labelEl.textContent = text;
    else button.textContent = text;
}

export function renderNewsSubscribeButtons(root = document, {
    authenticated = false,
    newsEnabled = false,
    email = null,
    emailVerified = false,
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
            statusEl.textContent = email && emailVerified
                ? `Delivering to ${email} · manage anytime in Settings`
                : UNVERIFIED_EMAIL_STATUS;
            statusEl.classList.remove('hidden');
        } else {
            statusEl.textContent = '';
            statusEl.classList.add('hidden');
        }
    });
}

function readPending(storage) {
    try {
        const raw = storage?.getItem(NEWS_SUBSCRIBE_PENDING_KEY);
        if (!raw) return null;
        if (raw === '1') return { enabled: true, userId: null };
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.enabled === 'boolean') {
            return {
                enabled: parsed.enabled,
                userId: typeof parsed.userId === 'string' && parsed.userId ? parsed.userId : null,
            };
        }
        return null;
    } catch {
        return null;
    }
}

function writePending(storage, pending) {
    try {
        if (!pending) {
            storage?.removeItem(NEWS_SUBSCRIBE_PENDING_KEY);
        } else if (pending === true) {
            storage?.setItem(NEWS_SUBSCRIBE_PENDING_KEY, '1');
        } else if (typeof pending === 'object' && typeof pending.enabled === 'boolean') {
            storage?.setItem(
                NEWS_SUBSCRIBE_PENDING_KEY,
                JSON.stringify({
                    enabled: pending.enabled,
                    userId: typeof pending.userId === 'string' ? pending.userId : null,
                })
            );
        }
    } catch {}
}

export function clearPendingNewsSubscribe(storage = globalThis.sessionStorage) {
    writePending(storage, false);
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
    clearRollbackTimer();

    try {
        await authManager.initialize();
        const nextValue = button.getAttribute('aria-pressed') !== 'true';

        if (!authManager.isAuthenticated()) {
            const subject = button.dataset?.subscribeSubject || 'today-in-ai';
            writePending(storage, nextValue ? true : false);
            analyticsClient.track(EVENTS.GATE_BLOCKED, { trigger: 'news_cta', subject });
            attribution.open('news_cta');
            return { status: 'unauthenticated' };
        }

        setButtonLabel(button, nextValue ? 'Subscribing…' : 'Updating…');

        try {
            const prefs = await prefsApi.setNewsEnabled(nextValue);
            clearRollbackTimer();
            writePending(storage, false);
            renderNewsSubscribeButtons(root, {
                authenticated: true,
                newsEnabled: prefs.newsEnabled,
                email: prefs.email,
                emailVerified: Boolean(prefs.emailVerified),
            });
            return { status: prefs.newsEnabled ? 'subscribed' : 'unsubscribed', prefs };
        } catch (error) {
            if (error?.status === 401) {
                const previousUserId = authManager.getCurrentUser?.()?.id || null;
                await authManager.signOut();
                if (previousUserId) {
                    writePending(storage, { enabled: nextValue, userId: previousUserId });
                } else {
                    writePending(storage, nextValue ? true : false);
                }
                renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: false });
                attribution.open('news_cta');
                return { status: 'unauthenticated' };
            }
            setButtonLabel(button, 'Could not save — try again');
            clearRollbackTimer();
            rollbackTimerId = setTimeout(async () => {
                rollbackTimerId = null;
                const authenticated = authManager.isAuthenticated();
                if (!authenticated) {
                    renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: false });
                    return;
                }
                try {
                    if (typeof prefsApi.getPrefs === 'function') {
                        const currentPrefs = await prefsApi.getPrefs();
                        renderNewsSubscribeButtons(root, {
                            authenticated: true,
                            newsEnabled: currentPrefs.newsEnabled,
                            email: currentPrefs.email,
                            emailVerified: Boolean(currentPrefs.emailVerified),
                        });
                        return;
                    }
                } catch {}
                renderNewsSubscribeButtons(root, {
                    authenticated: true,
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
    clearRollbackTimer();
    const buttons = root.querySelectorAll?.('[data-news-subscribe]') ?? [];

    if (!user) {
        if (buttons.length) {
            renderNewsSubscribeButtons(root, { authenticated: false, newsEnabled: false });
        }
        return { status: 'signed_out' };
    }

    const pending = readPending(storage);
    const isDifferentUser = Boolean(pending?.userId && pending.userId !== user.id);
    if (isDifferentUser) {
        writePending(storage, false);
    }
    const activePending = pending && !isDifferentUser ? pending : null;

    if (!buttons.length && !activePending) {
        return { status: 'idle' };
    }

    try {
        const prefs = activePending
            ? await prefsApi.setNewsEnabled(activePending.enabled)
            : await prefsApi.getPrefs();
        if (activePending && prefs.newsEnabled === activePending.enabled) {
            writePending(storage, false);
        }
        if (!isCurrent()) return { status: 'stale' };
        if (buttons.length) {
            renderNewsSubscribeButtons(root, {
                authenticated: true,
                newsEnabled: prefs.newsEnabled,
                email: prefs.email,
                emailVerified: Boolean(prefs.emailVerified),
            });
        }
        return { status: prefs.newsEnabled ? 'subscribed' : 'unsubscribed', prefs };
    } catch {
        if (activePending && isCurrent()) {
            buttons.forEach(button => setButtonLabel(button, 'Could not save — try again'));
        }
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
