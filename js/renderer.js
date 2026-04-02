/**
 * Renderer module for UI rendering and lazy loading
 */

import { getShortCategory } from './parser.js';

const BATCH_SIZE = 20;
let filteredTools = [];
let loadedCount = 0;
let observer = null;
let grid = null;

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
    return tools.filter(tool => 
        (category === 'all' || tool.category === category) &&
        (tool.name.toLowerCase().includes(searchVal) || 
         tool.company.toLowerCase().includes(searchVal) || 
         tool.notes.toLowerCase().includes(searchVal) || 
         tool.category.toLowerCase().includes(searchVal))
    );
}

/**
 * Render filtered tools with lazy loading
 * @param {Array} tools - Filtered tools to render
 */
export function renderTools(tools) {
    filteredTools = tools;
    loadedCount = 0;
    grid.innerHTML = '';
    loadBatch();
}

/**
 * Load a batch of tools
 */
function loadBatch() {
    if (filteredTools.length === 0) {
        grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">No processes found matching criteria.</p>`;
        return;
    }
    
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
    const row = document.createElement('a');
    row.href = tool.url;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
    row.className = 'row';
    row.style.animationDelay = `${(index % 15) * 0.02}s`;
    
    const catShort = getShortCategory(tool.category);
    const catClean = tool.category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
    
    row.innerHTML = `
        <div class="col col-name">${tool.name}</div>
        <div class="col col-company">${tool.company}</div>
        <div class="col col-desc">${tool.notes}</div>
        <div class="col col-cat"><span class="category-badge" title="${catClean}">${catShort}</span></div>
        <div class="col col-vote">
            <button class="zap-btn sm" data-tip="ZAP is coming soon." data-tool-id="${tool.name.toLowerCase().replace(/\s+/g, '-')}">
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
                <span class="zap-count">0</span>
            </button>
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
