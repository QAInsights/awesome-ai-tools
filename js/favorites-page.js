import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';
import {
    getFavoriteRecords,
    initFavorites,
    loadFavorites,
    refreshFavoriteButtons,
    subscribeFavorites,
    syncFavorites,
} from './favorites.js';
import {
    initFollows,
    loadFollows,
    refreshFollowButtons,
    subscribeFollows,
    syncFollows,
} from './follows.js';

const defaultFavoritesApi = {
    getFavoriteRecords,
    initFavorites,
    refreshFavoriteButtons,
    subscribeFavorites,
    syncFavorites,
};

const defaultFollowsApi = {
    initFollows,
    loadFollows,
    refreshFollowButtons,
    subscribeFollows,
    syncFollows,
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readTools(root = document) {
    try {
        const data = JSON.parse(root.getElementById('favorites-tools-data')?.textContent || '[]');
        return new Map(data.map(tool => [tool.slug, tool]));
    } catch {
        return new Map();
    }
}

export async function initializeFavoritesPage({
    authManager = auth,
    favoritesApi = defaultFavoritesApi,
    followsApi = defaultFollowsApi,
    root = document,
} = {}) {
    const {
        getFavoriteRecords: getRecords,
        initFavorites: initializeFavorites,
        loadFavorites: load,
        refreshFavoriteButtons: refreshButtons,
        subscribeFavorites: subscribe,
        syncFavorites: sync,
    } = favoritesApi;
    const {
        initFollows: initializeFollows,
        loadFollows,
        refreshFollowButtons,
        subscribeFollows,
        syncFollows,
    } = followsApi;
    const tools = readTools(root);
    const loading = root.getElementById('favoritesLoading');
    const signedOut = root.getElementById('favoritesSignedOut');
    const errorState = root.getElementById('favoritesError');
    const empty = root.getElementById('favoritesEmpty');
    const grid = root.getElementById('favoritesGrid');
    const count = root.getElementById('favoriteCount');

    function hideStates() {
        [loading, signedOut, errorState, empty, grid].forEach(element => element?.classList.add('hidden'));
    }

    function render() {
        const favorites = getRecords();
        hideStates();
        if (!authManager.isAuthenticated()) {
            signedOut?.classList.remove('hidden');
            count?.classList.add('hidden');
            return;
        }
        if (!favorites.length) {
            empty?.classList.remove('hidden');
            count?.classList.add('hidden');
            return;
        }

        const cards = favorites.map(favorite => {
            const tool = tools.get(favorite.slug);
            if (!tool) return '';
            const name = escapeHtml(tool.name);
            const slug = escapeHtml(tool.slug);
            return `
                <article class="group border border-[#222] bg-white/[0.02] rounded-xl p-5 transition-all hover:border-[#3a3a3a] hover:bg-white/[0.035]">
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <a href="/tools/${slug}" class="text-lg font-semibold text-white hover:text-[#e2c48a] transition-colors">${name}</a>
                            <div class="font-mono text-[11px] uppercase tracking-wide text-[#737373] mt-1">${escapeHtml(tool.company)} · ${escapeHtml(tool.category)}</div>
                        </div>
                        <button class="favorite-btn detail favorited" type="button" data-tool-slug="${slug}" data-tool-name="${name}" aria-label="Remove ${name} from favorites" aria-pressed="true" title="Remove ${name} from favorites">
                            <svg class="favorite-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z"/></svg>
                            <span data-favorite-label>Saved</span>
                        </button>
                        <button class="follow-btn detail" type="button" data-tool-slug="${slug}" data-tool-name="${name}" aria-label="Sign in to follow ${name}" aria-pressed="false" title="Get email updates about ${name}">
                            <svg class="follow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>
                            <span data-follow-label>Follow</span>
                        </button>
                    </div>
                    <p class="text-[14px] text-[#a3a3a3] leading-relaxed mt-4">${escapeHtml(tool.description)}</p>
                </article>`;
        }).filter(Boolean);

        if (!cards.length) {
            empty?.classList.remove('hidden');
            count?.classList.add('hidden');
            return;
        }

        grid.innerHTML = cards.join('');
        grid.classList.remove('hidden');
        count.textContent = `${cards.length} saved`;
        count.classList.remove('hidden');
        refreshButtons(grid);
        refreshFollowButtons(grid);
    }

    initializeFavorites({
        isAuthenticated: () => authManager.isAuthenticated(),
        onUnauthorized: () => authManager.signOut(),
        onToggle: added => {
            if (!added) void loadFollows();
        },
    });
    initializeFollows({
        isAuthenticated: () => authManager.isAuthenticated(),
        onUnauthorized: () => authManager.signOut(),
        onToggle: added => {
            if (added) void load();
        },
    });

    function showError() {
        hideStates();
        errorState?.classList.remove('hidden');
        count?.classList.add('hidden');
    }

    async function syncForUser(user) {
        const [result, followsResult] = await Promise.all([sync(user), syncFollows(user)]);
        if (
            user
            && !result.stale
            && !result.authenticated
            && authManager.getCurrentUser()?.id === user.id
        ) {
            await authManager.signOut();
            return;
        }
        if (
            user
            && !followsResult.stale
            && !followsResult.authenticated
            && authManager.getCurrentUser()?.id === user.id
        ) {
            await authManager.signOut();
            return;
        }
        render();
    }

    try {
        const session = await bindAuthSession({ authManager, root });
        subscribe(render);
        subscribeFollows(() => refreshFollowButtons(grid));
        session.subscribe(({ user }) => {
            void syncForUser(user).catch(showError);
        }, { emitCurrent: false });
        await syncForUser(authManager.getCurrentUser());
    } catch {
        showError();
    }
}

document.addEventListener('DOMContentLoaded', () => initializeFavoritesPage());
