import { beforeEach, describe, expect, mock, test } from 'bun:test';

let activeUser: { id: string; githubUsername: string | null; email: string | null; name: string } | null;
let username: string | null;
let usernameTaken: boolean;
let usernameChangeLimit: boolean;
let usernameWriteCalls: number;
let stackLimitReached: boolean;
let limiterAllows: boolean;
let limiterKeys: string[];
let events: string[];
let createdStackArgs: { userId: string; input: unknown } | null;
let createStackCalls: number;
const db = {};
const fakeLimiter = {
    limit: async ({ key }: { key: string }) => {
        limiterKeys.push(key);
        return { success: limiterAllows };
    },
};

const testUser = {
    id: 'github:user-1',
    githubUsername: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
};
const stackSummary = {
    id: 'stack-1',
    userId: 'github:user-1',
    slug: 'my-stack',
    title: 'My stack',
    description: null,
    isPublic: true,
    createdAt: 1,
    updatedAt: 2,
    itemCount: 2,
    enabledItemCount: 1,
};

class UsernameTakenError extends Error {}
class UsernameChangeLimitError extends Error {}
class StackLimitError extends Error {}

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
    setUsername: async (_database: unknown, _userId: string, nextUsername: string) => {
        usernameWriteCalls += 1;
        if (usernameTaken) throw new UsernameTakenError();
        if (usernameChangeLimit) throw new UsernameChangeLimitError();
        username = nextUsername;
    },
    UsernameTakenError,
    UsernameChangeLimitError,
}));
mock.module('../../../src/lib/server/stacks-repository', () => ({
    listStacks: async () => [stackSummary],
    createStack: async (_database: unknown, userId: string, input: unknown) => {
        createStackCalls += 1;
        if (stackLimitReached) throw new StackLimitError();
        createdStackArgs = { userId, input };
        return { ...stackSummary, userId, isPublic: false };
    },
    StackLimitError,
}));
mock.module('../../../src/lib/server/analytics', () => ({
    trackRequest: (_request: Request, event: string) => events.push(event),
}));

const { GET: getUsername, PUT: putUsername } = await import(
    `../../../src/pages/api/account/username.ts?test=${Date.now()}`
);
const { GET: getStacks, POST: postStack } = await import(
    `../../../src/pages/api/stacks/index.ts?test=${Date.now()}`
);

mock.restore();

beforeEach(() => {
    activeUser = testUser;
    username = 'test-user';
    usernameTaken = false;
    usernameChangeLimit = false;
    usernameWriteCalls = 0;
    stackLimitReached = false;
    limiterAllows = true;
    limiterKeys = [];
    createdStackArgs = null;
    createStackCalls = 0;
    events = [];
});

function context(method: string, path: string, body?: string, origin = 'https://ai.dosa.dev') {
    const init: RequestInit = {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = body;
    return {
        request: new Request(`https://ai.dosa.dev${path}`, init),
        cookies: { get: () => undefined },
    } as never;
}

describe('GET/PUT /api/account/username', () => {
    test('requires a session for both methods', async () => {
        activeUser = null;

        expect((await getUsername(context('GET', '/api/account/username'))).status).toBe(401);
        expect((await putUsername(context('PUT', '/api/account/username', '{"username":"new-user"}'))).status).toBe(401);
    });

    test('returns the username and suggestion privately', async () => {
        const response = await getUsername(context('GET', '/api/account/username'));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
            username: 'test-user',
            suggestion: 'test-user',
        });
    });

    test('suggests an available variant of an impersonating GitHub login', async () => {
        activeUser = { ...testUser, githubUsername: 'cursor' };
        const response = await getUsername(context('GET', '/api/account/username'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ username: 'test-user', suggestion: 'cursor-dev' });
    });

    test('rejects a bad Origin before mutation', async () => {
        limiterAllows = false;
        const response = await putUsername(context(
            'PUT',
            '/api/account/username',
            '{"username":"new-user"}',
            'https://example.com',
        ));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Invalid request origin' });
        expect(limiterKeys).toEqual([]);
        expect(usernameWriteCalls).toBe(0);
    });

    test('rate limits username changes before repository writes', async () => {
        limiterAllows = false;
        const response = await putUsername(context('PUT', '/api/account/username', '{"username":"new-user"}'));

        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: 'rate_limited' });
        expect(usernameWriteCalls).toBe(0);
        expect(limiterKeys).toEqual(['github:user-1']);
    });

    test('rejects malformed JSON, wrong types, invalid and over-length usernames', async () => {
        const bodies = [
            '{',
            '{"username":4}',
            '{"username":"admin"}',
            `{"username":"${'a'.repeat(31)}"}`,
        ];

        for (const body of bodies) {
            expect((await putUsername(context('PUT', '/api/account/username', body))).status).toBe(400);
        }
    });

    test('returns a conflict when the username is taken', async () => {
        usernameTaken = true;
        const response = await putUsername(context('PUT', '/api/account/username', '{"username":"new-user"}'));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'username_taken' });
    });

    test('returns a conflict when the username change limit is reached', async () => {
        usernameChangeLimit = true;
        const response = await putUsername(context('PUT', '/api/account/username', '{"username":"new-user"}'));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'username_change_limit' });
    });

    test('sets the username and returns the normalized value', async () => {
        const response = await putUsername(context('PUT', '/api/account/username', '{"username":" New-Name "}'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ username: 'new-name' });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    test('rejects offensive and impersonating usernames without writing', async () => {
        for (const value of ['cursor-official', 'f-u-c-k']) {
            const response = await putUsername(context(
                'PUT',
                '/api/account/username',
                JSON.stringify({ username: value }),
            ));

            expect(response.status).toBe(422);
            expect(await response.json()).toEqual({ error: "This username isn't available." });
        }
        expect(usernameWriteCalls).toBe(0);
    });

    test('allows a non-offensive username', async () => {
        const response = await putUsername(context(
            'PUT',
            '/api/account/username',
            '{"username":"ada-lovelace"}',
        ));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ username: 'ada-lovelace' });
        expect(usernameWriteCalls).toBe(1);
    });
});

