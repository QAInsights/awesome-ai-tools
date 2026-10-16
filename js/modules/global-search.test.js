import { describe, expect, test } from 'bun:test';
import { initGlobalSearch } from './global-search.js';

function makeRoot(input = null, dispatchEvent) {
    let listener;
    return {
        getElementById: id => id === 'globalSearchInput' ? input : null,
        ...(dispatchEvent ? { dispatchEvent } : {}),
        addEventListener: (event, callback) => {
            if (event === 'keydown') listener = callback;
        },
        trigger: event => listener?.(event),
    };
}

function makeInput(calls = []) {
    return {
        focused: false,
        selected: false,
        focus() {
            calls.push('focus');
            this.focused = true;
        },
        select() {
            this.selected = true;
        },
    };
}

describe('global search', () => {
    test('focuses the global input on the "/" shortcut', () => {
        const input = makeInput();
        const root = makeRoot(input);
        const event = {
            key: '/',
            target: { tagName: 'DIV' },
            preventDefault: () => { event.prevented = true; },
        };

        initGlobalSearch(root);
        root.trigger(event);

        expect(event.prevented).toBe(true);
        expect(input.focused).toBe(true);
        expect(input.selected).toBe(true);
    });

    test('opens the nav island before focusing the global input', () => {
        const calls = [];
        const input = makeInput(calls);
        const root = makeRoot(input, event => {
            calls.push(event.type);
        });
        const event = {
            key: '/',
            target: { tagName: 'DIV' },
            preventDefault: () => { event.prevented = true; },
        };

        initGlobalSearch(root);
        root.trigger(event);

        expect(calls).toEqual(['nav-island:open', 'focus']);
    });

    test('does nothing when the global input is absent', () => {
        expect(() => initGlobalSearch(makeRoot())).not.toThrow();
    });

    test('ignores the shortcut when typing in the input', () => {
        const input = makeInput();
        const root = makeRoot(input);
        const event = {
            key: '/',
            target: { tagName: 'INPUT' },
            preventDefault: () => { event.prevented = true; },
        };

        initGlobalSearch(root);
        root.trigger(event);

        expect(event.prevented).toBeUndefined();
        expect(input.focused).toBe(false);
    });
});
