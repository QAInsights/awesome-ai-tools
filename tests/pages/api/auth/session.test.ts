import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

let failDelete = false;
const database = {
    prepare() {
        return {
            bind() {
                return {
                    async first() {
                        return null;
                    },
                    async run() {
                        if (failDelete) throw new Error('D1 unavailable');
                        return { success: true };
                    },
                };
            },
        };
    },
};

mock.module('cloudflare:workers', () => ({
    env: {
        DB: database,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GITHUB_CLIENT_ID: 'github-client-id',
        GITHUB_CLIENT_SECRET: 'github-client-secret',
    },
}));

const importId = Date.now();
const { GET: GET_CONFIG } = await import(`../../../../src/pages/api/auth/config.ts?test=${importId}`);
const { DELETE } = await import(`../../../../src/pages/api/auth/session.ts?test=${importId}`);

afterAll(() => mock.restore());

beforeEach(() => {
    failDelete = false;
});

function makeCookies() {
    const deleted: unknown[][] = [];
    return {
        deleted,
        get: () => ({ value: 'raw-session-token' }),
        delete: (...args: unknown[]) => deleted.push(args),
    };
}

function makeRequest() {
    return new Request('https://ai.dosa.dev/api/auth/session', {
        method: 'DELETE',
        headers: { Origin: 'https://ai.dosa.dev' },
    });
}

describe('GET /api/auth/config', () => {
    test('serves the Google audience configured on the Worker', async () => {
        const response = await GET_CONFIG({} as never);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ googleClientId: 'google-client-id' });
    });
});

describe('DELETE /api/auth/session', () => {
    test('clears the session cookie after deleting the database session', async () => {
        const cookies = makeCookies();

        const response = await DELETE({ request: makeRequest(), cookies } as never);

        expect(response.status).toBe(204);
        expect(cookies.deleted).toEqual([[
            'aat_session',
            { httpOnly: true, sameSite: 'lax', secure: true, path: '/' },
        ]]);
    });

    test('keeps the cookie when database deletion fails', async () => {
        failDelete = true;
        const cookies = makeCookies();

        const response = await DELETE({ request: makeRequest(), cookies } as never);

        expect(response.status).toBe(503);
        expect(cookies.deleted).toEqual([]);
    });
});
