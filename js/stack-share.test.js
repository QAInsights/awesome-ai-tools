import { afterEach, describe, expect, mock, test } from 'bun:test';
import { jsonResponse, makeElement, makeRoot } from './stack-test-helpers.js';
import { handleCopySnippet, handleForkStack, initializeStackShare } from './stack-share.js';

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

describe('stack-share', () => {
    test('prompts sign-in when unauthenticated user clicks Fork stack', async () => {
        const button = makeElement();
        button.dataset = { stackUsername: 'ada', stackSlug: 'my-tools' };
        button.textContent = 'Fork stack';
        const attribution = { open: mock(() => {}) };
        const authManager = {
            initialize: async () => {},
            isAuthenticated: () => false,
            signOut: async () => {},
        };

        const res = await handleForkStack(button, { authManager, attribution });
        expect(res.status).toBe('unauthenticated');
        expect(attribution.open).toHaveBeenCalledWith('stack_add');
    });

    test('forks stack and navigates to editor when authenticated', async () => {
        const button = makeElement();
        button.dataset = { stackUsername: 'ada', stackSlug: 'my-tools' };
        button.textContent = 'Fork stack';
        let navigatedTo = '';
        global.fetch = async (url, options) => {
            expect(url).toBe('/api/stacks/fork');
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body)).toEqual({ username: 'ada', slug: 'my-tools' });
            return jsonResponse({ editorUrl: '/stacks/edit?id=forked-123' }, 201);
        };

        const authManager = {
            initialize: async () => {},
            isAuthenticated: () => true,
            signOut: async () => {},
        };
        const res = await handleForkStack(button, {
            authManager,
            attribution: { open: () => {} },
            navigate: url => { navigatedTo = url; },
        });
        expect(res).toEqual({ status: 'forked', editorUrl: '/stacks/edit?id=forked-123' });
        expect(navigatedTo).toBe('/stacks/edit?id=forked-123');
    });

    test('copies embed snippet text via data-copy-target', async () => {
        const codeEl = makeElement();
        codeEl.textContent = '[![Stack](https://ai.dosa.dev/u/ada/my-tools.svg)](https://ai.dosa.dev/u/ada/my-tools?ref=badge)';
        const root = makeRoot({ stackBadgeMd: codeEl });
        const copyBtn = makeElement();
        copyBtn.dataset = { copyTarget: 'stackBadgeMd' };
        copyBtn.textContent = 'Copy Markdown';

        let copied = '';
        const origNavigator = global.navigator;
        global.navigator = {
            clipboard: {
                writeText: async text => { copied = text; },
            },
        };
        try {
            const ok = await handleCopySnippet(copyBtn, root);
            expect(ok).toBe(true);
            expect(copied).toContain('/u/ada/my-tools.svg');
            expect(copyBtn.textContent).toBe('Copied');
        } finally {
            global.navigator = origNavigator;
        }
    });

    test('initializeStackShare delegates click events on root', async () => {
        const root = makeRoot({});
        const attribution = { open: mock(() => {}) };
        const authManager = {
            initialize: async () => {},
            isAuthenticated: () => false,
            signOut: async () => {},
        };
        const forkBtn = makeElement();
        forkBtn.dataset = { stackUsername: 'ada', stackSlug: 'my-tools' };

        initializeStackShare({ authManager, attribution, root });
        const handler = root.listeners.get('click');
        handler({
            target: { closest: selector => selector === '[data-fork-stack]' ? forkBtn : null },
            preventDefault() {},
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(attribution.open).toHaveBeenCalledWith('stack_add');
    });
});
