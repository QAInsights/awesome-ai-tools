import { isSearchShortcutEvent } from './filter-manager.js';

export function initGlobalSearch(root = document) {
    const input = root.getElementById('globalSearchInput');
    if (!input) return;

    root.addEventListener('keydown', event => {
        if (!isSearchShortcutEvent(event)) return;
        event.preventDefault();
        if (typeof root.dispatchEvent === 'function') root.dispatchEvent(new CustomEvent('nav-island:open'));
        input.focus();
        input.select?.();
    });
}
