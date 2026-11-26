import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';
import {
    getFavoriteRecords,
    guestFavorites,
    importGuestFavorites,
    initFavorites,
    loadFavorites,
    refreshFavoriteButtons,
    subscribeFavorites,
    subscribeGuestFavorites,
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
    importGuestFavorites,
    initFavorites,
    loadFavorites,
    refreshFavoriteButtons,
    subscribeFavorites,
    subscribeGuestFavorites,
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
    guestStore = guestFavorites,
    root = document,
} = {}) {
    const {
        getFavoriteRecords: getRecords,
        importGuestFavorites: importFavorites,
        initFavorites: initializeFavorites,
        loadFavorites: load,
        refreshFavoriteButtons: refreshButtons,
        subscribeFavorites: subscribe,
        subscribeGuestFavorites: subscribeGuest = () => {},
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
    const importPrompt = root.getElementById('guestFavoritesImport');
    const importList = root.getElementById('guestFavoritesImportList');
    const confirmImport = root.getElementById('guestFavoritesImportConfirm');
    const dismissImport = root.getElementById('guestFavoritesImportDismiss');
    const importStatus = root.getElementById('guestFavoritesImportStatus');
    let userId = null;
    let accountRevision = 0;
    let importReady = false;
    let importDismissed = false;
    let importing = false;

    function hideStates() {
        [loading, signedOut, errorState, empty, grid].forEach(element => element?.classList.add('hidden'));
    }

    function guestSlugs() {
        return guestStore.slugs().filter(slug => tools.has(slug));
    }

    function updateImportPrompt() {
        if (!importPrompt) return;
        const slugs = importReady && !importDismissed ? guestSlugs() : [];
        const canImport = importing || slugs.length > 0;
        importPrompt.classList.toggle('hidden', !canImport);
        importList.innerHTML = slugs.map(slug => `<li>${escapeHtml(tools.get(slug).name)}</li>`).join('');
        confirmImport.disabled = importing;
        dismissImport.disabled = importing;
    }

    function setImportStatus(message) {
        if (importStatus) importStatus.textContent = message;
    }

    confirmImport?.addEventListener('click', async () => {
        const expectedUserId = authManager.getCurrentUser()?.id;
        if (!expectedUserId || expectedUserId !== userId || !importReady || importDismissed || importing) return;
        const slugs = guestSlugs();
        if (!slugs.length) return;
        const revision = accountRevision;
        const isCurrent = () => revision === accountRevision && authManager.getCurrentUser()?.id === expectedUserId;
        importing = true;
        updateImportPrompt();
        setImportStatus('Syncing favorites…');

        try {
            const result = await importFavorites(slugs, expectedUserId);
            if (!isCurrent()) return;
            if (!result.authenticated || result.stale) throw new Error('Unable to import favorites');
            try {
                guestStore.removeImported(slugs);
                setImportStatus('Browser favorites synced to your account.');
            } catch {
                importDismissed = true;
                setImportStatus('Favorites synced, but the local list could not be cleared.');
            }
        } catch {
            if (isCurrent()) setImportStatus('Could not finish syncing. Your browser favorites were kept. Try again.');
        } finally {
            if (isCurrent()) {
                importing = false;
                updateImportPrompt();
            }
        }
    });

    dismissImport?.addEventListener('click', () => {
        if (importing) return;
        importDismissed = true;
        setImportStatus('Browser favorites kept here. You can sync them next time you open Favorites.');
        updateImportPrompt();
    });

    function render() {
        const authenticated = authManager.isAuthenticated();
        const slugs = authenticated ? getRecords().map(({ slug }) => slug) : guestSlugs();
        hideStates();
        if (!authenticated && slugs.length) signedOut?.classList.remove('hidden');

        const cards = slugs.map(savedSlug => {
            const tool = tools.get(savedSlug);
            if (!tool) return '';
            const name = escapeHtml(tool.name);
            const slug = escapeHtml(tool.slug);
            return `
                <article class="group @container border border-[#222] bg-white/[0.02] rounded-xl p-5 transition-all hover:border-[#3a3a3a] hover:bg-white/[0.035]">
                    <div class="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between @lg:gap-4">
                        <div class="min-w-0 @lg:flex-1">
                            <a href="/tools/${slug}" class="text-lg font-semibold text-white hover:text-[#e2c48a] transition-colors">${name}</a>
                            <div class="font-mono text-[11px] uppercase tracking-wide text-[#737373] mt-1 break-words">${escapeHtml(tool.company)} · ${escapeHtml(tool.category)}</div>
                        </div>
                        <div class="${authenticated ? 'grid grid-cols-2 gap-2 @lg:flex @lg:shrink-0' : 'flex shrink-0'}">
                            <button class="favorite-btn detail favorited" type="button" data-tool-slug="${slug}" data-tool-name="${name}" aria-label="Remove ${name} from favorites" aria-pressed="true" title="Remove ${name} from favorites">
                                <svg class="favorite-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z"/></svg>
                                <span data-favorite-label>Saved</span>
                            </button>
                            ${authenticated ? `<button class="follow-btn detail" type="button" data-tool-slug="${slug}" data-tool-name="${name}" aria-label="Sign in to follow ${name}" aria-pressed="false" title="Get email updates about ${name}">
                                <svg class="follow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>
                                <span data-follow-label>Follow</span>
                            </button>` : ''}
                        </div>
                    </div>
                    <p class="text-[14px] text-[#a3a3a3] leading-relaxed mt-4">${escapeHtml(tool.description)}</p>
                </article>`;
        }).filter(Boolean);

        if (!cards.length) {
            grid.innerHTML = '';
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
            if (!added && authManager.isAuthenticated()) void loadFollows();
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
        const nextUserId = user?.id ?? null;
        if (userId !== nextUserId) {
            userId = nextUserId;
            accountRevision += 1;
            importReady = false;
            importDismissed = false;
            importing = false;
            setImportStatus('');
            updateImportPrompt();
        }
        const revision = accountRevision;
        try {
            const results = await Promise.all([sync(user), syncFollows(user)]);
            if (revision !== accountRevision) return;
            if (user && results.some(result => !result.stale && !result.authenticated)) {
                await authManager.signOut();
                return;
            }
            importReady = Boolean(user);
            updateImportPrompt();
            render();
        } catch {
            if (revision === accountRevision) showError();
        }
    }

    try {
        const session = await bindAuthSession({ authManager, root });
        subscribe(render);
        subscribeGuest(() => {
            if (!authManager.isAuthenticated()) render();
            updateImportPrompt();
        });
        subscribeFollows(() => refreshFollowButtons(grid));
        session.subscribe(({ user }) => {
            void syncForUser(user);
        }, { emitCurrent: false });
        await syncForUser(authManager.getCurrentUser());
    } catch {
        showError();
    }
}

document.addEventListener('DOMContentLoaded', () => initializeFavoritesPage());
