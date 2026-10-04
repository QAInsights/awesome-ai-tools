import { afterEach, describe, expect, test } from 'bun:test';
import { jsonResponse, makeElement, makeRoot } from './stack-test-helpers.js';

const originalFetch = global.fetch;
let moduleId = 0;

function createPage() {
    const elements = {
        stacksLoading: makeElement(),
        stacksSignedOut: makeElement(['hidden']),
        stacksError: makeElement(['hidden']),
        stacksContent: makeElement(['hidden']),
        stacksEmpty: makeElement(['hidden']),
        stacksList: makeElement(['hidden']),
        stackCount: makeElement(['hidden']),
        newStackForm: makeElement(),
        newStackTitle: makeElement(),
        newStackDescription: makeElement(),
        createStackButton: makeElement(),
        newStackStatus: makeElement(),
    };
    const root = makeRoot(elements);
    const authManager = {
        initialize: async () => {},
        isAuthenticated: () => true,
        getCurrentUser: () => ({ id: 'github:user-1' }),
        onAuthChange: () => {},
    };
    return { authManager, elements, root };
}

afterEach(() => {
    global.fetch = originalFetch;
    delete global.document;
    delete global.window;
});

describe('stacks page', () => {
    test('renders stack cards with escaped user text and creates a stack', async () => {
        const payload = '<img src=x onerror=alert(1)>';
        const { authManager, elements, root } = createPage();
        global.document = { addEventListener: () => {} };
        global.window = { location: { href: '' } };
        const fetchCalls = [];
        global.fetch = async (url, options) => {
            fetchCalls.push({ url, options });
            if (!options) {
                return jsonResponse({
                    stacks: [{
                        id: 'stack-1',
                        title: payload,
                        slug: 'daily-stack',
                        description: payload,
                        isPublic: true,
                        itemCount: 2,
                        updatedAt: 1,
                        publicUrl: '/u/test-user/daily-stack',
                    }],
                });
            }
            return jsonResponse({ stack: { id: 'new-stack' } }, 201);
        };
        const { initializeStacksPage } = await import(`./stacks-page.js?test=${++moduleId}`);

        await initializeStacksPage({ authManager, root });

        const card = elements.stacksList.children[0];
        expect(elements.stacksList.classList.contains('hidden')).toBe(false);
        expect(elements.stackCount.textContent).toBe('1 stack');
        expect(card.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(card.innerHTML).not.toContain(payload);
        expect(card.innerHTML).toContain('Public');
        expect(card.innerHTML).toContain('Copy public link');

        elements.newStackTitle.value = 'My new stack';
        elements.newStackDescription.value = 'A short description';
        await elements.newStackForm.listeners.get('submit')({ preventDefault() {} });

        expect(fetchCalls[1].options.method).toBe('POST');
        expect(JSON.parse(fetchCalls[1].options.body)).toEqual({
            title: 'My new stack',
            description: 'A short description',
        });
        expect(global.window.location.href).toBe('/stacks/edit?id=new-stack');
    });

    test('shows the signed-out state without fetching', async () => {
        const { elements, root, authManager } = createPage();
        global.document = { addEventListener: () => {} };
        authManager.isAuthenticated = () => false;
        let fetchCalls = 0;
        global.fetch = async () => { fetchCalls += 1; return jsonResponse({ stacks: [] }); };
        const { initializeStacksPage } = await import(`./stacks-page.js?test=${++moduleId}`);

        await initializeStacksPage({ authManager, root });

        expect(elements.stacksSignedOut.classList.contains('hidden')).toBe(false);
        expect(fetchCalls).toBe(0);
    });

    test('shows load and create errors', async () => {
        const { authManager, elements, root } = createPage();
        global.document = { addEventListener: () => {} };
        global.window = { location: { href: '' } };
        let failLoad = true;
        global.fetch = async (_url, options) => {
            if (failLoad && !options) return jsonResponse({ error: 'Load failed' }, 503);
            if (!options) return jsonResponse({ stacks: [] });
            return jsonResponse({ error: 'stack_limit' }, 409);
        };
        const { initializeStacksPage } = await import(`./stacks-page.js?test=${++moduleId}`);

        await initializeStacksPage({ authManager, root });
        expect(elements.stacksError.classList.contains('hidden')).toBe(false);

        failLoad = false;
        await elements.newStackForm.listeners.get('submit')({ preventDefault() {} });

        expect(elements.newStackStatus.textContent).toBe('stack_limit');
        expect(elements.createStackButton.disabled).toBe(false);
    });
});
