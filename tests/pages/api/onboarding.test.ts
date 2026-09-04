import { beforeEach, describe, expect, mock, test } from 'bun:test';

let hasSession = false;
let state = emptyState();
const calls: string[] = [];

function emptyState() {
    return {
        badgeCompletedAt: null,
        dismissedAt: null,
        completedAt: null,
        favoritesCount: 0,
        followsCount: 0,
        favoritesTarget: 3,
        followsTarget: 1,
        favoritesStepComplete: false,
        followsStepComplete: false,
        badgeStepComplete: false,
        completed: false,
    };
}

const database = {
    prepare() {
        return {
            bind() {
                return {
                    first: async () => hasSession ? {
                        id: 'github:1',
                        provider: 'github',
                        provider_user_id: '1',
                        display_name: 'Test User',
                        email: null,
                        avatar_url: null,
                        github_username: null,
                        email_verified: 1,
                        last_seen_at: Date.now(),
                    } : null,
                    run: async () => ({ success: true, meta: { changes: 0 } }),
                };
            },
        };
    },
};

mock.module('cloudflare:workers', () => ({ env: { DB: database } }));
mock.module('../../../src/lib/server/onboarding-repository', () => ({
    loadOnboardingState: async () => ({ ...state }),
    markBadgeCompleted: async () => {
        calls.push('badge_completed');
        state = { ...state, badgeCompletedAt: 10, badgeStepComplete: true };
        return { ...state };
    },
    dismissOnboarding: async () => {
        calls.push('dismiss');
        state = { ...state, dismissedAt: 20 };
        return { ...state };
    },
}));

const { GET, POST } = await import(`../../../src/pages/api/onboarding.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    hasSession = false;
    state = emptyState();
    calls.splice(0);
});

const cookies = {
    get: () => hasSession ? { value: 'session-token' } : undefined,
};

function request(method: string, body?: unknown, origin = 'https://ai.dosa.dev') {
    return new Request('https://ai.dosa.dev/api/onboarding', {
        method,
        headers: {
            Origin: origin,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

describe('/api/onboarding', () => {
    test('GET requires a session', async () => {
        const response = await GET({ cookies } as never);

        expect(response.status).toBe(401);
    });

    test('GET returns the onboarding state without mutating it', async () => {
        hasSession = true;
        state = { ...state, favoritesCount: 2, followsCount: 1, followsStepComplete: true };

        const response = await GET({ cookies } as never);

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ onboarding: { ...state } });
        expect(calls).toEqual([]);
    });

    test('POST rejects cross-origin requests', async () => {
        const response = await POST({
            request: request('POST', { action: 'dismiss' }, 'https://example.com'),
            cookies,
        } as never);

        expect(response.status).toBe(403);
        expect(calls).toEqual([]);
    });

    test('POST rejects an unknown action', async () => {
        const response = await POST({ request: request('POST', { action: 'nuke' }), cookies } as never);

        expect(response.status).toBe(400);
        expect(calls).toEqual([]);
    });

    test('POST rejects a missing or non-string action', async () => {
        expect((await POST({ request: request('POST', {}), cookies } as never)).status).toBe(400);
        expect((await POST({ request: request('POST', { action: 1 }), cookies } as never)).status).toBe(400);
        expect((await POST({
            request: new Request('https://ai.dosa.dev/api/onboarding', {
                method: 'POST',
                headers: { Origin: 'https://ai.dosa.dev', 'Content-Type': 'application/json' },
                body: '{',
            }),
            cookies,
        } as never)).status).toBe(400);
        expect(calls).toEqual([]);
    });

    test('POST requires a session before mutating progress', async () => {
        const response = await POST({ request: request('POST', { action: 'badge_completed' }), cookies } as never);

        expect(response.status).toBe(401);
        expect(calls).toEqual([]);
    });

    test('POST badge_completed stamps the badge step and returns fresh state', async () => {
        hasSession = true;

        const response = await POST({ request: request('POST', { action: 'badge_completed' }), cookies } as never);

        expect(response.status).toBe(200);
        expect(calls).toEqual(['badge_completed']);
        const body = await response.json();
        expect(body.onboarding.badgeStepComplete).toBe(true);
    });

    test('POST dismiss stamps the dismissal and returns fresh state', async () => {
        hasSession = true;

        const response = await POST({ request: request('POST', { action: 'dismiss' }), cookies } as never);

        expect(response.status).toBe(200);
        expect(calls).toEqual(['dismiss']);
        const body = await response.json();
        expect(body.onboarding.dismissedAt).toBe(20);
    });
});
