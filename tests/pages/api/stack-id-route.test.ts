import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OwnedStack } from '../../../src/lib/server/stacks-repository';

let activeUser: { id: string } | null;
let username: string | null;
let ownedStack: OwnedStack | null;
let slugTaken: boolean;
let deleteSucceeded: boolean;
let updateStackCalls: number;
let deleteStackCalls: number;
let limiterAllows: boolean;
let limiterKeys: string[];
let events: string[];
const db = {};
const fakeLimiter = {
    limit: async ({ key }: { key: string }) => {
        limiterKeys.push(key);
        return { success: limiterAllows };
    },
};

const initialStack = (): OwnedStack => ({
    id: 'stack-1',
    userId: 'github:user-1',
    slug: 'my-stack',
    title: 'My stack',
    description: 'Description',
    isPublic: false,
    createdAt: 1,
    updatedAt: 2,
    itemCount: 0,
    enabledItemCount: 0,
    items: [],
});

class StackSlugTakenError extends Error {}

mock.module('../../../src/lib/server/route-auth', () => ({
    getCookieSessionUser: async () => activeUser,
}));
mock.module('../../../src/lib/server/runtime-env', () => ({
    requireDatabase: () => db,
    getStackWriteLimiter: () => fakeLimiter,
    getUsernameWriteLimiter: () => fakeLimiter,
}));
mock.module('../../../src/lib/server/username-repository', () => ({
    getUsername: async () => username,
}));
mock.module('../../../src/lib/server/stacks-repository', () => ({
    getOwnedStack: async (_database: unknown, userId: string, id: string) =>
        ownedStack && ownedStack.userId === userId && ownedStack.id === id
            ? structuredClone(ownedStack)
            : null,
    updateStack: async (_database: unknown, userId: string, id: string, changes: Partial<OwnedStack>) => {
        updateStackCalls += 1;
        if (slugTaken) throw new StackSlugTakenError();
        if (!ownedStack || ownedStack.userId !== userId || ownedStack.id !== id) return false;
        ownedStack = { ...ownedStack, ...changes, updatedAt: ownedStack.updatedAt + 1 };
        return true;
    },
    deleteStack: async (_database: unknown, userId: string, id: string) => {
        deleteStackCalls += 1;
        if (!ownedStack || ownedStack.userId !== userId || ownedStack.id !== id || !deleteSucceeded) return false;
        ownedStack = null;
        return true;
    },
    StackSlugTakenError,
}));
mock.module('../../../src/lib/server/analytics', () => ({
    trackRequest: (_request: Request, event: string) => events.push(event),
}));

const { GET, PATCH, DELETE } = await import(`../../../src/pages/api/stacks/[id].ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    activeUser = { id: 'github:user-1' };
    username = 'test-user';
    ownedStack = initialStack();
    slugTaken = false;
    deleteSucceeded = true;
    updateStackCalls = 0;
    deleteStackCalls = 0;
    limiterAllows = true;
    limiterKeys = [];
    events = [];
});

function context(method: string, body?: string, origin = 'https://ai.dosa.dev', userId = 'stack-1') {
    const init: RequestInit = {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = body;
    return {
        request: new Request(`https://ai.dosa.dev/api/stacks/${userId}`, init),
        cookies: { get: () => undefined },
        params: { id: userId },
    } as never;
}

describe('GET /api/stacks/[id]', () => {
    test('requires a session and hides another user stack', async () => {
        activeUser = null;
        expect((await GET(context('GET'))).status).toBe(401);

        activeUser = { id: 'github:other-user' };
        expect((await GET(context('GET'))).status).toBe(404);
    });

    test('returns the owned stack, items, username and public URL', async () => {
        const response = await GET(context('GET'));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
            stack: { ...initialStack(), publicUrl: '/u/test-user/my-stack' },
            username: 'test-user',
        });
    });
});

