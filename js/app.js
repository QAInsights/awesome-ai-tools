/**
 * Main application entry point
 * AI IDEs & Coding Assistants - Tool Registry
 */

import { initRenderer, renderTools, hydrateGrid, setFavoriteContext, setVotingContext, refreshVotingButtons } from './renderer.js';
import { authAttribution } from './auth-attribution.js';
import { CollapsedSidebar } from './collapsed-sidebar.js';
import { initGradientSelection } from './gradient-selection.js';
import { initFilterManager } from './modules/filter-manager.js';
import { initGlobalSearch } from './modules/global-search.js';
import { initUiManager } from './modules/ui-manager.js';
import { initSortManager } from './modules/sort-manager.js';
import { sortTools } from './sorting.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGlobalSearch();
    initGradientSelection();
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    
    let toolsData = [];
    let categories = new Set();
    let toolsDataRef = [];
    let collapsedSidebar = new CollapsedSidebar('iconSidebar', {
        onExpand: () => document.getElementById('openSidebarDesktop')?.click(),
        onSearchClick: () => {
            document.getElementById('openSidebarDesktop')?.click();
            setTimeout(() => document.getElementById('searchInput')?.focus(), 300);
        },
        onSignInClick: () => authAttribution.open('sidebar'),
        onUserClick: () => document.getElementById('userProfileBtn')?.click()
    });

    const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';
    const CF_SITEKEY = process.env.CF_SITEKEY || "1x00000000000000000000AA";

    // 1. Initialize UI (Sidebar, Version, Year)
    initUiManager();

    // 2. Load Data & Initialize Renderer
    if (grid) {
        initRenderer(grid);
        await loadData();
        setVotingContext();
        toolsDataRef = toolsData;
        
        // 3. Initialize Filters & Sort
        const filterManager = initFilterManager({
            toolsData,
            categories,
            onFilter: (filtered) => {
                // Future global filter hook
            }
        });
        filterManager.renderFilters();

        initSortManager({
            onSort: () => filterManager.filterAndRender()
        });

        // Handle initial search from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('q')) {
            searchInput.value = urlParams.get('q');
            filterManager.filterAndRender();
        } else if (grid.hasAttribute('data-ssr')) {
            // Grid was pre-rendered at build time - hydrate in place instead of
            // wiping the SSR rows (keeps content visible to no-JS crawlers and
            // avoids a full re-render flash on load). Pass unsorted data: the
            // SSR markup is in README order, matching the null default sort.
            hydrateGrid(toolsData);
        } else {
            renderTools(sortTools(toolsData));
        }
    }

    // 4. Defer auth/voting to improve first interactivity
    let syncVotingUi = () => {};
    let syncFavoritesUi = () => {};
    let syncFollowsUi = () => {};

    const deferredBootstrap = async () => {
        const [{ initAuthManager }, { initVoting, getVoteCount }, favorites, follows] = await Promise.all([
            import('./modules/auth-manager.js'),
            import('./voting.js'),
            import('./favorites.js'),
            import('./follows.js')
        ]);

        const syncSignedOutOnly = user => document.querySelectorAll('[data-signed-out-only]').forEach(el => {
            el.hidden = Boolean(user);
        });

        const authManager = initAuthManager({
            collapsedSidebar,
            onStateChange: user => {
                syncSignedOutOnly(user);
                syncVotingUi();
                void syncFavoritesUi(user);
                void syncFollowsUi(user);
            }
        });
        await authManager.initializeAuth();

        // Deep-link from tool pages: /?signin=1 opens the sign-in modal,
        // then strip the param so a refresh doesn't reopen it
        const signinParams = new URLSearchParams(window.location.search);
        if (signinParams.has('signin')) {
            authAttribution.open(authAttribution.current());
            signinParams.delete('signin');
            const qs = signinParams.toString();
            window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
        }

        const { auth } = await import('./auth.js');
        syncSignedOutOnly(auth.getCurrentUser());
        favorites.initFavorites({
            isAuthenticated: () => auth.isAuthenticated(),
            onUnauthorized: () => auth.signOut(),
            onToggle: added => {
                if (!added) void follows.loadFollows();
            },
        });
        follows.initFollows({
            isAuthenticated: () => auth.isAuthenticated(),
            onUnauthorized: () => auth.signOut(),
            onToggle: added => {
                if (added) void favorites.loadFavorites();
            },
        });
        setFavoriteContext({
            refreshFavoriteButtons: favorites.refreshFavoriteButtons,
            refreshFollowButtons: follows.refreshFollowButtons,
        });
        syncVotingUi = () => {
            setVotingContext({
                getVoteCount,
                isAuthenticated: () => auth.isAuthenticated()
            });
            refreshVotingButtons();
        };
        syncFavoritesUi = async user => {
            try {
                const result = await favorites.syncFavorites(user);
                if (
                    user
                    && !result.stale
                    && !result.authenticated
                    && auth.getCurrentUser()?.id === user.id
                ) {
                    await auth.signOut();
                }
            } catch (error) {
                console.warn('[favorites] sync failed:', error);
            }
        };
        syncFollowsUi = async user => {
            try {
                const result = await follows.syncFollows(user);
                if (
                    user
                    && !result.stale
                    && !result.authenticated
                    && auth.getCurrentUser()?.id === user.id
                ) {
                    await auth.signOut();
                }
            } catch (error) {
                console.warn('[follows] sync failed:', error);
            }
        };
        syncVotingUi();
        await syncFavoritesUi(auth.getCurrentUser());
        await syncFollowsUi(auth.getCurrentUser());

        if (ENABLE_VOTING) {
            await initVoting().catch(err => console.warn('[voting] init failed:', err));
            syncVotingUi();
            renderTurnstile(CF_SITEKEY);
        }
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
            deferredBootstrap().catch(err => console.warn('[bootstrap] deferred init failed:', err));
        }, { timeout: 1500 });
    } else {
        setTimeout(() => {
            deferredBootstrap().catch(err => console.warn('[bootstrap] deferred init failed:', err));
        }, 0);
    }

    async function loadData() {
        const toolsDataEl = document.getElementById('tools-data');
        if (toolsDataEl) {
            const parsed = JSON.parse(toolsDataEl.textContent || '[]');
            toolsData = parsed.map(({ enriched: _e, ...seed }) => seed);
        } else {
            const readmeResponse = await fetch('README.md');
            if (readmeResponse.ok) {
                const text = await readmeResponse.text();
                const { parseMarkdown } = await import('./parser.js');
                toolsData = parseMarkdown(text);
            }
        }
        categories = new Set(toolsData.map(tool => tool.category));
    }

    function renderTurnstile(siteKey) {
        if (typeof turnstile !== 'undefined') {
            window.turnstileWidgetId = turnstile.render("#turnstile-container", {
                sitekey: siteKey,
                size: 'invisible',
                callback: (token) => window.cfTokenValue = token
            });
        } else {
            setTimeout(() => renderTurnstile(siteKey), 100);
        }
    }
});
