import { beforeEach, describe, expect, mock, test } from 'bun:test';

let hasSession = false;
let prefs = { emailEnabled: true, newsEnabled: false };
const emailCalls: boolean[] = [];
const newsCalls: boolean[] = [];

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
                        email: 'ada@example.com',
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
mock.module('../../../../src/lib/server/notification-prefs-repository', () => ({
    getOrCreatePrefs: async () => ({ ...prefs }),
    setEmailEnabled: async (_db: unknown, _userId: string, enabled: boolean) => {
        emailCalls.push(enabled);
        prefs = { ...prefs, emailEnabled: enabled };
        return { ...prefs };
    },
    setNewsEnabled: async (_db: unknown, _userId: string, enabled: boolean) => {
        newsCalls.push(enabled);
        prefs = { ...prefs, newsEnabled: enabled };
        return { ...prefs };
    },
}));

const { GET, PUT } = await import(`../../../../src/pages/api/notifications/prefs.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    hasSession = false;
    prefs = { emailEnabled: true, newsEnabled: false };
    emailCalls.splice(0);
    newsCalls.splice(0);
});

const cookies = {
    get: () => hasSession ? { value: 'session-token' } : undefined,
};

function request(method: string, body?: unknown, origin = 'https://ai.dosa.dev') {
    return new Request('https://ai.dosa.dev/api/notifications/prefs', {
        method,
        headers: {
            Origin: origin,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

describe('/api/notifications/prefs', () => {
    test('rejects invalid JSON', async () => {
        const response = await PUT({
            request: new Request('https://ai.dosa.dev/api/notifications/prefs', {
                method: 'PUT',
                headers: { Origin: 'https://ai.dosa.dev', 'Content-Type': 'application/json' },
                body: '{',
            }),
            cookies,
        } as never);

        expect(response.status).toBe(400);
    });

    test('rejects an empty preference body', async () => {
        const response = await PUT({ request: request('PUT', {}), cookies } as never);

        expect(response.status).toBe(400);
    });

    test('rejects non-boolean preference values', async () => {
        const response = await PUT({ request: request('PUT', { emailEnabled: 'yes' }), cookies } as never);

        expect(response.status).toBe(400);
    });

    test('requires a session before applying a valid preference', async () => {
        const response = await PUT({ request: request('PUT', { newsEnabled: true }), cookies } as never);

        expect(response.status).toBe(401);
        expect(newsCalls).toHaveLength(0);
    });

    test('updates only the news preference when requested', async () => {
        hasSession = true;

        const response = await PUT({ request: request('PUT', { newsEnabled: true }), cookies } as never);

        expect(response.status).toBe(200);
        expect(emailCalls).toEqual([]);
        expect(newsCalls).toEqual([true]);
        expect(await response.json()).toEqual({
            emailEnabled: true,
            newsEnabled: true,
            email: 'ada@example.com',
            emailVerified: true,
        });
    });

    test('updates both preferences and returns the final state', async () => {
        hasSession = true;

        const response = await PUT({
            request: request('PUT', { emailEnabled: false, newsEnabled: true }),
            cookies,
        } as never);

        expect(response.status).toBe(200);
        expect(emailCalls).toEqual([false]);
        expect(newsCalls).toEqual([true]);
        expect(await response.json()).toMatchObject({
            emailEnabled: false,
            newsEnabled: true,
            email: 'ada@example.com',
            emailVerified: true,
        });
    });

    test('rejects unauthenticated reads', async () => {
        const response = await GET({ cookies } as never);

        expect(response.status).toBe(401);
    });

    test('returns preferences and session email details', async () => {
        hasSession = true;

        const response = await GET({ cookies } as never);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            emailEnabled: true,
            newsEnabled: false,
            email: 'ada@example.com',
            emailVerified: true,
        });
    });
});
