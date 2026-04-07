/**
 * Renderer module for UI rendering and lazy loading
 */

import { getShortCategory } from './parser.js';
import { getVoteCount } from './voting.js';
import { sortTools } from './sorting.js';

const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';

const BATCH_SIZE = 20;
let filteredTools = [];
let loadedCount = 0;
let observer = null;
let grid = null;
let onClearCallback = null;

/**
 * Initialize the renderer
 * @param {HTMLElement} gridElement - The grid container element
 */
export function initRenderer(gridElement) {
    grid = gridElement;
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
    row.className = 'flex flex-col md:flex-row gap-2 md:gap-0 py-6 border-b border-[#222] text-white transition-colors hover:border-[#a3a3a3] hover:bg-white/[0.01] items-start group row-anim';
    row.style.animationDelay = `${(index % 15) * 0.02}s`;

    const catShort = getShortCategory(tool.category);
    const catClean = tool.category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();

    const toolId = `${tool.company.toLowerCase().replace(/[^a-z0-9]/g, '')}-${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const initialVoteCount = getVoteCount(toolId);

    row.innerHTML = `
        <div class="w-full flex justify-between items-start md:contents mb-1 md:mb-0">
            <div class="w-auto md:w-[280px] md:pr-6 shrink-0 text-[20px] md:text-[18px] font-medium flex items-center gap-3 md:order-1">
                <span class="hidden md:inline-block font-mono text-[#737373] text-[16px] opacity-0 -translate-x-2.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-white">&rarr;</span>
                <a href="${tool.url}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-white no-underline transition-all duration-200 group/link hover:bg-gradient-to-r hover:from-[#a78bfa] hover:via-[#22d3ee] hover:to-[#a78bfa] hover:bg-[length:200%_auto] hover:bg-clip-text hover:text-transparent hover:animate-[shift_3s_linear_infinite]">
                    ${tool.name}
                    <svg class="w-3.5 h-3.5 opacity-40 group-hover/link:opacity-100 group-hover/link:-translate-y-[2px] group-hover/link:translate-x-[2px] transition-all duration-300 stroke-white" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
            </div>
            <div class="shrink-0 md:w-[84px] md:pr-6 flex justify-end lg:justify-start md:order-5">
${ENABLE_VOTING ? `
                <button class="zap-btn sm" data-tip="Zap this tool!" 
                    data-tool-id="${toolId}"
                    data-tool-name="${tool.name}">
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
                    <span class="zap-count">${initialVoteCount.toLocaleString()}</span>
                </button>
` : `
                <button class="zap-btn sm opacity-50 cursor-not-allowed" disabled data-tip="Voting is currently disabled.">
                    <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                        <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                    </svg>
                    <span class="zap-count">0</span>
                </button>
`}
            </div>
        </div>
        <div class="w-full md:w-[200px] md:pr-6 shrink-0 font-mono text-[14px] text-[#a3a3a3] uppercase tracking-wide mb-2 md:mb-0 md:order-2">${tool.company}</div>
        <div class="w-full md:w-auto md:pr-6 grow text-[16px] text-[#a3a3a3] leading-relaxed transition-colors group-hover:text-[#e0e0e0] mb-3 md:mb-0 md:order-3">${tool.notes}</div>
        <div class="w-full md:hidden lg:block lg:w-[220px] md:px-6 shrink-0 text-left lg:text-center mt-1 md:mt-0 md:order-4">
            <span class="inline-block px-3 py-1 border border-[#222] rounded-full bg-white/5 font-mono text-[13px] tracking-wide" title="${catClean}">${catShort}</span>
        </div>`;

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