describe('GET/POST /api/stacks', () => {
    test('requires a session for both methods', async () => {
        limiterAllows = false;
        activeUser = null;

        expect((await getStacks(context('GET', '/api/stacks'))).status).toBe(401);
        expect((await postStack(context('POST', '/api/stacks', '{"title":"New stack"}'))).status).toBe(401);
        expect(limiterKeys).toEqual([]);
    });

    test('lists owner stacks with computed public URLs', async () => {
        const response = await getStacks(context('GET', '/api/stacks'));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
            stacks: [{ ...stackSummary, publicUrl: '/u/test-user/my-stack' }],
            username: 'test-user',
        });
    });

    test('rejects a bad Origin before creating a stack', async () => {
        const response = await postStack(context(
            'POST',
            '/api/stacks',
            '{"title":"New stack"}',
            'https://example.com',
        ));

        expect(response.status).toBe(403);
    });

    test('rate limits stack creation before repository writes', async () => {
        limiterAllows = false;
        const response = await postStack(context('POST', '/api/stacks', '{'));

        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: 'rate_limited' });
        expect(createStackCalls).toBe(0);
        expect(createdStackArgs).toBeNull();
        expect(limiterKeys).toEqual(['github:user-1']);
    });

    test('rejects malformed JSON, wrong field types, and over-length input', async () => {
        const bodies = [
            '{',
            '{"title":4}',
            `{"title":"${'x'.repeat(81)}"}`,
            `{"title":"Good title","description":"${'x'.repeat(281)}"}`,
        ];

        for (const body of bodies) {
            expect((await postStack(context('POST', '/api/stacks', body))).status).toBe(400);
        }
    });

    test('returns a conflict at the per-user stack limit', async () => {
        stackLimitReached = true;
        const response = await postStack(context('POST', '/api/stacks', '{"title":"New stack"}'));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'stack_limit' });
    });

    test('creates a private stack, returns its URL, and records analytics', async () => {
        const response = await postStack(context(
            'POST',
            '/api/stacks',
            '{"title":"New stack","description":"Useful tools"}',
        ));

        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
            stack: { ...stackSummary, isPublic: false, publicUrl: '/u/test-user/my-stack' },
            username: 'test-user',
        });
        expect(events).toEqual(['stack_created']);
    });

    test('ignores mass-assignment fields when creating a stack', async () => {
        const response = await postStack(context(
            'POST',
            '/api/stacks',
            '{"title":"Assigned stack","userId":"github:other","id":"x","isPublic":true}',
        ));
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(createdStackArgs).toEqual({
            userId: 'github:user-1',
            input: { title: 'Assigned stack', description: null },
        });
        expect(body.stack.userId).toBe('github:user-1');
        expect(body.stack.id).not.toBe('x');
        expect(body.stack.isPublic).toBe(false);
    });
});
