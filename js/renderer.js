/**
 * Renderer module for UI rendering and lazy loading
 */
import { toggleTool, isSelected, getSelected, clearSelection } from "./compare-state.js";


import { getShortCategory } from './category.js';
import { sortTools } from './sorting.js';

const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';
let getVoteCountFn = () => 0;
let isAuthenticatedFn = () => false;

const BATCH_SIZE = 20;
let filteredTools = [];
let loadedCount = 0;
let observer = null;
let grid = null;
let onClearCallback = null;
const COMPARE_LIMIT = 3;

/**
 * Initialize the renderer
 * @param {HTMLElement} gridElement - The grid container element
 */
export function initRenderer(gridElement) {
    grid = gridElement;
    setupCompareHandlers();
}

export function setVotingContext(context = {}) {
    if (typeof context.getVoteCount === 'function') {
        getVoteCountFn = context.getVoteCount;
    }
    if (typeof context.isAuthenticated === 'function') {
        isAuthenticatedFn = context.isAuthenticated;
    }
}

function createZapButtonHtml(toolId, toolName, voteCount) {
    if (!ENABLE_VOTING) {
        return `
                <button class="zap-btn sm row opacity-50 cursor-not-allowed" disabled data-tip="Voting is disabled.">
                    <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                        <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                    </svg>
                    <span class="zap-count">${voteCount.toLocaleString()}</span>
                </button>
`;
    }

    if (isAuthenticatedFn()) {
        return `
                <button class="zap-btn sm row" data-tip="Zap this tool!" 
                    data-tool-id="${toolId}"
                    data-tool-name="${toolName}">
                    <div class="zap-ring"></div>
                    <div class="sparks">
                        <div class="spark spark-1"></div>
                        <div class="spark spark-2"></div>   
                        <div class="spark spark-3"></div>
                        <div class="spark spark-4"></div>
                        <div class="spark spark-5"></div>
                    </div>
                    <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                        <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                    </svg>
                    <span class="zap-count">${voteCount.toLocaleString()}</span>
                </button>
`;
    }

    return `
                <button class="zap-btn sm row" data-tip="Sign in to vote!" 
                    data-tool-id="${toolId}"
                    data-tool-name="${toolName}">
                    <svg class="zap-icon" viewBox="0 0 24 24" fill="none" style="opacity:0.4">
                        <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                    </svg>
                    <span class="zap-count" style="opacity:0.5">${voteCount.toLocaleString()}</span>
                </button>
`;
}

export function refreshVotingButtons() {
    const containers = grid?.querySelectorAll('.zap-btn[data-tool-id]') ?? [];
    containers.forEach((btn) => {
        const toolId = btn.dataset.toolId;
        const toolName = btn.dataset.toolName;
        if (!toolId || !toolName) return;

        const voteCount = getVoteCountFn(toolId);
        btn.outerHTML = createZapButtonHtml(toolId, toolName, voteCount).trim();
    });
}

/**
 * Update the compare floating bar based on current selection state
 */
function updateCompareBar() {
    const selected = getSelected();
    const bar = document.getElementById('compareFloatingBar');
    const countText = document.getElementById('compareCountText');
    const helperText = document.getElementById('compareHelperText');
    const thumbsContainer = document.getElementById('compareThumbnails');
    const compareBtn = document.getElementById('compareBtn');

    if (!bar) return;

    if (selected.length === 0) {
        bar.style.translate = '0 100%';
    } else {
        bar.style.translate = '0 0';
    }

    if (countText) {
        countText.textContent = selected.length === 0
            ? 'Select tools to compare'
            : `${selected.length} of ${COMPARE_LIMIT} selected`;
    }

    if (helperText) {
        if (selected.length === 0) {
            helperText.textContent = `Pick up to ${COMPARE_LIMIT} tools. Compare unlocks when you select at least 2.`;
        } else {
            helperText.textContent = selected.length === COMPARE_LIMIT
                ? 'Selection limit reached. Remove one tool to pick another.'
                : `Select ${Math.max(2 - selected.length, 0)} more to compare, or keep adding up to ${COMPARE_LIMIT}.`;
        }
    }

    if (thumbsContainer) {
        thumbsContainer.innerHTML = selected.map((slug) => {
            const row = grid?.querySelector?.(`[data-compare-row][data-slug="${slug}"]`);
            const label = row?.dataset?.toolName || slug;
            return `<span class="compare-pill">${label}</span>`;
        }
        ).join('');
    }

    if (compareBtn) {
        compareBtn.disabled = selected.length < 2;
        compareBtn.textContent = selected.length >= 2
            ? `Compare ${selected.length}`
            : 'Compare';
    }
}

/**
 * Sync the visual state of compare rows and checkboxes.
 */
