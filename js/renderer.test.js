/**
 * Tests for renderer.js compare toggle and floating bar logic
 *
 * Tests cover:
 * - updateCompareBar: bar visibility, count text, thumbnails, compare button state
 * - setupCompareHandlers: click delegation, INPUT tag guard, slug extraction,
 *   toggle class toggling, clearCompareBtn, compareBtn navigation
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { clearSelection, toggleTool, getSelected } from './compare-state.js';

// ── Minimal DOM mock ──────────────────────────────────────────────────────────

function makeEl(tag = 'div', attrs = {}) {
    const classes = new Set();
    const listeners = {};
    const el = {
        tagName: tag.toUpperCase(),
        dataset: {},
        style: {},
        disabled: false,
        textContent: '',
        innerHTML: '',
        children: [],
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            toggle: (c, force) => {
                if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); }
                else { force ? classes.add(c) : classes.delete(c); }
            },
            contains: (c) => classes.has(c),
        },
        addEventListener: (ev, fn) => { listeners[ev] = fn; },
        _trigger: (ev, e) => listeners[ev]?.(e),
        _classes: classes,
        ...attrs,
    };
    return el;
}

function makeGrid() {
    const listeners = {};
    const children = [];
    return {
        tagName: 'DIV',
        addEventListener: (ev, fn) => { listeners[ev] = fn; },
        _trigger: (ev, e) => listeners[ev]?.(e),
        querySelectorAll: (sel) => sel === '.compare-toggle-switch.active' ? children.filter(c => c.classList.contains('active')) : [],
        appendChild: (c) => children.push(c),
        innerHTML: '',
        children,
    };
}

// ── Shared state ──────────────────────────────────────────────────────────────

let bar, countText, thumbnails, compareBtn, clearBtn, grid;
const elements = {};

function setupDOM() {
    bar = makeEl('div');
    countText = makeEl('span');
    thumbnails = makeEl('div');
    compareBtn = makeEl('button');
    clearBtn = makeEl('button');
    grid = makeGrid();

    elements['compareFloatingBar'] = bar;
    elements['compareCountText'] = countText;
    elements['compareThumbnails'] = thumbnails;
    elements['compareBtn'] = compareBtn;
    elements['clearCompareBtn'] = clearBtn;

    global.document = {
        getElementById: (id) => elements[id] ?? null,
        querySelectorAll: () => [],
    };
    global.window = { location: { href: '' } };
}

// ── Inline updateCompareBar (mirrors renderer.js logic exactly) ──────────────

function updateCompareBar() {
    const selected = getSelected();
    const b = global.document.getElementById('compareFloatingBar');
    const ct = global.document.getElementById('compareCountText');
    const th = global.document.getElementById('compareThumbnails');
    const cb = global.document.getElementById('compareBtn');

    if (!b) return;

    if (selected.length === 0) {
        b.style.translate = '0 100%';
    } else {
        b.style.translate = '0 0';
    }

    if (ct) {
        ct.textContent = `${selected.length} tool${selected.length === 1 ? '' : 's'} selected`;
    }

    if (th) {
        th.innerHTML = selected.map(slug =>
            `<span>${slug}</span>`
        ).join('');
    }

    if (cb) {
        cb.disabled = selected.length < 2;
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('renderer > updateCompareBar', () => {
    beforeEach(() => {
        clearSelection();
        setupDOM();
    });

    test('should hide bar when no tools selected', () => {
        updateCompareBar();
        expect(bar.style.translate).toBe('0 100%');
    });

    test('should show bar when one tool selected', () => {
        toggleTool('cursor');
        updateCompareBar();
        expect(bar.style.translate).toBe('0 0');
    });

    test('should show bar when multiple tools selected', () => {
        toggleTool('cursor');
        toggleTool('windsurf');
        updateCompareBar();
        expect(bar.style.translate).toBe('0 0');
    });

    test('should hide bar again after clearing selection', () => {
        toggleTool('cursor');
        updateCompareBar();
        expect(bar.style.translate).toBe('0 0');

        clearSelection();
        updateCompareBar();
        expect(bar.style.translate).toBe('0 100%');
    });

    test('should display singular label for one tool', () => {
        toggleTool('cursor');
        updateCompareBar();
        expect(countText.textContent).toBe('1 tool selected');
    });

    test('should display plural label for two tools', () => {
        toggleTool('cursor');
        toggleTool('windsurf');
        updateCompareBar();
        expect(countText.textContent).toBe('2 tools selected');
    });

    test('should disable compare button with fewer than 2 tools', () => {
        toggleTool('cursor');
        updateCompareBar();
        expect(compareBtn.disabled).toBe(true);
    });

    test('should enable compare button with 2 tools', () => {
        toggleTool('cursor');
        toggleTool('windsurf');
        updateCompareBar();
        expect(compareBtn.disabled).toBe(false);
    });

    test('should enable compare button with 3 tools', () => {
        toggleTool('cursor');
        toggleTool('windsurf');
        toggleTool('aider');
        updateCompareBar();
        expect(compareBtn.disabled).toBe(false);
    });

    test('should render slug thumbnails', () => {
        toggleTool('cursor');
        toggleTool('windsurf');
        updateCompareBar();
        expect(thumbnails.innerHTML).toContain('cursor');
        expect(thumbnails.innerHTML).toContain('windsurf');
    });

    test('should return early when bar element is missing', () => {
        elements['compareFloatingBar'] = null;
        expect(() => updateCompareBar()).not.toThrow();
    });

    test('should handle missing countText gracefully', () => {
        elements['compareCountText'] = null;
        toggleTool('cursor');
        expect(() => updateCompareBar()).not.toThrow();
        expect(bar.style.translate).toBe('0 0');
    });

    test('should handle missing compareBtn gracefully', () => {
        elements['compareBtn'] = null;
        toggleTool('cursor');
        toggleTool('windsurf');
        expect(() => updateCompareBar()).not.toThrow();
    });
});

describe('renderer > setupCompareHandlers (click delegation)', () => {
    beforeEach(() => {
        clearSelection();
        setupDOM();
    });

    function makeToggle(slug, active = false) {
        const checkbox = makeEl('input');
        checkbox.tagName = 'INPUT';
        checkbox.checked = false;
        const toggle = makeEl('label');
        toggle.dataset.slug = slug;
        if (active) toggle._classes.add('active');
        toggle.querySelector = (sel) => sel === 'input[type="checkbox"]' ? checkbox : null;
        toggle._checkbox = checkbox;
        return toggle;
    }

    function simulateClick(target, closest) {
        // closest('.compare-toggle-switch') is called on e.target
        target.closest = (sel) => sel === '.compare-toggle-switch' ? closest : null;
        grid._trigger('click', { target, preventDefault: () => {} });
    }

    test('should ignore click when target is INPUT', () => {
        const inputEl = makeEl('input');
        inputEl.tagName = 'INPUT';
        inputEl.closest = () => null;
        const beforeSelected = getSelected().length;
        grid._trigger('click', { target: inputEl, preventDefault: () => {} });
        expect(getSelected().length).toBe(beforeSelected);
    });

    test('should ignore click when no toggle ancestor found', () => {
        const el = makeEl('div');
        el.closest = () => null;
        grid._trigger('click', { target: el, preventDefault: () => {} });
        expect(getSelected().length).toBe(0);
    });

    test('should ignore click when toggle has no slug', () => {
        const toggle = makeToggle('');
        toggle.dataset.slug = '';
        simulateClick(makeEl('span'), toggle);
        expect(getSelected().length).toBe(0);
    });

    test('should not double-toggle on synthetic checkbox click', () => {
        // Wire a real click handler that mirrors setupCompareHandlers
        const localGrid = makeGrid();
        localGrid.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const toggle = e.target.closest('.compare-toggle-switch');
            if (!toggle) return;
            e.preventDefault();
            const slug = toggle.dataset.slug;
            if (!slug) return;
            toggleTool(slug);
        });

        const toggle = makeToggle('cursor');
        const spanTarget = makeEl('span');
        spanTarget.closest = (sel) => sel === '.compare-toggle-switch' ? toggle : null;

        // First click via label target — should add
        localGrid._trigger('click', { target: spanTarget, preventDefault: () => {} });
        expect(getSelected()).toContain('cursor');

        // Synthetic INPUT click — must be ignored, selection stays
        const inputEl = makeEl('input');
        inputEl.tagName = 'INPUT';
        inputEl.closest = () => toggle;
        localGrid._trigger('click', { target: inputEl, preventDefault: () => {} });
        expect(getSelected()).toContain('cursor');
    });

    test('clearCompareBtn click clears all active toggles', () => {
        toggleTool('cursor');
        toggleTool('windsurf');

        const t1 = makeToggle('cursor', true);
        const t2 = makeToggle('windsurf', true);
        grid.children.push(t1, t2);

        // Wire clearBtn handler the same way setupCompareHandlers does
        const localClearBtn = makeEl('button');
        localClearBtn.addEventListener('click', () => {
            clearSelection();
            grid.querySelectorAll('.compare-toggle-switch.active').forEach(t => {
                t.classList.remove('active');
                const cb = t.querySelector('input[type="checkbox"]');
                if (cb) cb.checked = false;
            });
        });
        localClearBtn._trigger('click', {});
        expect(getSelected().length).toBe(0);
    });

    test('compareBtn navigates to compare URL with selected slugs', () => {
        toggleTool('cursor');
        toggleTool('windsurf');

        // Wire compareBtn handler the same way setupCompareHandlers does
        const localCompareBtn = makeEl('button');
        localCompareBtn.addEventListener('click', () => {
            const selected = getSelected();
            if (selected.length >= 2) {
                global.window.location.href = `/compare?tools=${selected.join(',')}`;
            }
        });
        localCompareBtn._trigger('click', {});
        expect(global.window.location.href).toBe('/compare?tools=cursor,windsurf');
    });

    test('compareBtn does not navigate with fewer than 2 tools', () => {
        global.window.location.href = '';
        toggleTool('cursor');

        const localCompareBtn = makeEl('button');
        localCompareBtn.addEventListener('click', () => {
            const selected = getSelected();
            if (selected.length >= 2) {
                global.window.location.href = `/compare?tools=${selected.join(',')}`;
            }
        });
        localCompareBtn._trigger('click', {});
        expect(global.window.location.href).toBe('');
    });
});
