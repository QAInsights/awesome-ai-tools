import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = global.fetch;
let moduleId = 0;

function jsonResponse(follows) {
    return new Response(JSON.stringify({ follows }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    global.fetch = originalFetch;
    delete global.document;
});

describe('follows UI', () => {
    test('never renders stale follows as active while signed out', async () => {
        let authenticated = true;
        const classes = new Set();
        const attributes = new Map();
        const button = {
            dataset: { toolSlug: 'cursor', toolName: 'Cursor' },
            classList: {
                toggle: (token, force) => force ? classes.add(token) : classes.delete(token),
            },
            querySelector: () => null,
            setAttribute: (name, value) => attributes.set(name, value),
            title: '',
        };
        global.document = {
            addEventListener: () => {},
            querySelectorAll: () => [button],
        };
        global.fetch = async () => jsonResponse([{ slug: 'cursor', createdAt: 20 }]);
        const follows = await import(`./follows.js?test=${++moduleId}`);
        follows.initFollows({ isAuthenticated: () => authenticated });
        await follows.loadFollows();
        expect(classes.has('followed')).toBe(true);

        authenticated = false;
        follows.refreshFollowButtons();

        expect(classes.has('followed')).toBe(false);
        expect(attributes.get('aria-pressed')).toBe('false');
    });
});