function syncCompareRows() {
    const selected = getSelected();
    const atLimit = selected.length >= COMPARE_LIMIT;

    grid?.querySelectorAll?.('[data-compare-row]').forEach((row) => {
        const slug = row.dataset.slug;
        const checked = isSelected(slug);
        const checkbox = row.querySelector('input[type="checkbox"]');
        const control = row.querySelector('.compare-checkbox');

        row.classList.toggle('compare-row-selected', checked);
        row.dataset.selected = checked ? 'true' : 'false';
        row.setAttribute('aria-selected', checked ? 'true' : 'false');

        if (checkbox) {
            checkbox.checked = checked;
            checkbox.disabled = atLimit && !checked;
        }

        if (control) {
            control.classList.toggle('active', checked);
            control.classList.toggle('compare-checkbox-disabled', atLimit && !checked);
        }
    });
}

function handleCompareSelection(slug) {
    if (!slug) return;

    const success = toggleTool(slug);
    if (!success) return;

    syncCompareRows();
    updateCompareBar();
}

/**
 * Set up event handlers for compare checkboxes and floating bar buttons
 */
function setupCompareHandlers() {
    if (!grid) return;

    grid.addEventListener('click', (e) => {
        const interactiveChild = e.target.closest('a, button');
        if (interactiveChild && !interactiveChild.closest('.compare-checkbox')) return;

        const row = e.target.closest('[data-compare-row]');
        const control = e.target.closest('.compare-checkbox');
        if (!row && !control) return;

        e.preventDefault();
        handleCompareSelection((control || row)?.dataset.slug);
    });

    const clearBtn = document.getElementById('clearCompareBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearSelection();
            syncCompareRows();
            updateCompareBar();
        });
    }

    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            const selected = getSelected();
            if (selected.length >= 2) {
                window.location.href = `/compare?tools=${selected.join(',')}`;
            }
        });
    }

    updateCompareBar();
}

/**
 * Filter tools based on category and search value
 * @param {Array} tools - All tools data
 * @param {string} category - Current category filter
 * @param {string} searchVal - Search input value
 * @returns {Array} Filtered tools
 */
export function filterTools(tools, category, searchVal) {
    const safeLower = (val) => (val || '').toLowerCase();
    const searchLower = safeLower(searchVal);

    const filtered = tools.filter(tool =>
        (category === 'all' || tool.category === category) &&
        (safeLower(tool.name).includes(searchLower) ||
            safeLower(tool.company).includes(searchLower) ||
            safeLower(tool.notes).includes(searchLower) ||
            safeLower(tool.category).includes(searchLower))
    );
    
    return sortTools(filtered);
}

/**
 * Render filtered tools with lazy loading
 * @param {Array} tools - Filtered tools to render
 * @param {string} searchVal - Current search value (unused, reserved)
 * @param {Function} clearCallback - Callback to clear all filters
 */
export function renderTools(tools, searchVal, clearCallback) {
    filteredTools = tools;
    loadedCount = 0;
    onClearCallback = clearCallback || null;
    grid.innerHTML = '';
    loadBatch();
}

/**
 * Load a batch of tools
 */
function loadBatch() {
    console.log('loadBatch called, filteredTools.length:', filteredTools.length);
    if (filteredTools.length === 0) {
        console.log('No tools to render - showing empty state');
        const empty = document.createElement('div');
        empty.className = 'py-6 px-0 md:py-10 md:px-8 flex flex-col items-start gap-3';
        empty.innerHTML = `
            <p class="text-[#a3a3a3] m-0 text-[15px]">No tools matched your search or filter.</p>
            <button id="clearFiltersBtn" class="bg-transparent border border-[#222] text-[#a3a3a3] font-mono text-[12px] tracking-wide px-3 py-1.5 rounded cursor-pointer hover:text-white transition-colors">CLEAR FILTERS</button>`;
        grid.appendChild(empty);
        const btn = document.getElementById('clearFiltersBtn');
        if (btn && onClearCallback) btn.addEventListener('click', onClearCallback);
        return;
    }

    console.log('Rendering batch from', loadedCount, 'to', Math.min(loadedCount + BATCH_SIZE, filteredTools.length));
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(loadedCount + BATCH_SIZE, filteredTools.length);

    for (let i = loadedCount; i < endIndex; i++) {
        const tool = filteredTools[i];
        const row = createToolRow(tool, i);
        fragment.appendChild(row);
    }

    grid.appendChild(fragment);
    loadedCount = endIndex;

    syncCompareRows();
    updateCompareBar();
    updateSentinel();
}

/**
 * Create a tool row element
 * @param {Object} tool - Tool data object
 * @param {number} index - Tool index for animation delay
 * @returns {HTMLElement} Row element
 */
