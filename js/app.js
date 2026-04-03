/**
 * Main application entry point
 * AI IDEs & Coding Assistants - Tool Registry
 */

import { parseMarkdown, extractCategories } from './parser.js';
import { initRenderer, filterTools, renderTools } from './renderer.js';
import { initVoting } from './voting.js';

document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const resultCount = document.getElementById('resultCount');
    const categoryFilters = document.getElementById('categoryFilters');
    
    let toolsData = [];
    let categories = new Set();
    let currentCategory = 'all';
    
    // Initialize renderer and voting
    initRenderer(grid);
    initVoting();
    
    // Load data
    try {
        const response = await fetch('README.md');
        if (!response.ok) throw new Error('Failed to fetch README');
        
        const text = await response.text();
        toolsData = parseMarkdown(text);
        categories = extractCategories(toolsData);
        
        renderFilters();
        filterAndRender();
    } catch (error) {
        console.error('Error loading tools:', error);
        grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">Could not load registry. Ensure you are running via a local server.</p>`;
    }
    
    /**
     * Render category filter buttons
     */
    function renderFilters() {
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.category = cat;
            btn.textContent = cat.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = cat;
                filterAndRender();
            });
            categoryFilters.appendChild(btn);
        });
        
        document.querySelector('[data-category="all"]').addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = 'all';
            filterAndRender();
        });
    }
    
    /**
     * Filter and render tools
     */
    function filterAndRender() {
        const searchVal = searchInput.value;
        const filtered = filterTools(toolsData, currentCategory, searchVal);
        renderTools(filtered, searchVal, () => clearAll());
        updateResultCount(filtered.length, toolsData.length);
        searchClear.classList.toggle('visible', searchVal.length > 0);
    }

    /**
     * Update the result count display
     */
    function updateResultCount(shown, total) {
        if (shown === total) {
            resultCount.textContent = `${total} tools`;
        } else {
            resultCount.textContent = `${shown} of ${total} tools`;
        }
    }

    /**
     * Clear search and reset filters
     */
    function clearAll() {
        searchInput.value = '';
        currentCategory = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-category="all"]').classList.add('active');
        filterAndRender();
    }
    
    // Clear button click
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        filterAndRender();
    });

    // Keyboard shortcut: / focuses search
    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isEditableElement = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable
        );
        
        if (e.key === '/' && !isEditableElement) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            searchInput.blur();
            filterAndRender();
        }
    });

    // Event listeners
    searchInput.addEventListener('input', filterAndRender);
    
    // Update year in footer
    updateYear();
    
    function updateYear() {
        const year = new Date().getFullYear();
        const yearElement = document.querySelector('.footer-copy');
        yearElement.textContent = `© ${year} NaveenKumar Namachivayam`;
    }
});