describe('PATCH /api/stacks/[id]', () => {
    test('rejects cross-origin requests and requires an owner session', async () => {
        limiterAllows = false;
        expect((await PATCH(context('PATCH', '{"title":"Changed"}', 'https://example.com'))).status).toBe(403);

        activeUser = null;
        expect((await PATCH(context('PATCH', '{"title":"Changed"}'))).status).toBe(401);
        expect(limiterKeys).toEqual([]);
    });

    test('returns 404 for another owner and malformed or invalid bodies return 400', async () => {
        activeUser = { id: 'github:other-user' };
        expect((await PATCH(context('PATCH', '{"title":"Changed"}'))).status).toBe(404);

        activeUser = { id: 'github:user-1' };
        const bodies = [
            '{',
            '[]',
            '{"title":4}',
            `{"title":"${'x'.repeat(81)}"}`,
            '{"isPublic":"yes"}',
        ];
        for (const body of bodies) {
            expect((await PATCH(context('PATCH', body))).status).toBe(400);
        }
    });

    test('rate limits updates before parsing or writing', async () => {
        limiterAllows = false;
        const response = await PATCH(context('PATCH', '{'));

        expect(response.status).toBe(429);
        expect(updateStackCalls).toBe(0);
        expect(limiterKeys).toEqual(['github:user-1']);
    });

    test('requires a username before publishing', async () => {
        username = null;
        const response = await PATCH(context('PATCH', '{"isPublic":true}'));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'username_required' });
        expect(events).toHaveLength(0);
    });

    test('keeps username-required precedence over public-text policy', async () => {
        username = null;
        const response = await PATCH(context(
            'PATCH',
            '{"title":"sh1t title","isPublic":true}',
        ));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'username_required' });
        expect(updateStackCalls).toBe(0);
    });

    test('rejects an offensive title when publishing without updating', async () => {
        const response = await PATCH(context(
            'PATCH',
            '{"title":"sh1t title","isPublic":true}',
        ));

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "This stack title isn't allowed on public stacks." });
        expect(updateStackCalls).toBe(0);
    });

    test('rejects an offensive enabled item purpose when publishing', async () => {
        ownedStack = {
            ...initialStack(),
            items: [{ slug: 'cursor', purpose: 'sh1t purpose', usageNotes: null, enabled: true, position: 0 }],
            itemCount: 1,
            enabledItemCount: 1,
        };
        const response = await PATCH(context('PATCH', '{"isPublic":true}'));

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
            error: "The purpose for cursor isn't allowed on public stacks.",
        });
        expect(updateStackCalls).toBe(0);
    });

    test('ignores offensive notes on disabled items when publishing', async () => {
        ownedStack = {
            ...initialStack(),
            items: [{ slug: 'cursor', purpose: 'Good purpose', usageNotes: 'sh1t notes', enabled: false, position: 0 }],
            itemCount: 1,
        };
        const response = await PATCH(context('PATCH', '{"isPublic":true}'));

        expect(response.status).toBe(200);
        expect(updateStackCalls).toBe(1);
    });

    test('allows offensive title edits while private', async () => {
        const response = await PATCH(context('PATCH', '{"title":"sh1t private title"}'));

        expect(response.status).toBe(200);
        expect(updateStackCalls).toBe(1);
    });

    test('checks offensive title edits on an already-public stack', async () => {
        ownedStack = { ...initialStack(), isPublic: true };
        const response = await PATCH(context('PATCH', '{"title":"sh1t public title"}'));

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "This stack title isn't allowed on public stacks." });
        expect(updateStackCalls).toBe(0);
    });

    test('returns 409 for a slug conflict', async () => {
        slugTaken = true;
        const response = await PATCH(context('PATCH', '{"slug":"taken-name"}'));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'slug_taken' });
    });

    test('updates stack metadata and records only the publish transition', async () => {
        const published = await PATCH(context('PATCH', '{"title":"Published stack","isPublic":true}'));

        expect(published.status).toBe(200);
        expect(await published.json()).toEqual({
            stack: {
                ...initialStack(),
                title: 'Published stack',
                isPublic: true,
                updatedAt: 3,
                publicUrl: '/u/test-user/my-stack',
            },
            username: 'test-user',
        });
        expect(events).toEqual(['stack_published']);

        await PATCH(context('PATCH', '{"title":"Still public"}'));
        expect(events).toEqual(['stack_published']);
    });

    test('ignores mass-assignment fields when updating a stack', async () => {
        ownedStack = { ...initialStack(), createdAt: 2 };
        const response = await PATCH(context(
            'PATCH',
            '{"title":"Updated title","userId":"github:other","id":"x","createdAt":1}',
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.stack).toMatchObject({
            id: 'stack-1',
            userId: 'github:user-1',
            createdAt: 2,
            title: 'Updated title',
        });
    });
});

describe('DELETE /api/stacks/[id]', () => {
    test('rejects cross-origin requests and requires an owner session', async () => {
        expect((await DELETE(context('DELETE', undefined, 'https://example.com'))).status).toBe(403);

        activeUser = null;
        expect((await DELETE(context('DELETE'))).status).toBe(401);
    });

    test('hides another user stack and deletes an owned stack', async () => {
        activeUser = { id: 'github:other-user' };
        expect((await DELETE(context('DELETE'))).status).toBe(404);

        activeUser = { id: 'github:user-1' };
        const response = await DELETE(context('DELETE'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ deleted: true });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    test('rate limits deletion before repository writes', async () => {
        limiterAllows = false;
        const response = await DELETE(context('DELETE'));

        expect(response.status).toBe(429);
        expect(deleteStackCalls).toBe(0);
        expect(limiterKeys).toEqual(['github:user-1']);
    });
});
