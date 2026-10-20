import { describe, expect, test } from 'bun:test';
import { AD_FREE_STORAGE_KEY } from '../src/lib/ethical-ads.ts';
import {
    BROWSE_GATE_COOLDOWN_MS,
    BROWSE_GATE_NUDGE_KEY,
    BROWSE_GATE_ROW_LIMIT,
    initBrowseGate,
    isDefaultDirectoryView,
    shouldGateDirectory,
    shouldShowGateNudge,
} from './browse-gate.js';

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        data,
    };
}

function fakeClassList(node) {
    const set = new Set();
    return {
        add: (...names) => names.forEach(name => set.add(name)),
        remove: (...names) => names.forEach(name => set.delete(name)),
        contains: name => set.has(name),
        toggle: name => (set.has(name) ? (set.delete(name), false) : (set.add(name), true)),
        _set: set,
    };
}

function fakeNode(tag, doc) {
    const listeners = {};
    const node = {
        tagName: tag.toUpperCase(),
        textContent: '',
        dataset: {},
        attributes: {},
        children: [],
        parent: null,
        get parentNode() { return this.parent; },
        type: '',
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
        click() { (listeners.click ?? []).forEach(fn => fn({})); },
        appendChild(child) {
            if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child);
            child.parent = this;
            this.children.push(child);
            return child;
        },
        insertBefore(child, ref) {
            if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child);
            child.parent = this;
            const idx = this.children.indexOf(ref);
            if (idx === -1) this.children.push(child);
            else this.children.splice(idx, 0, child);
            return child;
        },
        get nextElementSibling() {
            if (!this.parent) return null;
            const idx = this.parent.children.indexOf(this);
            return idx === -1 ? null : (this.parent.children[idx + 1] ?? null);
        },
        append(...nodes) { nodes.forEach(child => this.appendChild(child)); },
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
            doc.removed.push(this);
        },
        querySelectorAll(selector) {
            const all = n => [n, ...n.children.flatMap(all)];
            return all(this).filter(c => selector === '[data-compare-row]' && 'data-compare-row' in c.attributes);
        },
    };
    node.classList = fakeClassList(node);
    Object.defineProperty(node, 'className', {
        get() { return [...node.classList._set].join(' '); },
        set(value) {
            node.classList = fakeClassList(node);
            String(value).split(/\s+/).filter(Boolean).forEach(name => node.classList.add(name));
        },
    });
    return node;
}

function fakeDocument() {
    const doc = { removed: [], listeners: {} };
    doc.createElement = tag => fakeNode(tag, doc);
    doc.body = fakeNode('body', doc);
    doc.documentElement = fakeNode('html', doc);
    const all = node => [node, ...node.children.flatMap(all)];
    doc.querySelectorAll = selector => {
        if (selector === CARD_SEL) return all(doc.body).filter(node => CARD_ATTR in node.attributes);
        if (selector === NUDGE_SEL) return all(doc.body).filter(node => NUDGE_ATTR in node.attributes);
        if (selector === '[data-ad-prompt]') return all(doc.body).filter(node => 'data-ad-prompt' in node.attributes);
        if (selector === '.registry') return doc.grid ? [doc.grid] : [];
        if (selector === '[data-compare-row]') return doc.grid?.children.filter(c => 'data-compare-row' in c.attributes) ?? [];
        return [];
    };
    doc.querySelector = selector => doc.querySelectorAll(selector)[0] ?? null;
    doc.getElementById = id => {
        if (id === 'toolGrid') return doc.grid;
        if (id === 'tools-data') return doc.toolsDataEl ?? null;
        if (id === 'signInModal') return doc.signInModal ?? null;
        return null;
    };
    doc.addEventListener = (type, fn) => { (doc.listeners[type] ??= []).push(fn); };
    doc.dispatch = (type, detail) => (doc.listeners[type] ?? []).forEach(fn => fn({ detail }));
    return doc;
}

const CARD_ATTR = 'data-browse-gate-card';
const NUDGE_ATTR = 'data-browse-gate-nudge';
const CARD_SEL = '[data-browse-gate-card]';
const NUDGE_SEL = '[data-browse-gate-nudge]';

function fakeWindow(search = '') {
    return { location: { search }, innerWidth: 1440 };
}

function fakeModal(doc, open = false) {
    const modal = fakeNode('div', doc);
    if (!open) modal.classList.add('hidden');
    doc.signInModal = modal;
    doc.body.appendChild(modal);
    return modal;
}

function fakeSession(user) {
    let current = { event: 'initial', user, error: null };
    const listeners = new Set();
    return {
        current: () => current,
        ready: Promise.resolve(current),
        subscribe(fn) { listeners.add(fn); fn(current); },
        publish(next) { current = next; listeners.forEach(fn => fn(next)); },
    };
}

