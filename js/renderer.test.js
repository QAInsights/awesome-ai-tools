import { beforeEach, describe, expect, test } from 'bun:test';
import { clearSelection, getSelected, toggleTool } from './compare-state.js';

let initRenderer;
let refreshVotingButtons;
let setVotingContext;

function makeEl(tag = 'div') {
    const classes = new Set();
    const listeners = {};

    return {
        tagName: tag.toUpperCase(),
        dataset: {},
        style: {},
        disabled: false,
        textContent: '',
        innerHTML: '',
        classList: {
            add: (...tokens) => tokens.forEach(token => classes.add(token)),
            remove: (...tokens) => tokens.forEach(token => classes.delete(token)),
            toggle: (token, force) => {
                if (force === undefined) {
                    classes.has(token) ? classes.delete(token) : classes.add(token);
                    return;
                }
                force ? classes.add(token) : classes.delete(token);
            },
            contains: (token) => classes.has(token)
        },
        addEventListener: (event, handler) => {
            listeners[event] = handler;
        },
        _trigger: (event, payload = {}) => {
            listeners[event]?.(payload);
        }
    };
}

function makeCompareRow(slug, toolName = slug, active = false) {
    const checkbox = makeEl('input');
    checkbox.checked = active;

    const control = makeEl('label');
    control.dataset.slug = slug;
    if (active) {
        control.classList.add('active');
    }
    const row = makeEl('div');
    row.dataset.slug = slug;
    row.dataset.toolName = toolName;
    row.dataset.compareRow = 'true';
    row.querySelector = (selector) => {
        if (selector === 'input[type="checkbox"]') return checkbox;
        if (selector === '.compare-checkbox') return control;
        return null;
    };
    row.setAttribute = (name, value) => {
        row[name] = value;
    };

    control.closest = (selector) => selector === '.compare-checkbox' ? control : null;
    control.querySelector = (selector) => selector === 'input[type="checkbox"]' ? checkbox : null;
    control._checkbox = checkbox;
    row._checkbox = checkbox;
    row._control = control;

    return row;
}

function makeGrid() {
    const listeners = {};
    const state = {
        rows: [],
        zapButtons: []
    };

    return {
        addEventListener: (event, handler) => {
            listeners[event] = handler;
        },
        _trigger: (event, payload) => {
            listeners[event]?.(payload);
        },
        querySelectorAll: (selector) => {
            if (selector === '[data-compare-row]') return state.rows;
            if (selector === '.zap-btn[data-tool-id]') return state.zapButtons;
            return [];
        },
        querySelector: (selector) => {
            const slugMatch = selector.match(/\[data-slug="([^"]+)"\]/);
            if (selector.startsWith('[data-compare-row]') && slugMatch) {
                return state.rows.find((row) => row.dataset.slug === slugMatch[1]) ?? null;
            }
            return null;
        },
        _state: state
    };
}

describe('renderer', () => {
    let bar;
    let countText;
    let thumbnails;
    let compareBtn;
    let clearBtn;
    let grid;

    beforeEach(() => {
        clearSelection();
        process.env.ENABLE_VOTING = 'true';

        bar = makeEl('div');
        countText = makeEl('span');
        thumbnails = makeEl('div');
        compareBtn = makeEl('button');
        clearBtn = makeEl('button');
        grid = makeGrid();

        const elements = {
            compareFloatingBar: bar,
            compareCountText: countText,
            compareThumbnails: thumbnails,
            compareBtn,
            clearCompareBtn: clearBtn
        };

        global.document = {
            getElementById: (id) => elements[id] ?? null,
            querySelector: () => null
        };

        global.window = {
            location: { href: '' },
            innerWidth: 1280
        };
    });

    test('updates compare bar through the real delegated click handler', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        const row = makeCompareRow('cursor', 'Cursor');
        grid._state.rows = [row];
        const target = makeEl('span');
        target.closest = (selector) => {
            if (selector === '[data-compare-row]') return row;
            if (selector === 'a, button') return null;
            if (selector === '.compare-checkbox') return null;
            return null;
        };

        grid._trigger('click', {
            target,
            preventDefault: () => {}
        });

        expect(getSelected()).toEqual(['cursor']);
        expect(row.classList.contains('compare-row-selected')).toBe(true);
        expect(row._control.classList.contains('active')).toBe(true);
        expect(row._checkbox.checked).toBe(true);
        expect(bar.style.translate).toBe('0 0');
        expect(countText.textContent).toBe('1 of 3 selected');
        expect(thumbnails.innerHTML).toContain('Cursor');
        expect(compareBtn.disabled).toBe(true);
    });

    test('clear button removes active selections through the renderer handler', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        const cursorRow = makeCompareRow('cursor', 'Cursor', true);
        const windsurfRow = makeCompareRow('windsurf', 'Windsurf', true);
        grid._state.rows = [cursorRow, windsurfRow];

        toggleTool('cursor');
        toggleTool('windsurf');

        clearBtn._trigger('click');

        expect(getSelected()).toEqual([]);
        expect(cursorRow.classList.contains('compare-row-selected')).toBe(false);
        expect(windsurfRow.classList.contains('compare-row-selected')).toBe(false);
        expect(cursorRow._control.classList.contains('active')).toBe(false);
        expect(windsurfRow._control.classList.contains('active')).toBe(false);
        expect(cursorRow._checkbox.checked).toBe(false);
        expect(windsurfRow._checkbox.checked).toBe(false);
        expect(bar.style.translate).toBe('0 100%');
        expect(compareBtn.disabled).toBe(true);
    });

    test('compare button navigates using the selected slugs', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        toggleTool('cursor');
        toggleTool('windsurf');

        compareBtn._trigger('click');

        expect(window.location.href).toBe('/compare?tools=cursor,windsurf');
    });

    test('refreshVotingButtons re-renders vote buttons with live auth context', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        const voteButton = {
            dataset: {
                toolId: 'anysphere-cursor',
                toolName: 'Cursor'
            },
            outerHTML: ''
        };
        grid._state.zapButtons = [voteButton];

        setVotingContext({
            getVoteCount: () => 42,
            isAuthenticated: () => true
        });

        refreshVotingButtons();

        expect(voteButton.outerHTML).toContain('Zap this tool!');
        expect(voteButton.outerHTML).toContain('42');
        expect(voteButton.outerHTML).toContain('data-tool-id="anysphere-cursor"');
    });

    test('refreshVotingButtons falls back to signed-out state when auth is false', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        const voteButton = {
            dataset: {
                toolId: 'codeium-windsurf',
                toolName: 'Windsurf'
            },
            outerHTML: ''
        };
        grid._state.zapButtons = [voteButton];

        setVotingContext({
            getVoteCount: () => 7,
            isAuthenticated: () => false
        });

        refreshVotingButtons();

        expect(voteButton.outerHTML).toContain('Sign in to vote!');
        expect(voteButton.outerHTML).toContain('7');
        expect(voteButton.outerHTML).toContain('data-tool-name="Windsurf"');
    });
});
