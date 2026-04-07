/**
 * Sorting module for tool registry
 * Handles sort state and sorting logic for tool data
 */

import { getVoteCount } from './voting.js';

let currentSort = { column: 'votes', direction: 'desc' };

/**
 * Get current sort state
 * @returns {Object} Current sort state
 */
export function getSortState() {
    return currentSort;
}

/**
 * Set sort state
 * @param {string} column - Column to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 */
export function setSortState(column, direction) {
    currentSort = { column, direction };
}

/**
 * Toggle sort state for a column
 * @param {string} column - Column to toggle sort for
 * @returns {Object} New sort state
 */
export function toggleSortState(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    return currentSort;
}

/**
 * Sort tools based on current sort state
 * @param {Array} tools - Tools to sort
 * @returns {Array} Sorted tools
 */
export function sortTools(tools) {
    if (!currentSort.column) return tools;
    
    const sorted = [...tools];
    const multiplier = currentSort.direction === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
        let valA, valB;
        
        switch (currentSort.column) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                break;
            case 'company':
                valA = (a.company || '').toLowerCase();
                valB = (b.company || '').toLowerCase();
                break;
            case 'category':
                valA = (a.category || '').toLowerCase();
                valB = (b.category || '').toLowerCase();
                break;
            case 'votes':
                valA = parseInt(getVoteCount(`${(a.company || '').toLowerCase().replace(/[^a-z0-9]/g, '')}-${(a.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`)) || 0;
                valB = parseInt(getVoteCount(`${(b.company || '').toLowerCase().replace(/[^a-z0-9]/g, '')}-${(b.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`)) || 0;
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return -1 * multiplier;
        if (valA > valB) return 1 * multiplier;
        return 0;
    });
    
    return sorted;
}

/**
 * Update sort UI indicators on table headers
 */
export function updateSortUI() {
    document.querySelectorAll('[data-sort]').forEach(header => {
        const column = header.dataset.sort;
        const icon = header.querySelector('.sort-icon');
        
        if (!icon) return;
        
        if (currentSort.column === column) {
            icon.textContent = currentSort.direction === 'asc' ? '↑' : '↓';
            icon.classList.remove('opacity-50');
            icon.classList.add('text-white');
        } else {
            icon.textContent = '↕';
            icon.classList.add('opacity-50');
            icon.classList.remove('text-white');
        }
    });
}
