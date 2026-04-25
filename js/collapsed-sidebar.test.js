/**
 * Tests for collapsed-sidebar.js
 *
 * Covers:
 * - render(): only functional icons shown (expand, submit, support, search)
 * - render(): sign-in and user buttons NOT rendered
 * - attachListeners(): callbacks wired to correct buttons
 * - setAuthState(): stores state, does not throw
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CollapsedSidebar } from './collapsed-sidebar.js';

// ── DOM mock ──────────────────────────────────────────────────────────────────

function makeContainer() {
    let html = '';
    const listeners = {};
    const queryMap = {};

    const container = {
        innerHTML: '',
        set innerHTML(val) {
            html = val;
            // Parse simple id queries from rendered HTML
            const idMatches = [...val.matchAll(/id="([^"]+)"/g)];
            idMatches.forEach(([, id]) => {
                queryMap[`#${id}`] = makeButton(id);
            });
        },
        get innerHTML() { return html; },
        querySelector: (sel) => queryMap[sel] ?? null,
        querySelectorAll: (sel) => Object.entries(queryMap)
            .filter(([k]) => k === sel)
            .map(([, v]) => v),
    };
    return container;
}

function makeButton(id) {
    const listeners = {};
    return {
        id,
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: (ev, fn) => { listeners[ev] = fn; },
        _trigger: (ev) => listeners[ev]?.(),
        _listeners: listeners,
    };
}

function setupGlobalDocument(container) {
    global.document = {
        getElementById: (id) => id === 'test-sidebar' ? container : null,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('collapsed-sidebar > render', () => {
    let container;

    beforeEach(() => {
        container = makeContainer();
        setupGlobalDocument(container);
    });

    test('should render expand button', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).toContain('id="expandBtn"');
    });

    test('should render submit tool link', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).toContain('submit-tool');
    });

    test('should render support link', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).toContain('buymeacoffee');
    });

    test('should render search button', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).toContain('id="searchBtn"');
    });

    test('should NOT render sign-in button', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).not.toContain('id="signInBtn"');
    });

    test('should NOT render user profile button', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).not.toContain('id="userBtn"');
    });

    test('should NOT render user avatar image', () => {
        new CollapsedSidebar('test-sidebar', {});
        expect(container.innerHTML).not.toContain('id="userAvatarImg"');
    });
});

describe('collapsed-sidebar > attachListeners', () => {
    let container;

    beforeEach(() => {
        container = makeContainer();
        setupGlobalDocument(container);
    });

    test('should call onExpand when expand button clicked', () => {
        let called = false;
        const sb = new CollapsedSidebar('test-sidebar', { onExpand: () => { called = true; } });
        container.querySelector('#expandBtn')?._trigger('click');
        expect(called).toBe(true);
    });

    test('should call onSearchClick when search button clicked', () => {
        let called = false;
        const sb = new CollapsedSidebar('test-sidebar', { onSearchClick: () => { called = true; } });
        container.querySelector('#searchBtn')?._trigger('click');
        expect(called).toBe(true);
    });

    test('should not throw when no callbacks provided', () => {
        expect(() => new CollapsedSidebar('test-sidebar', {})).not.toThrow();
    });

    test('should not throw when container does not exist', () => {
        global.document = { getElementById: () => null };
        expect(() => new CollapsedSidebar('nonexistent', {})).not.toThrow();
    });
});

describe('collapsed-sidebar > setAuthState', () => {
    let container;

    beforeEach(() => {
        container = makeContainer();
        setupGlobalDocument(container);
    });

    test('should store authenticated state', () => {
        const sb = new CollapsedSidebar('test-sidebar', {});
        sb.setAuthState(true, 'https://example.com/avatar.png');
        expect(sb.isAuthenticated).toBe(true);
        expect(sb.userAvatar).toBe('https://example.com/avatar.png');
    });

    test('should store unauthenticated state', () => {
        const sb = new CollapsedSidebar('test-sidebar', {});
        sb.setAuthState(false);
        expect(sb.isAuthenticated).toBe(false);
        expect(sb.userAvatar).toBeNull();
    });

    test('should not throw when called after sign-in button removed', () => {
        const sb = new CollapsedSidebar('test-sidebar', {});
        expect(() => sb.setAuthState(true, 'https://example.com/avatar.png')).not.toThrow();
        expect(() => sb.setAuthState(false)).not.toThrow();
    });
});
