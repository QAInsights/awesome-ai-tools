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
        const searchVal = searchInput.value.toLowerCase();
        const filtered = filterTools(toolsData, currentCategory, searchVal);
        renderTools(filtered);
    }
    
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
