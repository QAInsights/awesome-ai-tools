/**
 * Main application entry point
 * AI IDEs & Coding Assistants - Tool Registry
 */

import { parseMarkdown, extractCategories } from './parser.js';
import { initRenderer, renderTools } from './renderer.js';
import { initVoting } from './voting.js';
import { CollapsedSidebar } from './collapsed-sidebar.js';
import { initGradientSelection } from './gradient-selection.js';
import { initAuthManager } from './modules/auth-manager.js';
import { initFilterManager } from './modules/filter-manager.js';
import { initUiManager } from './modules/ui-manager.js';
import { initSortManager } from './modules/sort-manager.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGradientSelection();
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    
    let toolsData = [];
    let categories = new Set();
    let collapsedSidebar = new CollapsedSidebar();

    const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';
    const CF_SITEKEY = process.env.CF_SITEKEY || "1x00000000000000000000AA";

    // 1. Initialize UI (Sidebar, Version, Year)
    initUiManager();

    // 2. Initialize Auth
    const authManager = initAuthManager({
        collapsedSidebar,
        onStateChange: (user) => {
            // Future global state hook
        }
    });
    await authManager.initializeAuth();

    // 3. Initialize Voting (parallel)
    if (ENABLE_VOTING) {
        initVoting().catch(err => console.warn('[voting] init failed:', err));
        renderTurnstile(CF_SITEKEY);
    }
    
    // 4. Load Data & Initialize Renderer
    if (grid) {
        initRenderer(grid);
        await loadData();
        
        // 5. Initialize Filters & Sort
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
        } else {
            renderTools(toolsData);
        }
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
                toolsData = parseMarkdown(text);
            }
        }
        categories = extractCategories(toolsData);
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
