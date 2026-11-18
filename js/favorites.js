import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { createFavoritesStore } from './favorites-store.js';
import { createGuestFavoritesStore, GUEST_FAVORITES_KEY } from './guest-favorites-store.js';

const store = createFavoritesStore();
export const guestFavorites = createGuestFavoritesStore();
const guestListeners = new Set();
let initialized = false;
let activeUserId = null;
let syncGeneration = 0;
let context = {
    isAuthenticated: () => false,
    onUnauthorized: () => {},
    onToggle: () => {},
};

function buttonLabel(button, active) {
    const toolName = button.dataset.toolName || 'tool';
    return active ? `Remove ${toolName} from favorites` : `Save ${toolName} to favorites`;
}

export function refreshFavoriteButtons(root = document) {
    const authenticated = context.isAuthenticated();
    const guestSaved = authenticated ? null : new Set(guestFavorites.slugs());
    root.querySelectorAll('.favorite-btn[data-tool-slug]').forEach(button => {
        const active = (guestSaved ?? store).has(button.dataset.toolSlug);
        const label = buttonLabel(button, active);
        button.classList.toggle('favorited', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', label);
        button.title = label;
        const icon = button.querySelector('.favorite-icon');
        if (icon) icon.setAttribute('fill', active ? 'currentColor' : 'none');
        const text = button.querySelector('[data-favorite-label]');
        if (text) text.textContent = active ? 'Saved' : 'Favorite';
    });
}

function guestFavoritesChanged() {
    refreshFavoriteButtons();
    guestListeners.forEach(listener => listener());
}

export function subscribeGuestFavorites(listener) {
    guestListeners.add(listener);
    return () => guestListeners.delete(listener);
}

export function initFavorites(options = {}) {
    context = { ...context, ...options };
    if (initialized) {
        refreshFavoriteButtons();
        return;
    }

    initialized = true;
    store.subscribe(() => refreshFavoriteButtons());
    document.defaultView?.addEventListener('storage', event => {
        if (event.key === GUEST_FAVORITES_KEY || event.key === null) guestFavoritesChanged();
    });
    document.defaultView?.addEventListener('pageshow', event => {
        if (event.persisted) guestFavoritesChanged();
    });
    document.addEventListener('click', async event => {
        const button = event.target.closest?.('.favorite-btn[data-tool-slug]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        if (!context.isAuthenticated()) {
            const feedback = document.getElementById?.('guestFavoritesFeedback');
            try {
                const added = guestFavorites.toggle(button.dataset.toolSlug);
                if (feedback) feedback.textContent = '';
                guestFavoritesChanged();
                if (added) analytics.track(EVENTS.GUEST_FAVORITE_ADDED);
            } catch (error) {
                if (feedback) {
                    feedback.textContent = error instanceof RangeError
                        ? error.message
                        : 'Could not update favorites in this browser. Check your browser storage or sign in to save to your account.';
                }
            }
            return;
        }

        button.disabled = true;
        try {
            const added = await store.toggle(button.dataset.toolSlug);
            context.onToggle(added, button.dataset.toolSlug);
        } catch (error) {
            if (error?.status === 401) await context.onUnauthorized();
            button.dataset.tip = 'Could not update favorite. Try again.';
            setTimeout(() => delete button.dataset.tip, 2500);
        } finally {
            button.disabled = false;
        }
    });
    refreshFavoriteButtons();
}

export async function loadFavorites() {
    const result = await store.load();
    refreshFavoriteButtons();
    return result;
}

export async function importGuestFavorites(slugs, expectedUserId) {
    if (activeUserId !== expectedUserId || !context.isAuthenticated()) {
        return { authenticated: false, favorites: [], stale: true };
    }
    return store.load({ slugs, expectedUserId });
}

export async function syncFavorites(user) {
    const userId = user?.id ?? null;
    const sync = ++syncGeneration;
    if (activeUserId !== userId) {
        activeUserId = userId;
        store.clear();
    }
    if (!userId) {
        refreshFavoriteButtons();
        return { authenticated: false, favorites: [], stale: false };
    }

    const result = await store.load();
    if (sync !== syncGeneration || activeUserId !== userId || result.stale) {
        return { ...result, favorites: store.records(), stale: true };
    }
    refreshFavoriteButtons();
    return result;
}

export function clearFavorites() {
    activeUserId = null;
    syncGeneration += 1;
    store.clear();
    refreshFavoriteButtons();
}

export function getFavoriteRecords() {
    return store.records();
}

export function subscribeFavorites(listener) {
    return store.subscribe(listener);
}