function makeGrid(doc, rows = 40) {
    const grid = fakeNode('div', doc);
    for (let i = 0; i < rows; i++) {
        const row = doc.createElement('div');
        row.setAttribute('data-compare-row', 'true');
        grid.appendChild(row);
    }
    doc.grid = grid;
    doc.body.appendChild(grid);
    return grid;
}

function setup({ user = null, storage = memoryStorage(), search = '', rows = 40, lastNudgeAt = '' } = {}) {
    const doc = fakeDocument();
    const grid = makeGrid(doc, rows);
    doc.documentElement.dataset.browseGate = 'locked';
    const events = [];
    const session = fakeSession(user);
    const observed = [];
    const opens = [];
    if (lastNudgeAt) storage.setItem(BROWSE_GATE_NUDGE_KEY, lastNudgeAt);
    const win = fakeWindow(search);
    initBrowseGate({
        win,
        doc,
        storage,
        tracker: { track: (event, fields) => events.push([event, fields?.trigger]) },
        attribution: { open: trigger => opens.push(trigger) },
        bindSession: async () => session,
        observe: (target, onVisible) => { observed.push({ target, onVisible }); return () => {}; },
        watchGrid: () => () => {},
        now: () => 5 * BROWSE_GATE_COOLDOWN_MS,
    });
    return { doc, grid, events, session, observed, opens, storage, win };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('isDefaultDirectoryView', () => {
    test('only the pristine list counts as default', () => {
        expect(isDefaultDirectoryView({ query: '', category: null })).toBe(true);
        expect(isDefaultDirectoryView({ query: '  ', category: 'all' })).toBe(true);
        expect(isDefaultDirectoryView({ query: 'cursor', category: null })).toBe(false);
        expect(isDefaultDirectoryView({ query: '', category: 'AI IDEs' })).toBe(false);
    });
});

describe('shouldGateDirectory', () => {
    test('gates only signed-out visitors on the default view', () => {
        expect(shouldGateDirectory({ signedIn: false, defaultView: true })).toBe(true);
        expect(shouldGateDirectory({ signedIn: true, defaultView: true })).toBe(false);
        expect(shouldGateDirectory({ signedIn: false, defaultView: false })).toBe(false);
    });
});

describe('shouldShowGateNudge', () => {
    const now = 10 * BROWSE_GATE_COOLDOWN_MS;
    test('never nudges members; once per cooldown for visitors', () => {
        expect(shouldShowGateNudge({ signedIn: true, lastShownAt: '', now })).toBe(false);
        expect(shouldShowGateNudge({ signedIn: false, lastShownAt: '', now })).toBe(true);
        expect(shouldShowGateNudge({ signedIn: false, lastShownAt: String(now - 1000), now })).toBe(false);
        expect(shouldShowGateNudge({ signedIn: false, lastShownAt: String(now - BROWSE_GATE_COOLDOWN_MS), now })).toBe(true);
    });
});

describe('initBrowseGate', () => {
    test('gates the default view for visitors: class, wall card, no flash attr', async () => {
        const { doc, grid, observed } = setup();
        await flush();
        expect(grid.classList.contains('browse-gated')).toBe(true);
        expect(doc.querySelector(CARD_SEL)).not.toBeNull();
        expect(doc.documentElement.dataset.browseGate).toBeUndefined();
        expect(observed).toHaveLength(1);
    });

    test('the wall card interleaves after the 20th row', async () => {
        const { doc, grid } = setup();
        await flush();
        const card = doc.querySelector(CARD_SEL);
        const rows = grid.children.filter(child => 'data-compare-row' in child.attributes);
        expect(grid.children[20]).toBe(card);
        expect(card.nextElementSibling).toBe(rows[20]);
        expect(rows).toHaveLength(40);
    });

    test('wall visible tracks gate_blocked once and shows the nudge', async () => {
        const { doc, events, observed, storage } = setup();
        await flush();
        observed[0].onVisible();
        observed[0].onVisible();

        expect(events.filter(([e]) => e === 'gate_blocked')).toHaveLength(1);
        expect(events).toContainEqual(['gate_blocked', 'browse_gate']);
        expect(events).toContainEqual(['browse_gate_shown', 'nudge']);
        expect(doc.querySelector(NUDGE_SEL)).not.toBeNull();
        expect(storage.getItem(BROWSE_GATE_NUDGE_KEY)).toBe(String(5 * BROWSE_GATE_COOLDOWN_MS));
    });

    test('nudge dismiss tracks the event and respects the cooldown', async () => {
        const { doc, events, observed } = setup();
        await flush();
        observed[0].onVisible();

        const flat = node => [node, ...node.children.flatMap(flat)];
        const nodes = flat(doc.querySelector(NUDGE_SEL));
        nodes.find(n => n.tagName === 'BUTTON' && n.textContent === 'Not now').click();

        expect(doc.querySelector(NUDGE_SEL)).toBeNull();
        expect(events.at(-1)).toEqual(['browse_gate_dismissed', 'nudge']);
    });

    test('recent nudge does not reappear within the cooldown', async () => {
        const { doc, observed } = setup({ lastNudgeAt: String(5 * BROWSE_GATE_COOLDOWN_MS - 1000) });
        await flush();
        observed[0].onVisible();
        expect(doc.querySelector(NUDGE_SEL)).toBeNull();
    });

    test('members are never gated even when the hint attr is present', async () => {
        const { doc, grid } = setup({ user: { id: 'u1' } });
        await flush();
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();
    });

    test('a member hint skips gating before the session resolves', async () => {
        const storage = memoryStorage({ [AD_FREE_STORAGE_KEY]: '1' });
        const { doc, grid } = setup({ storage });
        // Pre-resolution: nothing gates, so members never see a flash.
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();
        // A stale hint self-corrects: the session says visitor, so the
        // wall goes up as soon as it resolves.
        await flush();
        expect(grid.classList.contains('browse-gated')).toBe(true);
        expect(doc.querySelector(CARD_SEL)).not.toBeNull();
    });

    test('?q= deep links are never gated', async () => {
        const { doc, grid } = setup({ search: '?q=cursor' });
        await flush();
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();
    });

    test('filtering lifts the gate; returning to default re-applies it', async () => {
        const { doc, grid } = setup();
        await flush();

        doc.dispatch('directory:filtered', { query: 'cursor', category: null });
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();

        // Grid rebuilt by renderTools() (innerHTML = ''): children detach.
        grid.children.forEach(child => { child.parent = null; });
        grid.children = [];
        doc.dispatch('directory:filtered', { query: '', category: null });
        expect(grid.classList.contains('browse-gated')).toBe(true);
        expect(doc.querySelector(CARD_SEL)).not.toBeNull();
        expect(doc.querySelector(CARD_SEL).parent).toBe(grid);
    });

    test('category-filtered views stay open for visitors', async () => {
        const { doc, grid } = setup();
        await flush();
        doc.dispatch('directory:filtered', { query: '', category: 'AI IDEs' });
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();
    });

    test('signing in lifts the wall live', async () => {
        const { doc, grid, session } = setup();
        await flush();
        expect(grid.classList.contains('browse-gated')).toBe(true);

        session.publish({ event: 'signin', user: { id: 'u1' }, error: null });
        expect(grid.classList.contains('browse-gated')).toBe(false);
        expect(doc.querySelector(CARD_SEL)).toBeNull();
        expect(doc.querySelector(NUDGE_SEL)).toBeNull();
    });

    test('both CTAs open the sign-in modal with browse_gate attribution', async () => {
        const { doc, win, observed, opens } = setup();
        await flush();
        const flat = node => [node, ...node.children.flatMap(flat)];
        flat(doc.querySelector(CARD_SEL)).find(n => n.tagName === 'BUTTON').click();
        observed[0].onVisible();
        flat(doc.querySelector(NUDGE_SEL)).filter(n => n.tagName === 'BUTTON').at(-1).click();
        expect(opens).toEqual(['browse_gate', 'browse_gate']);
        // No modal element in this harness: both clicks fall back to the
        // ?signin=1 deep link (early-click safety).
        expect(win.location.href).toBe('/?signin=1');
    });

    test('no deep-link fallback when the sign-in modal opens', async () => {
        const { doc, win, opens } = setup();
        fakeModal(doc, false);
        await flush();
        const flat = node => [node, ...node.children.flatMap(flat)];
        // Simulate the bound header listener: the click handler opened the modal.
        doc.signInModal.classList.remove('hidden');
        flat(doc.querySelector(CARD_SEL)).find(n => n.tagName === 'BUTTON').click();
        expect(opens).toEqual(['browse_gate']);
        expect(win.location.href).toBeUndefined();
    });

    test('an open ad prompt suppresses the nudge (one floating card max)', async () => {
        const { doc, observed } = setup();
        await flush();
        const adPrompt = doc.createElement('aside');
        adPrompt.setAttribute('data-ad-prompt', 'stickybox');
        doc.body.appendChild(adPrompt);
        observed[0].onVisible();
        expect(doc.querySelector(NUDGE_SEL)).toBeNull();
    });
});