function createToolRow(tool, index) {
    const row = document.createElement('div');
    row.className = 'compare-row flex flex-col md:flex-row gap-2 md:gap-0 py-5 md:py-6 border-b border-[#222] text-white transition-all duration-200 items-start group row-anim cursor-pointer';
    row.style.animationDelay = `${(index % 15) * 0.02}s`;
    row.dataset.compareRow = 'true';
    row.dataset.slug = tool.slug;
    row.dataset.toolName = tool.name;
    row.dataset.selected = isSelected(tool.slug) ? 'true' : 'false';

    const catShort = getShortCategory(tool.category);
    const catClean = tool.category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();

    const toolId = `${tool.company.toLowerCase().replace(/[^a-z0-9]/g, '')}-${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const initialVoteCount = getVoteCountFn(toolId);

    const detailHref = tool.slug ? `/tools/${tool.slug}` : tool.url;
    
    // Truncate notes
    const fullNotes = tool.notes || '';
    const isLong = fullNotes.length > 105;
    const displayNotes = isLong ? fullNotes.substring(0, 100) + '...' : fullNotes;

    row.innerHTML = `
        <div class="w-full flex justify-between items-start md:contents mb-1 md:mb-0">
            <div class="w-auto md:w-[280px] md:pr-6 shrink-0 text-[20px] md:text-[18px] font-medium flex items-center gap-3 md:order-1">
                <label class="compare-checkbox ${isSelected(tool.slug) ? 'active' : ''}" data-slug="${tool.slug}" title="Select ${tool.name} for comparison" aria-label="Select ${tool.name} for comparison">
                    <input type="checkbox" ${isSelected(tool.slug) ? 'checked' : ''}>
                    <span class="compare-checkbox-box">
                        <svg class="compare-checkbox-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M4.75 10.5C6.4 11.2 8.5 10.4 10.75 6.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
                            <path d="M10.1 6.3L12 5.5L11.55 7.55" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </span>
                </label>
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="hidden md:inline-block font-mono text-[#737373] text-[16px] opacity-0 -translate-x-2.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-white">&rarr;</span>
                    <a href="${detailHref}" class="flex-1 min-w-0 text-white no-underline transition-all duration-200 hover:bg-gradient-to-r hover:from-[#a78bfa] hover:via-[#22d3ee] hover:to-[#a78bfa] hover:bg-[length:200%_auto] hover:bg-clip-text hover:text-transparent hover:animate-[shift_3s_linear_infinite]" aria-label="View details for ${tool.name}">
                        ${tool.name}
                    </a>
                    <a href="${tool.url}" target="_blank" rel="noopener noreferrer" class="shrink-0 text-[#737373] hover:text-white p-1 -m-1 rounded transition-colors duration-200" aria-label="Open ${tool.name} site in a new tab" title="Open site in new tab" onclick="event.stopPropagation()">
                        <svg class="w-3.5 h-3.5 opacity-60 hover:opacity-100 transition-all duration-200 stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            </div>
            <div class="shrink-0 md:w-[120px] md:pr-6 flex justify-end md:justify-center md:order-5">
${createZapButtonHtml(toolId, tool.name, initialVoteCount)}
            </div>
        </div>
        <div class="w-full md:w-[200px] md:pr-6 shrink-0 font-mono text-[14px] text-[#a3a3a3] uppercase tracking-wide mb-2 md:mb-0 md:order-2">${tool.company}</div>
        <div class="w-full md:w-auto md:pr-6 grow text-[16px] text-[#a3a3a3] leading-relaxed transition-colors group-hover:text-[#e0e0e0] mb-3 md:mb-0 md:order-3 tool-notes" title="${isLong ? fullNotes : ''}">${displayNotes}</div>
        <div class="w-full md:hidden lg:block lg:w-[180px] md:px-6 shrink-0 text-left lg:text-center mt-1 md:mt-0 md:order-4">
            <span class="inline-block px-3 py-1 border border-[#222] rounded-full bg-white/5 font-mono text-[13px] tracking-wide" title="${catClean}">${catShort}</span>
        </div>`;

    row.setAttribute('aria-selected', isSelected(tool.slug) ? 'true' : 'false');

    return row;
}

/**
 * Update sentinel element for intersection observer
 */
function updateSentinel() {
    if (loadedCount < filteredTools.length) {
        let sentinel = document.getElementById('load-sentinel');
        if (sentinel) sentinel.remove();

        sentinel = document.createElement('div');
        sentinel.id = 'load-sentinel';
        sentinel.style.height = '1px';
        grid.appendChild(sentinel);

        setupObserver(sentinel);
    } else {
        const sentinel = document.getElementById('load-sentinel');
        if (sentinel) sentinel.remove();
    }
}

/**
 * Setup intersection observer for lazy loading
 * @param {HTMLElement} sentinel - Sentinel element to observe
 */
function setupObserver(sentinel) {
    if (observer) observer.disconnect();

    // On mobile, registry has overflow:visible, so use viewport as root
    const registry = document.querySelector('.registry');
    const isMobile = window.innerWidth <= 768;
    const root = isMobile ? null : registry;

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && loadedCount < filteredTools.length) {
                loadBatch();
            }
        });
    }, {
        root: root,
        rootMargin: '100px',
        threshold: 0
    });

    observer.observe(sentinel);
}

// Make sure to re-export
export { grid, onClearCallback, loadBatch };
