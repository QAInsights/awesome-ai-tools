import { describe, expect, test } from 'bun:test';
import { createPostHogClient } from './posthog.js';

function createHarness(overrides = {}) {
    const state = { calls: [], idleCallbacks: [], loadCallbacks: [], sdkLoads: 0 };
    const posthog = {
        init(key, options) {
            state.calls.push(['init', key, options]);
            options.loaded(posthog);
        },
        capture(...args) { state.calls.push(['capture', ...args]); },
        identify(...args) { state.calls.push(['identify', ...args]); },
        reset(...args) { state.calls.push(['reset', ...args]); },
    };
    const client = createPostHogClient({
        hostname: 'ai.dosa.dev',
        key: 'phc-test',
        loadSdk: async () => {
            state.sdkLoads += 1;
            return { default: posthog };
        },
        windowLike: {
            document: { readyState: 'loading' },
            addEventListener(event, callback) {
                if (event === 'load') state.loadCallbacks.push(callback);
            },
        },
        scheduleIdle: callback => state.idleCallbacks.push(callback),
        ...overrides,
    });
    return { client, posthog, state };
}

async function loadClient({ client, state }) {
    client.initPostHog();
    for (const callback of state.loadCallbacks) callback();
    for (const callback of state.idleCallbacks) callback();
    await Promise.resolve();
}

describe('PostHog client', () => {
    test('is disabled on non-production hosts and with an empty key', () => {
        for (const hostname of ['localhost', 'preview.workers.dev', 'ai.dosa.dev']) {
            const state = { calls: [], sdkLoads: 0 };
            const posthog = {
                init() { state.calls.push('init'); },
                capture() { state.calls.push('capture'); },
                identify() { state.calls.push('identify'); },
                reset() { state.calls.push('reset'); },
            };
            const client = createPostHogClient({
                hostname,
                key: hostname === 'ai.dosa.dev' ? '' : 'phc-test',
                posthogInstance: posthog,
                loadSdk: async () => { state.sdkLoads += 1; return posthog; },
                windowLike: { document: { readyState: 'complete' }, addEventListener() {} },
                scheduleIdle: callback => callback(),
            });
            client.initPostHog();
            client.capture('event');
            client.identifyUser({ id: 'user-1', provider: 'github' });
            client.resetUser();
            expect(state.sdkLoads).toBe(0);
            expect(state.calls).toEqual([]);
        }
    });

    test('loads after the load event and replays queued calls in order', async () => {
        const harness = createHarness();
        const { client, state } = harness;
        client.capture('first', { value: 1 });
        client.identifyUser({ id: 'user-1', provider: 'github', email: 'private@example.com' });
        client.resetUser();
        expect(state.sdkLoads).toBe(0);

        await loadClient(harness);

        expect(state.sdkLoads).toBe(1);
        expect(state.calls.map(call => call[0])).toEqual(['init', 'capture', 'identify', 'reset']);
        expect(state.calls[1]).toEqual(['capture', 'first', { value: 1 }]);
        expect(state.calls[2]).toEqual(['identify', 'user-1', { provider: 'github' }]);
        expect(state.calls[3]).toEqual(['reset']);
        const [, key, options] = state.calls[0];
        expect(key).toBe('phc-test');
        expect(options).toMatchObject({
            api_host: '/ingest',
            ui_host: 'https://us.posthog.com',
            defaults: '2025-05-24',
            person_profiles: 'identified_only',
            respect_dnt: true,
            session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' },
            capture_exceptions: true,
        });
    });

    test('caps queued calls at 50 and keeps replay order', async () => {
        const harness = createHarness();
        for (let index = 0; index < 51; index += 1) harness.client.capture(`event-${index}`);

        await loadClient(harness);

        const captures = harness.state.calls.filter(call => call[0] === 'capture');
        expect(captures).toHaveLength(50);
        expect(captures[0][1]).toBe('event-1');
        expect(captures[49][1]).toBe('event-50');
    });

    test('identifies with only the user id and provider and resets the user', async () => {
        const harness = createHarness();
        harness.client.identifyUser({
            id: 'github:42',
            provider: 'github',
            email: 'private@example.com',
            name: 'Private Name',
            avatar: 'https://example.com/avatar.png',
            username: 'private-user',
        });
        harness.client.resetUser();

        await loadClient(harness);

        expect(harness.state.calls.filter(call => call[0] === 'identify')).toEqual([
            ['identify', 'github:42', { provider: 'github' }],
        ]);
        expect(harness.state.calls.filter(call => call[0] === 'reset')).toEqual([['reset']]);
    });
});
