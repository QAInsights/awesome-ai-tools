import { beforeEach, describe, expect, mock, test } from 'bun:test';

let hasSession = false;
let repositoryError = false;
let created = true;
const points: Array<{ indexes: string[]; blobs: string[] }> = [];

mock.module('cloudflare:workers', () => ({
    env: {
        DB: {
            prepare: () => ({
                bind: () => ({
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
                }),
            }),
        },
        ANALYTICS: {
            writeDataPoint: (point: { indexes: string[]; blobs: string[] }) => points.push(point),
        },
    },
}));
mock.module('../../../../src/lib/server/favorites-repository', () => ({
    addFavorite: async (_db: unknown, _userId: string, slug: string) => {
        if (repositoryError) throw new Error('database unavailable');
        return { favorite: { slug, createdAt: 1 }, created };
    },
    removeFavoriteWithFollow: async () => {
        if (repositoryError) throw new Error('database unavailable');
        return true;
    },
}));

const { PUT, DELETE } = await import(`../../../../src/pages/api/favorites/[slug].ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    hasSession = false;
    repositoryError = false;
    created = true;
    points.splice(0);
});

const cookies = {
    get: () => hasSession ? { value: 'session-token' } : undefined,
};

function context(method: string, slug = 'cursor', origin = 'https://ai.dosa.dev') {
    return {
        request: new Request(`https://ai.dosa.dev/api/favorites/${slug}`, {
            method,
            headers: { Origin: origin },
        }),
        cookies,
        params: { slug },
    } as never;
}

describe('PUT /api/favorites/[slug]', () => {
    test('rejects cross-origin requests', async () => {
        const response = await PUT(context('PUT', 'cursor', 'https://example.com'));

        expect(response.status).toBe(403);
    });

    test('rejects invalid slugs', async () => {
        for (const slug of ['Cursor', 'a--b', 'a'.repeat(129), '../x']) {
            const response = await PUT(context('PUT', slug));
            expect(response.status).toBe(404);
        }
    });

    test('requires a session', async () => {
        const response = await PUT(context('PUT'));

        expect(response.status).toBe(401);
    });

    test('returns created and records an analytics point', async () => {
        hasSession = true;

        const response = await PUT(context('PUT'));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
            favorite: { slug: 'cursor', createdAt: 1 },
            created: true,
        });
        expect(points).toHaveLength(1);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    test('returns an existing favorite without recording analytics', async () => {
        hasSession = true;
        created = false;

        const response = await PUT(context('PUT'));

        expect(response.status).toBe(200);
        expect(points).toHaveLength(0);
    });

    test('returns service unavailable when saving fails', async () => {
        hasSession = true;
        repositoryError = true;

        const response = await PUT(context('PUT'));

        expect(response.status).toBe(503);
    });
});

describe('DELETE /api/favorites/[slug]', () => {
    test('removes a favorite with private no-store caching', async () => {
        hasSession = true;

        const response = await DELETE(context('DELETE'));

        expect(response.status).toBe(204);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    test('returns service unavailable when removal fails', async () => {
        hasSession = true;
        repositoryError = true;

        const response = await DELETE(context('DELETE'));

        expect(response.status).toBe(503);
    });
});
