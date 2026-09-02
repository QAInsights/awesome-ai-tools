import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { authAttribution } from './auth-attribution.js';
import { createFollowsStore } from './follows-store.js';

const store = createFollowsStore();
let initialized = false;
let activeUserId = null;
let syncGeneration = 0;
let context = {
    isAuthenticated: () => false,
    onUnauthorized: () => {},
    onToggle: () => {},
};

function buttonLabel(button, active, authenticated) {
    const toolName = button.dataset.toolName || 'tool';
    if (!authenticated) return `Sign in to follow ${toolName}`;
    return active ? `Unfollow ${toolName}` : `Follow ${toolName}`;
}

function buttonTitle(button) {
    return `Get email updates about ${button.dataset.toolName || 'tool'}`;
}

export function refreshFollowButtons(root = document) {
    const authenticated = context.isAuthenticated();
    root.querySelectorAll('.follow-btn[data-tool-slug]').forEach(button => {
        const active = authenticated && store.has(button.dataset.toolSlug);
        button.classList.toggle('followed', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', buttonLabel(button, active, authenticated));
        button.title = buttonTitle(button);
        const icon = button.querySelector('.follow-icon');
        if (icon) icon.setAttribute('fill', active ? 'currentColor' : 'none');
        const text = button.querySelector('[data-follow-label]');
        if (text) text.textContent = active ? 'Following' : 'Follow';
    });
}

export function initFollows(options = {}) {
    context = { ...context, ...options };
    if (initialized) {
        refreshFollowButtons();
        return;
    }

    initialized = true;
    store.subscribe(() => refreshFollowButtons());
    document.addEventListener('click', async event => {
        const button = event.target.closest?.('.follow-btn[data-tool-slug]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        if (!context.isAuthenticated()) {
            const subject = button.dataset.toolSlug;
            analytics.track(EVENTS.GATE_BLOCKED, { trigger: 'follow_bell', subject });
            authAttribution.open('follow_bell');
            return;
        }

        button.disabled = true;
        try {
            const added = await store.toggle(button.dataset.toolSlug);
            context.onToggle(added, button.dataset.toolSlug);
        } catch (error) {
            if (error?.status === 401) await context.onUnauthorized();
            button.dataset.tip = 'Could not update follow. Try again.';
            setTimeout(() => delete button.dataset.tip, 2500);
        } finally {
            button.disabled = false;
        }
    });
    refreshFollowButtons();
}

export async function loadFollows() {
    const result = await store.load();
    refreshFollowButtons();
    return result;
}

export async function syncFollows(user) {
    const userId = user?.id ?? null;
    const sync = ++syncGeneration;
    if (activeUserId !== userId) {
        activeUserId = userId;
        store.clear();
    }
    if (!userId) {
        refreshFollowButtons();
        return { authenticated: false, follows: [], stale: false };
    }

    const result = await store.load();
    if (sync !== syncGeneration || activeUserId !== userId || result.stale) {
        return { ...result, follows: store.records(), stale: true };
    }
    refreshFollowButtons();
    return result;
}

export function clearFollows() {
    activeUserId = null;
    syncGeneration += 1;
    store.clear();
    refreshFollowButtons();
}

export function getFollowRecords() {
    return store.records();
}

export function subscribeFollows(listener) {
    return store.subscribe(listener);
}
