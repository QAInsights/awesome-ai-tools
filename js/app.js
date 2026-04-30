/**
 * Main application entry point
 * AI IDEs & Coding Assistants - Tool Registry
 */

import { initRenderer, renderTools, setVotingContext, refreshVotingButtons } from './renderer.js';
import { CollapsedSidebar } from './collapsed-sidebar.js';
import { initGradientSelection } from './gradient-selection.js';
import { initFilterManager } from './modules/filter-manager.js';
import { initUiManager } from './modules/ui-manager.js';
import { initSortManager } from './modules/sort-manager.js';
import { sortTools } from './sorting.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGradientSelection();
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    
    let toolsData = [];
    let categories = new Set();
    let toolsDataRef = [];
    let filterManagerRef = null;
    let collapsedSidebar = new CollapsedSidebar('iconSidebar', {
        onExpand: () => document.getElementById('openSidebarDesktop')?.click(),
        onSearchClick: () => {
            document.getElementById('openSidebarDesktop')?.click();
            setTimeout(() => document.getElementById('searchInput')?.focus(), 300);
        },
        onSignInClick: () => document.getElementById('signInTriggerBtn')?.click(),
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
        filterManagerRef = filterManager;
        filterManager.renderFilters();

        initSortManager({
            onSort: () => filterManager.filterAndRender()
        });

        // Handle initial search from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('q')) {
            searchInput.value = urlParams.get('q');
            filterManager.filterAndRender();
        } else {
            renderTools(sortTools(toolsData));
        }
    }

    // 4. Defer auth/voting to improve first interactivity
    let syncVotingUi = () => {};

    const deferredBootstrap = async () => {
        const [{ initAuthManager }, { initVoting, getVoteCount }] = await Promise.all([
            import('./modules/auth-manager.js'),
            import('./voting.js')
        ]);

        const authManager = initAuthManager({
            collapsedSidebar,
            onStateChange: () => {
                syncVotingUi();
            }
        });
        await authManager.initializeAuth();

        const { auth } = await import('./auth.js');
        syncVotingUi = () => {
            setVotingContext({
                getVoteCount,
                isAuthenticated: () => auth.isAuthenticated()
            });
            refreshVotingButtons();
        };
        syncVotingUi();

        if (ENABLE_VOTING) {
            initVoting().catch(err => console.warn('[voting] init failed:', err));
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
