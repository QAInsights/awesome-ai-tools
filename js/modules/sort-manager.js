import { getSortState, setSortState, updateSortUI } from '../sorting.js';

export function initSortManager(config) {
    const { onSort } = config;

    function handleSortClick(column) {
        const currentState = getSortState();
        let newDirection = 'asc';
        
        if (currentState.column === column) {
            newDirection = currentState.direction === 'asc' ? 'desc' : 'asc';
        }
        
        setSortState(column, newDirection);
        updateSortUI();
        if (onSort) onSort(column, newDirection);
    }

    const sortHeaders = document.querySelectorAll('[data-sort]');
    sortHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSortClick(header.dataset.sort);
        });
    });

    // Initial UI update
    updateSortUI();
}
