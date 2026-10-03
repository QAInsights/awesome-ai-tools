import { describe, expect, test } from 'bun:test';
import { AD_CLOSED_EVENT, AD_FREE_STORAGE_KEY } from '../src/lib/ethical-ads.ts';
import { AD_PROMPT_COOLDOWN_MS, AD_PROMPT_STORAGE_KEY, initAdGate, shouldShowAdPrompt, syncAdFreeMember } from './ad-gate.js';

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        data,
    };
}

function fakeNode(tag, doc) {
    const listeners = {};
    const node = {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        dataset: {},
        attributes: {},
        children: [],
        parent: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
        click() { (listeners.click ?? []).forEach(fn => fn({})); },
        append(...nodes) { nodes.forEach(child => { child.parent = this; this.children.push(child); }); },
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
            doc.removed.push(this);
        },
    };
    return node;
}

function fakeDocument() {
    const doc = { removed: [] };
    doc.createElement = tag => fakeNode(tag, doc);
    doc.body = fakeNode('body', doc);
    const all = node => [node, ...node.children.flatMap(all)];
    const matches = (node, selector) => {
        if (selector === '.ea-slot') return node.className.split(' ').includes('ea-slot');
        if (selector === '[data-ad-prompt]') return 'data-ad-prompt' in node.attributes;
        return false;
    };
    doc.querySelectorAll = selector => all(doc.body).filter(node => matches(node, selector));
    doc.querySelector = selector => doc.querySelectorAll(selector)[0] ?? null;
    return doc;
}

function fakeWindow() {
    const listeners = {};
    return {
        addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
        async dispatch(type, detail) { await Promise.all((listeners[type] ?? []).map(fn => fn({ detail }))); },
    };
}

function fakeSession(user) {
    let current = { event: 'initial', user, error: null };
    const listeners = new Set();
    return {
        current: () => current,
        subscribe(fn) { listeners.add(fn); fn(current); },
        publish(next) { current = next; listeners.forEach(fn => fn(next)); },
    };
}

describe('shouldShowAdPrompt', () => {
    const now = 10 * AD_PROMPT_COOLDOWN_MS;
    test('never prompts signed-in members', () => {
        expect(shouldShowAdPrompt({ signedIn: true, lastShownAt: '', now })).toBe(false);
    });
    test('prompts signed-out visitors once per cooldown', () => {
        expect(shouldShowAdPrompt({ signedIn: false, lastShownAt: '', now })).toBe(true);
        expect(shouldShowAdPrompt({ signedIn: false, lastShownAt: 'garbage', now })).toBe(true);
        expect(shouldShowAdPrompt({ signedIn: false, lastShownAt: String(now - 1000), now })).toBe(false);
        expect(shouldShowAdPrompt({ signedIn: false, lastShownAt: String(now - AD_PROMPT_COOLDOWN_MS), now })).toBe(true);
    });
});

describe('syncAdFreeMember', () => {
    test('signed-in members get the ad-free flag and lose any ad on the page', () => {
        const storage = memoryStorage();
        const doc = fakeDocument();
        const slot = doc.createElement('div');
        slot.className = 'ea-slot dark flat';
        doc.body.append(slot);

        syncAdFreeMember({ id: 'u1' }, { storage, doc });

        expect(storage.getItem(AD_FREE_STORAGE_KEY)).toBe('1');
        expect(slot.dataset.eaRemoved).toBe('member');
        expect(doc.querySelectorAll('.ea-slot')).toHaveLength(0);
    });

    test('signing out clears the flag so ads return on the next page', () => {
        const storage = memoryStorage({ [AD_FREE_STORAGE_KEY]: '1' });
        syncAdFreeMember(null, { storage, doc: fakeDocument() });
        expect(storage.getItem(AD_FREE_STORAGE_KEY)).toBeNull();
    });
});

describe('initAdGate', () => {
    function setup(user, storage = memoryStorage()) {
        const win = fakeWindow();
        const doc = fakeDocument();
        const events = [];
        const session = fakeSession(user);
        initAdGate({
            win,
            doc,
            storage,
            tracker: { track: (event, fields) => events.push([event, fields.trigger]) },
            bindSession: async () => session,
            now: () => 5 * AD_PROMPT_COOLDOWN_MS,
        });
        return { win, doc, events, storage, session };
    }

    test('closing an ad as a visitor shows one sign-in prompt and records it', async () => {
        const { win, doc, events, storage } = setup(null);
        await win.dispatch(AD_CLOSED_EVENT, { style: 'stickybox' });

        const prompt = doc.querySelector('[data-ad-prompt]');
        expect(prompt?.getAttribute('data-ad-prompt')).toBe('stickybox');
        expect(storage.getItem(AD_PROMPT_STORAGE_KEY)).toBe(String(5 * AD_PROMPT_COOLDOWN_MS));
        expect(events).toEqual([['ad_closed', 'stickybox'], ['ad_prompt_shown', 'stickybox']]);
    });

    test('the prompt links to sign-in with ad_close attribution and can be dismissed', async () => {
        const { win, doc, events } = setup(null);
        await win.dispatch(AD_CLOSED_EVENT, { style: 'fixedfooter' });

        const prompt = doc.querySelector('[data-ad-prompt]');
        const flat = node => [node, ...node.children.flatMap(flat)];
        const nodes = flat(prompt);
        const cta = nodes.find(node => node.tagName === 'A');
        expect(cta.dataset.authTrigger).toBe('ad_close');

        nodes.find(node => node.tagName === 'BUTTON').click();
        expect(doc.querySelector('[data-ad-prompt]')).toBeNull();
        expect(events.at(-1)).toEqual(['ad_prompt_dismissed', 'fixedfooter']);
    });

    test('respects the cooldown and never prompts members', async () => {
        const recent = memoryStorage({ [AD_PROMPT_STORAGE_KEY]: String(5 * AD_PROMPT_COOLDOWN_MS - 60_000) });
        const cooled = setup(null, recent);
        await cooled.win.dispatch(AD_CLOSED_EVENT, { style: 'stickybox' });
        expect(cooled.doc.querySelector('[data-ad-prompt]')).toBeNull();

        const member = setup({ id: 'u1' });
        await member.win.dispatch(AD_CLOSED_EVENT, { style: 'stickybox' });
        expect(member.doc.querySelector('[data-ad-prompt]')).toBeNull();
        expect(member.events).toEqual([['ad_closed', 'stickybox']]);
    });

    test('signing in removes an open prompt', async () => {
        const { win, doc, session } = setup(null);
        await win.dispatch(AD_CLOSED_EVENT, { style: 'stickybox' });
        session.publish({ event: 'signin', user: { id: 'u1' }, error: null });
        expect(doc.querySelector('[data-ad-prompt]')).toBeNull();
    });
});
