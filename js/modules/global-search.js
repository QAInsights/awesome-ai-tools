import { isSearchShortcutEvent } from './filter-manager.js';

export function initGlobalSearch(root = document) {
    const input = root.getElementById('globalSearchInput');
    if (!input) return;

    root.addEventListener('keydown', event => {
        if (!isSearchShortcutEvent(event)) return;
        event.preventDefault();
        input.focus();
        input.select?.();
    });
}
