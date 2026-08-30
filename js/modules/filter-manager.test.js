/**
 * Tests for the "/" search shortcut guard in filter-manager.js
 */

import { describe, test, expect } from 'bun:test';
import { isSearchShortcutEvent } from './filter-manager.js';

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
