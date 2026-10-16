/**
 * Tests for the "/" search shortcut guard in filter-manager.js
 */

import { describe, test, expect } from 'bun:test';
import { formatFilterStatus, initFilterManager, isSearchShortcutEvent } from './filter-manager.js';

function evt(overrides = {}) {
    return { key: '/', target: { tagName: 'DIV' }, ...overrides };
}

describe('isSearchShortcutEvent', () => {
    test('accepts a bare "/" pressed outside a field', () => {
        expect(isSearchShortcutEvent(evt())).toBe(true);
        expect(isSearchShortcutEvent(evt({ target: null }))).toBe(true);
    });

    test('ignores other keys and modifier combos', () => {
        expect(isSearchShortcutEvent(evt({ key: 'a' }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ ctrlKey: true }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ metaKey: true }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ altKey: true }))).toBe(false);
        expect(isSearchShortcutEvent(null)).toBe(false);
    });

    test('ignores "/" typed into an editable target', () => {
        expect(isSearchShortcutEvent(evt({ target: { tagName: 'INPUT' } }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ target: { tagName: 'TEXTAREA' } }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ target: { tagName: 'SELECT' } }))).toBe(false);
        expect(isSearchShortcutEvent(evt({ target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
    });

    test('ignores events already handled elsewhere', () => {
        expect(isSearchShortcutEvent(evt({ defaultPrevented: true }))).toBe(false);
    });
});

describe('filter status', () => {
    test('formats query and category summaries', () => {
        expect(formatFilterStatus('cursor', 'AI IDEs', 4)).toBe('“cursor” · AI IDEs · 4 tools');
        expect(formatFilterStatus('', 'AI IDEs', 4)).toBe('AI IDEs · 4 tools');
        expect(formatFilterStatus('', null, 12)).toBe('');
    });
});

describe('filter manager search shortcut', () => {
    test('opens the nav island before focusing search', () => {
        const calls = [];
        let keydown;
        const input = {
            value: '',
            addEventListener() {},
            focus: () => calls.push('focus'),
            select() {},
        };
        const fakeDocument = {
            getElementById: id => id === 'searchInput' ? input : null,
            addEventListener: (type, listener) => {
                if (type === 'keydown') keydown = listener;
            },
            dispatchEvent: event => {
                calls.push(event.type);
                return true;
            },
        };
        const originalDocument = globalThis.document;
        globalThis.document = fakeDocument;

        try {
            initFilterManager({ toolsData: [], categories: [] });
            keydown({
                key: '/',
                target: { tagName: 'BODY' },
                preventDefault() {},
            });
            expect(calls).toEqual(['nav-island:open', 'focus']);
        } finally {
            if (originalDocument) globalThis.document = originalDocument;
            else delete globalThis.document;
        }
    });

    test('defers rendering category cards until the scope accordion button is clicked', () => {
        let clickHandler;
        const appended = [];
        const filtersContainer = {
            innerHTML: '',
            className: '',
            appendChild: node => appended.push(node),
        };
        const accordionBtn = {
            addEventListener: (type, fn) => {
                if (type === 'click') clickHandler = fn;
            },
            classList: { toggle() {}, remove() {} },
        };
        const accordionContent = {
            classList: {
                hidden: true,
                contains(cls) { return cls === 'hidden' && this.hidden; },
                toggle(cls) { if (cls === 'hidden') this.hidden = !this.hidden; },
                add(cls) { if (cls === 'hidden') this.hidden = true; },
            },
        };
        const fakeDocument = {
            getElementById: id => {
                if (id === 'categoryFilters') return filtersContainer;
                if (id === 'filterAccordionBtn') return accordionBtn;
                if (id === 'filterAccordion') return accordionContent;
                return null;
            },
            addEventListener() {},
            createDocumentFragment: () => ({
                children: [],
                appendChild(child) { this.children.push(child); },
            }),
            createElement: () => ({
                className: '',
                dataset: {},
                innerHTML: '',
                classList: { add() {}, remove() {} },
                addEventListener() {},
            }),
        };
        const originalDocument = globalThis.document;
        globalThis.document = fakeDocument;

        try {
            const fm = initFilterManager({
                toolsData: [{ name: 'Cursor', url: 'https://cursor.com', category: 'AI IDEs' }],
                categories: new Set(['AI IDEs']),
            });
            fm.renderFilters();
            expect(appended.length).toBe(0);

            clickHandler({ stopPropagation() {} });
            expect(appended.length).toBe(1);
            expect(appended[0].children.length).toBe(2);
            expect(appended[0].children[0].innerHTML).toContain('loading="lazy" decoding="async"');
        } finally {
            if (originalDocument) globalThis.document = originalDocument;
            else delete globalThis.document;
        }
    });
});
