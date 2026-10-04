import { afterEach, describe, expect, test } from 'bun:test';
import { jsonResponse, makeElement, makeRoot } from './stack-test-helpers.js';

const originalFetch = global.fetch;
let moduleId = 0;

const xss = '<img src=x onerror=alert(1)>';

function createEditor(stack, username = 'test-user') {
    const elements = {
        'stack-tools-data': {
            textContent: JSON.stringify([
                { slug: 'cursor', name: xss, company: 'Vendor', category: 'AI IDEs' },
                { slug: 'zed', name: 'Zed', company: 'Zed', category: 'Editors' },
            ]),
        },
        editorLoading: makeElement(),
        editorSignedOut: makeElement(['hidden']),
        editorMissing: makeElement(['hidden']),
        editorError: makeElement(['hidden']),
        stackEditor: makeElement(['hidden']),
        editorHeading: makeElement(),
        stackTitle: makeElement(),
        stackSlug: makeElement(),
        stackDescription: makeElement(),
        publicUrlPreview: makeElement(),
        sharingToggle: makeElement(),
        sharingStatus: makeElement(),
        copyStackLink: makeElement(['hidden']),
        usernamePicker: makeElement(['hidden']),
        usernameInput: makeElement(),
        usernamePickerStatus: makeElement(),
        enableSharingButton: makeElement(),
        cancelUsernameButton: makeElement(),
        toolSearch: makeElement(),
        toolSearchResults: makeElement(),
        stackItems: makeElement(),
        stackItemsEmpty: makeElement(['hidden']),
        saveStackButton: makeElement(),
        deleteStackButton: makeElement(),
        stackSaveStatus: makeElement(),
    };
    elements.sharingToggle.queries = { span: makeElement() };
    elements.usernameInput.focus = () => {};
    const root = makeRoot(elements);
    const authManager = {
        initialize: async () => {},
        isAuthenticated: () => true,
        getCurrentUser: () => ({ id: 'github:user-1' }),
        onAuthChange: () => {},
    };
    const requests = [];
    global.fetch = async (url, options) => {
        requests.push({ url, options });
        if (url === '/api/account/username') {
            return jsonResponse({ username, suggestion: 'suggested-name' });
        }
        if (url === '/api/stacks/stack-1') {
            if (options?.method === 'PATCH') {
                return jsonResponse({ stack: { ...stack, ...JSON.parse(options.body) }, username });
            }
            return jsonResponse({ stack });
        }
        if (url === '/api/stacks/stack-1/items') return jsonResponse({ stack });
        return jsonResponse({ error: 'Unexpected request' }, 500);
    };
    return { authManager, elements, requests, root };
}

function fixtureStack(overrides = {}) {
    return {
        id: 'stack-1',
        slug: 'my-stack',
        title: `Stack ${xss}`,
        description: '',
        isPublic: false,
        items: [
            { slug: 'cursor', position: 0, purpose: xss, usageNotes: xss, enabled: true },
            { slug: 'zed', position: 1, purpose: 'Review', usageNotes: null, enabled: true },
        ],
        ...overrides,
    };
}

afterEach(() => {
    global.fetch = originalFetch;
    delete global.document;
    delete global.location;
});

describe('stack editor', () => {
    test('renders user text as text and supports item reordering and visibility toggles', async () => {
        const stack = fixtureStack();
        const { authManager, elements, requests, root } = createEditor(stack);
        global.document = { addEventListener: () => {} };
        global.location = { search: '?id=stack-1', origin: 'https://ai.dosa.dev' };
        const { initializeStackEditor } = await import(`./stack-editor.js?test=${++moduleId}`);

        await initializeStackEditor({ authManager, root });

        expect(elements.stackEditor.classList.contains('hidden')).toBe(false);
        expect(elements.stackTitle.value).toBe(stack.title);
        expect(elements.publicUrlPreview.textContent).toBe('ai.dosa.dev/u/test-user/my-stack');
        expect(elements.stackItems.children[0].innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(elements.stackItems.children[0].innerHTML).not.toContain(xss);
        expect(elements.stackItems.children[0].innerHTML).toContain('value="&lt;img');
        expect(elements.stackItems.children[0].innerHTML).toContain('<textarea');

        const click = elements.stackItems.listeners.get('click');
        click({ target: { closest: () => ({ dataset: { action: 'down', index: '0' } }) } });
        expect(elements.stackItems.children[0].innerHTML).toContain('>Zed</a>');

        click({ target: { closest: () => ({ dataset: { action: 'enabled', index: '0' } }) } });
        expect(elements.stackItems.children[0].innerHTML).toContain('aria-checked="false"');
        expect(requests.map(request => request.url)).toEqual([
            '/api/stacks/stack-1',
            '/api/account/username',
        ]);
    });

    test('opens the username picker for first-time sharing and shows publish errors', async () => {
        const stack = fixtureStack();
        const { authManager, elements, root } = createEditor(stack, null);
        global.document = { addEventListener: () => {} };
        global.location = { search: '?id=stack-1', origin: 'https://ai.dosa.dev' };
        const { initializeStackEditor } = await import(`./stack-editor.js?test=${++moduleId}`);

        await initializeStackEditor({ authManager, root });
        elements.sharingToggle.listeners.get('click')();

        expect(elements.usernamePicker.classList.contains('hidden')).toBe(false);
        expect(elements.usernameInput.value).toBe('suggested-name');
        expect(elements.sharingToggle.getAttribute('aria-checked')).toBe('false');

        global.fetch = async (url, options) => {
            if (url === '/api/account/username') return jsonResponse({ username: 'test-user' });
            if (options?.method === 'PATCH') return jsonResponse({ error: 'username_required' }, 409);
            return jsonResponse({ stack });
        };
        elements.usernameInput.value = 'test-user';
        await elements.enableSharingButton.listeners.get('click')();
        expect(elements.usernamePickerStatus.textContent).toBe('username_required');
        expect(elements.enableSharingButton.disabled).toBe(false);

        global.fetch = async (url, options) => {
            if (url === '/api/account/username') return jsonResponse({ username: 'test-user' });
            if (options?.method === 'PATCH') return jsonResponse({ error: 'rate_limited' }, 429);
            return jsonResponse({ stack });
        };
        await elements.enableSharingButton.listeners.get('click')();
        expect(elements.usernamePickerStatus.textContent).toBe('Too many changes. Wait a minute and try again.');
    });

    test('shows stack loading errors', async () => {
        const { authManager, elements, root } = createEditor(fixtureStack());
        global.document = { addEventListener: () => {} };
        global.location = { search: '?id=stack-1', origin: 'https://ai.dosa.dev' };
        global.fetch = async () => jsonResponse({ error: 'unavailable' }, 503);
        const { initializeStackEditor } = await import(`./stack-editor.js?test=${++moduleId}`);

        await initializeStackEditor({ authManager, root });

        expect(elements.editorError.classList.contains('hidden')).toBe(false);
    });
});
