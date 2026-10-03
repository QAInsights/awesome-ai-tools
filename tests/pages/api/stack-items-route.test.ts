import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { getToolBySlug } from '../../../src/lib/tools';
import type { OwnedStack, StackItem } from '../../../src/lib/server/stacks-repository';

let activeUser: { id: string } | null;
let username: string | null;
let ownedStack: OwnedStack | null;
let appendStatus: 'added' | 'exists' | 'limit' | 'not_found';
let appendedItem: StackItem;
let replacedItems: StackItem[];
const db = {};

const initialStack = (): OwnedStack => ({
    id: 'stack-1',
    userId: 'github:user-1',
    slug: 'my-stack',
    title: 'My stack',
    description: null,
    isPublic: false,
    createdAt: 1,
    updatedAt: 2,
    itemCount: 0,
    enabledItemCount: 0,
    items: [],
});

mock.module('../../../src/lib/server/route-auth', () => ({
    getCookieSessionUser: async () => activeUser,
}));
mock.module('../../../src/lib/server/runtime-env', () => ({
    requireDatabase: () => db,
}));
mock.module('../../../src/lib/server/username-repository', () => ({
    getUsername: async () => username,
}));
mock.module('../../../src/lib/server/stacks-repository', () => ({
    getOwnedStack: async (_database: unknown, userId: string, id: string) =>
        ownedStack && ownedStack.userId === userId && ownedStack.id === id
            ? structuredClone(ownedStack)
            : null,
    replaceItems: async (_database: unknown, _userId: string, _id: string, items: StackItem[]) => {
        replacedItems = items;
        ownedStack = {
            ...initialStack(),
            items,
            itemCount: items.length,
            enabledItemCount: items.filter(item => item.enabled).length,
        };
    },
    appendItem: async (
        _database: unknown,
        _userId: string,
        _id: string,
        input: { slug: string; purpose: string; usageNotes?: string | null },
    ) => {
        appendedItem = {
            slug: input.slug,
            position: 0,
            purpose: input.purpose,
            usageNotes: input.usageNotes ?? null,
            enabled: true,
        };
        return { status: appendStatus, item: appendedItem };
    },
}));

const { PUT, POST } = await import(`../../../src/pages/api/stacks/[id]/items.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    activeUser = { id: 'github:user-1' };
    username = 'test-user';
    ownedStack = initialStack();
    appendStatus = 'added';
    appendedItem = {
        slug: 'cursor',
        position: 0,
        purpose: 'AI IDEs',
        usageNotes: null,
        enabled: true,
    };
    replacedItems = [];
});

function context(method: string, body?: string, origin = 'https://ai.dosa.dev', id = 'stack-1') {
    const init: RequestInit = {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = body;
    return {
        request: new Request(`https://ai.dosa.dev/api/stacks/${id}/items`, init),
        cookies: { get: () => undefined },
        params: { id },
    } as never;
}

describe('PUT /api/stacks/[id]/items', () => {
    test('rejects cross-origin requests, requires a session, and hides another owner stack', async () => {
        expect((await PUT(context('PUT', '{"items":[]}', 'https://example.com'))).status).toBe(403);

        activeUser = null;
        expect((await PUT(context('PUT', '{"items":[]}'))).status).toBe(401);

        activeUser = { id: 'github:other-user' };
        expect((await PUT(context('PUT', '{"items":[]}'))).status).toBe(404);
    });

    test('rejects malformed, wrong-shaped, unknown, duplicate and over-length items', async () => {
        const bodies = [
            '{',
            '{"items":{}}',
            '{"items":[{"slug":"unknown-tool","purpose":"Test"}]}',
            '{"items":[{"slug":"cursor","purpose":"One"},{"slug":"cursor","purpose":"Two"}]}',
            `{"items":[{"slug":"cursor","purpose":"${'x'.repeat(61)}"}]}`,
            `{"items":[{"slug":"cursor","purpose":"Purpose","usageNotes":"${'x'.repeat(501)}"}]}`,
        ];

        for (const body of bodies) {
            expect((await PUT(context('PUT', body))).status).toBe(400);
        }
    });

    test('replaces the ordered list and returns the owner stack with its public URL', async () => {
        const response = await PUT(context(
            'PUT',
            '{"items":[{"slug":"cursor","purpose":"Code editing"},{"slug":"zed","purpose":"Review","enabled":false}]}',
        ));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(replacedItems).toEqual([
            { slug: 'cursor', purpose: 'Code editing', usageNotes: null, enabled: true, position: 0 },
            { slug: 'zed', purpose: 'Review', usageNotes: null, enabled: false, position: 1 },
        ]);
        expect(await response.json()).toEqual({
            stack: {
                ...initialStack(),
                items: replacedItems,
                itemCount: 2,
                enabledItemCount: 1,
                publicUrl: '/u/test-user/my-stack',
            },
            username: 'test-user',
        });
    });
});

describe('POST /api/stacks/[id]/items', () => {
    test('rejects cross-origin requests, requires a session, and hides another owner stack', async () => {
        expect((await POST(context('POST', '{"slug":"cursor"}', 'https://example.com'))).status).toBe(403);

        activeUser = null;
        expect((await POST(context('POST', '{"slug":"cursor"}'))).status).toBe(401);

        activeUser = { id: 'github:other-user' };
        expect((await POST(context('POST', '{"slug":"cursor"}'))).status).toBe(404);
    });

    test('rejects malformed bodies, unknown slugs, wrong types and over-length text', async () => {
        const bodies = [
            '{',
            '{}',
            '{"slug":"unknown-tool"}',
            '{"slug":"cursor","purpose":4}',
            `{"slug":"cursor","purpose":"${'x'.repeat(61)}"}`,
            `{"slug":"cursor","purpose":"Good","usageNotes":"${'x'.repeat(501)}"}`,
        ];

        for (const body of bodies) {
            expect((await POST(context('POST', body))).status).toBe(400);
        }
    });

    test('appends an item with the catalog category as its default purpose', async () => {
        const response = await POST(context('POST', '{"slug":"cursor"}'));
        const tool = getToolBySlug('cursor');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            status: 'added',
            item: {
                slug: 'cursor',
                position: 0,
                purpose: tool?.categoryShort,
                usageNotes: null,
                enabled: true,
            },
            publicUrl: '/u/test-user/my-stack',
        });
    });

    test('returns a conflict when the item already exists or the stack is full', async () => {
        appendStatus = 'exists';
        const existsResponse = await POST(context('POST', '{"slug":"cursor"}'));
        expect(existsResponse.status).toBe(409);
        expect(await existsResponse.json()).toEqual({ error: 'item_exists' });

        appendStatus = 'limit';
        const limitResponse = await POST(context('POST', '{"slug":"cursor"}'));
        expect(limitResponse.status).toBe(409);
        expect(await limitResponse.json()).toEqual({ error: 'item_limit' });
    });
});
