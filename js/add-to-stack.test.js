import { afterEach, describe, expect, mock, test } from 'bun:test';
import { jsonResponse, makeElement, makeRoot } from './stack-test-helpers.js';

const originalFetch = global.fetch;
let moduleId = 0;

function createSurface() {
    const list = makeElement();
    const result = makeElement();
    const newStackButton = makeElement();
    const popover = makeElement();
    popover.queries = {
        '[data-stack-list]': list,
        '[data-stack-result]': result,
        '[data-new-stack]': newStackButton,
    };
    popover.remove = () => { popover.removed = true; };
    popover.contains = target => target === popover || target === list || target === result || target === newStackButton;

    const wrapper = makeElement();
    wrapper.append = child => { wrapper.children.push(child); };
    const button = makeElement();
    button.dataset = {
        toolSlug: 'cursor',
        toolCategory: 'AI IDEs',
    };
    button.closest = () => wrapper;
    const root = makeRoot({});
    root.createElement = () => popover;
    const authManager = {
        initialize: async () => {},
        isAuthenticated: () => true,
        signOut: async () => {},
    };
    const attribution = { open: mock(() => {}) };
    return { attribution, authManager, button, list, newStackButton, popover, result, root, wrapper };
}

async function openPopover(surface, initializeAddToStack) {
    initializeAddToStack({
        authManager: surface.authManager,
        attribution: surface.attribution,
        root: surface.root,
    });
    const handler = surface.root.listeners.get('click');
    handler({
        target: { closest: selector => selector === '[data-add-to-stack]' ? surface.button : null },
        preventDefault() {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    global.fetch = originalFetch;
    delete global.document;
});

describe('add-to-stack popover', () => {
    test('renders escaped stack names and reports an existing item as already added', async () => {
        const surface = createSurface();
        const payload = '<img src=x onerror=alert(1)>';
        global.document = { addEventListener: () => {} };
        global.fetch = async (url, options) => {
            if (url === '/api/stacks') {
                return jsonResponse({
                    stacks: [{ id: 'stack-1', title: payload, itemCount: 1, isPublic: false }],
                });
            }
            if (url.endsWith('/items') && options?.method === 'POST') {
                return jsonResponse({ error: 'item_exists' }, 409);
            }
            return jsonResponse({ error: 'Unexpected request' }, 500);
        };
        const { initializeAddToStack } = await import(`./add-to-stack.js?test=${++moduleId}`);

        await openPopover(surface, initializeAddToStack);

        expect(surface.button.getAttribute('aria-expanded')).toBe('true');
        expect(surface.list.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(surface.list.innerHTML).not.toContain(payload);

        await surface.list.listeners.get('click')({
            target: { closest: () => ({ dataset: { stackId: 'stack-1' } }) },
        });

        expect(surface.result.innerHTML).toContain('Already in this stack.');
        expect(surface.result.innerHTML).toContain('/stacks/edit?id=stack-1');
    });

    test('offers sign-in when signed out and escapes load errors', async () => {
        const signedOut = createSurface();
        signedOut.authManager.isAuthenticated = () => false;
        global.document = { addEventListener: () => {} };
        let fetchCalls = 0;
        global.fetch = async () => { fetchCalls += 1; return jsonResponse({ stacks: [] }); };
        const { initializeAddToStack } = await import(`./add-to-stack.js?test=${++moduleId}`);

        await openPopover(signedOut, initializeAddToStack);
        expect(fetchCalls).toBe(0);
        expect(signedOut.attribution.open).toHaveBeenCalledWith('stack_add');

        const failedLoad = createSurface();
        global.document = { addEventListener: () => {} };
        global.fetch = async () => jsonResponse({ error: '<svg onload=alert(1)>' }, 503);
        const { initializeAddToStack: initializeFailure } = await import(`./add-to-stack.js?test=${++moduleId}`);

        await openPopover(failedLoad, initializeFailure);
        expect(failedLoad.list.innerHTML).toContain('&lt;svg onload=alert(1)&gt;');
        expect(failedLoad.list.innerHTML).not.toContain('<svg');
    });

    test('creates a new stack, appends the tool, and reports errors safely', async () => {
        const surface = createSurface();
        global.document = { addEventListener: () => {} };
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push({ url, options });
            if (url === '/api/stacks' && !options) return jsonResponse({ stacks: [] });
            if (url === '/api/stacks' && options?.method === 'POST') {
                return jsonResponse({ stack: { id: 'new-stack', title: 'My AI stack' } }, 201);
            }
            if (url.endsWith('/items')) return jsonResponse({ status: 'added' });
            return jsonResponse({ error: '<img src=x>' }, 500);
        };
        const { initializeAddToStack } = await import(`./add-to-stack.js?test=${++moduleId}`);

        await openPopover(surface, initializeAddToStack);
        await surface.newStackButton.listeners.get('click')();

        expect(calls.map(call => call.url)).toEqual([
            '/api/stacks',
            '/api/stacks',
            '/api/stacks/new-stack/items',
        ]);
        expect(surface.result.innerHTML).toContain('Added to your stack.');
        expect(surface.result.innerHTML).toContain('/stacks/edit?id=new-stack');
    });

    test('shows a friendly message when an item write is rate limited', async () => {
        const surface = createSurface();
        global.document = { addEventListener: () => {} };
        global.fetch = async (url, options) => {
            if (url === '/api/stacks') {
                return jsonResponse({
                    stacks: [{ id: 'stack-1', title: 'My stack', itemCount: 0, isPublic: false }],
                });
            }
            if (url.endsWith('/items') && options?.method === 'POST') {
                return jsonResponse({ error: 'rate_limited' }, 429);
            }
            return jsonResponse({ error: 'Unexpected request' }, 500);
        };
        const { initializeAddToStack } = await import(`./add-to-stack.js?test=${++moduleId}`);

        await openPopover(surface, initializeAddToStack);
        await surface.list.listeners.get('click')({
            target: { closest: () => ({ dataset: { stackId: 'stack-1' } }) },
        });

        expect(surface.result.innerHTML).toContain('Too many changes. Wait a minute and try again.');
    });
});
