/** "Email me this" for tool pages: sends the current result to the signed-in member's inbox. */
import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

export const TOOL_EMAIL_PENDING_KEY = 'aat_tool_email_pending';
const PENDING_TTL_MS = 15 * 60 * 1000;
const RESET_MS = 4000;

export const TOOL_EMAIL_LABELS = Object.freeze({
    idle: 'Email me this',
    sending: 'Sending…',
    sent: 'Sent to your inbox',
    signin: 'Sign in to email this',
    unverified: 'No verified email on account',
    limited: 'Try again in a minute',
    daily: 'Daily limit reached',
    failed: 'Could not send, try again',
    empty: 'Nothing to email yet',
});

const defaultApi = {
    async send(payload) {
        const response = await fetch('/api/tools/email-result', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let data = {};
        try {
            data = await response.json();
        } catch {}
        return { status: response.status, data };
    },
};

const DAILY_LIMIT_DETAIL = 'You can email up to 20 results a day. Try again tomorrow.';

export function statusForResponse(status, data = {}) {
    if (status >= 200 && status < 300) return 'sent';
    if (status === 401) return 'signin';
    if (status === 409) return 'unverified';
    if (status === 429) return data?.error === 'daily_limit' ? 'daily' : 'limited';
    return 'failed';
}

function readPending(storage, kind, now) {
    try {
        const raw = storage?.getItem(TOOL_EMAIL_PENDING_KEY);
        if (!raw) return null;
        const pending = JSON.parse(raw);
        if (!pending || typeof pending.savedAt !== 'number' || now - pending.savedAt > PENDING_TTL_MS) {
            storage.removeItem(TOOL_EMAIL_PENDING_KEY);
            return null;
        }
        return pending.kind === kind ? pending : null;
    } catch {
        return null;
    }
}

function writePending(storage, payload, now) {
    try {
        storage?.setItem(TOOL_EMAIL_PENDING_KEY, JSON.stringify({ ...payload, savedAt: now }));
    } catch {}
}

function clearPending(storage) {
    try {
        storage?.removeItem(TOOL_EMAIL_PENDING_KEY);
    } catch {}
}

function resolveSessionStorage() {
    try {
        return globalThis.sessionStorage ?? null;
    } catch {
        return null;
    }
}

export function initToolEmail({
    button,
    statusEl = null,
    kind,
    getPayload,
    authManager = auth,
    attribution = authAttribution,
    analyticsClient = analytics,
    api = defaultApi,
    storage = resolveSessionStorage(),
    now = () => Date.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = id => clearTimeout(id),
}) {
    if (!button) return null;
    let busy = false;
    let resetTimer = null;

    function show(state, detail = '') {
        button.textContent = TOOL_EMAIL_LABELS[state];
        if (statusEl) statusEl.textContent = state === 'idle' ? '' : detail || TOOL_EMAIL_LABELS[state];
        if (resetTimer !== null) cancel(resetTimer);
        resetTimer = state === 'idle' || state === 'sending' ? null : schedule(() => show('idle'), RESET_MS);
    }

    function promptSignIn(payload) {
        writePending(storage, payload, now());
        analyticsClient.track(EVENTS.GATE_BLOCKED, { trigger: 'tool_email', subject: kind });
        show('signin', 'Sign in to email this result. It is sent as soon as you are back.');
        attribution.open('tool_email');
        return 'unauthenticated';
    }

    async function send(payload) {
        busy = true;
        button.disabled = true;
        show('sending');
        try {
            const { status, data } = await api.send(payload);
            const state = statusForResponse(status, data);
            if (state === 'signin') return promptSignIn(payload);
            const detail = state === 'sent' && data?.email ? `Sent to ${data.email}` : state === 'daily' ? DAILY_LIMIT_DETAIL : '';
            show(state, detail);
            return state;
        } catch {
            show('failed');
            return 'failed';
        } finally {
            busy = false;
            button.disabled = false;
        }
    }

    async function handleClick() {
        if (busy) return 'busy';
        const payload = getPayload();
        if (!payload?.content?.trim()) {
            show('empty');
            return 'empty';
        }
        const request = { kind, search: payload.search || '', content: payload.content };
        await authManager.initialize();
        if (!authManager.isAuthenticated()) return promptSignIn(request);
        return send(request);
    }

    async function resumePending() {
        if (busy) return 'busy';
        await authManager.initialize();
        if (!authManager.isAuthenticated()) return 'none';
        const pending = readPending(storage, kind, now());
        if (!pending) return 'none';
        clearPending(storage);
        return send({ kind, search: pending.search || '', content: pending.content });
    }

    button.addEventListener('click', event => {
        event?.preventDefault?.();
        void handleClick();
    });
    authManager.onAuthChange?.(({ event } = {}) => {
        if (event === 'signin' || event === 'session_restored') void resumePending();
    });
    void resumePending();
    return { handleClick, resumePending };
}
