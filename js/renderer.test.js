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

function makeToggle(slug, active = false) {
    const checkbox = makeEl('input');
    checkbox.checked = active;

    const toggle = makeEl('label');
    toggle.dataset.slug = slug;
    if (active) {
        toggle.classList.add('active');
    }
    toggle.querySelector = (selector) => selector === 'input[type="checkbox"]' ? checkbox : null;
    toggle._checkbox = checkbox;

    return toggle;
}

function makeGrid() {
    const listeners = {};
    const state = {
        activeToggles: [],
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
            if (selector === '.compare-toggle-switch.active') return state.activeToggles;
            if (selector === '.zap-btn[data-tool-id]') return state.zapButtons;
            return [];
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

        const toggle = makeToggle('cursor');
        const target = makeEl('span');
        target.closest = (selector) => selector === '.compare-toggle-switch' ? toggle : null;

        grid._trigger('click', {
            target,
            preventDefault: () => {}
        });

        expect(getSelected()).toEqual(['cursor']);
        expect(toggle.classList.contains('active')).toBe(true);
        expect(toggle._checkbox.checked).toBe(true);
        expect(bar.style.translate).toBe('0 0');
        expect(countText.textContent).toBe('1 tool selected');
        expect(thumbnails.innerHTML).toContain('cursor');
        expect(compareBtn.disabled).toBe(true);
    });

    test('clear button removes active selections through the renderer handler', async () => {
        ({ initRenderer, refreshVotingButtons, setVotingContext } = await import(`./renderer.js?test=${Date.now()}`));
        initRenderer(grid);

        const cursorToggle = makeToggle('cursor', true);
        const windsurfToggle = makeToggle('windsurf', true);
        grid._state.activeToggles = [cursorToggle, windsurfToggle];

        toggleTool('cursor');
        toggleTool('windsurf');

        clearBtn._trigger('click');

        expect(getSelected()).toEqual([]);
        expect(cursorToggle.classList.contains('active')).toBe(false);
        expect(windsurfToggle.classList.contains('active')).toBe(false);
        expect(cursorToggle._checkbox.checked).toBe(false);
        expect(windsurfToggle._checkbox.checked).toBe(false);
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
