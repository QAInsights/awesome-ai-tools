import { describe, expect, test } from 'bun:test';
import { initOneTap, shouldOfferOneTap } from './one-tap.js';

function setup({ search = '', pathname = '/', signedIn = false, modalHidden = true } = {}) {
    const calls = { bind: 0, prompt: 0 };
    const modal = { classList: { contains: name => name === 'hidden' && modalHidden } };
    return {
        calls,
        options: {
            doc: { getElementById: id => (id === 'signInModal' ? modal : null) },
            loc: { pathname, search },
            bind: async () => { calls.bind += 1; },
            authManager: {
                isAuthenticated: () => signedIn,
                showOneTap: () => { calls.prompt += 1; return true; },
            },
        },
    };
}

describe('Google One Tap eligibility', () => {
    test('offers One Tap to signed-out visitors on public pages', () => {
        expect(shouldOfferOneTap({ pathname: '/' })).toBe(true);
        expect(shouldOfferOneTap({ pathname: '/blog/some-post' })).toBe(true);
        expect(shouldOfferOneTap({ pathname: '/settings-guide' })).toBe(true);
    });

    test('skips signed-in visitors, an open or requested modal, and account pages', () => {
        expect(shouldOfferOneTap({ pathname: '/', signedIn: true })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/', modalOpen: true })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/', signInRequested: true })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/admin/funnel' })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/settings' })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/unsubscribe' })).toBe(false);
    });
});

describe('initOneTap', () => {
    test('prompts after the shared auth session is bound', async () => {
        const { calls, options } = setup({ pathname: '/blog/some-post' });
        expect(await initOneTap(options)).toBe(true);
        expect(calls).toEqual({ bind: 1, prompt: 1 });
    });

    test('leaves the deep-linked sign-in modal alone', async () => {
        const { calls, options } = setup({ search: '?signin=1' });
        expect(await initOneTap(options)).toBe(false);
        expect(calls.prompt).toBe(0);
    });

    test('does not prompt signed-in visitors or over an open modal', async () => {
        for (const state of [{ signedIn: true }, { modalHidden: false }]) {
            const { calls, options } = setup(state);
            expect(await initOneTap(options)).toBe(false);
            expect(calls.prompt).toBe(0);
        }
    });
});
