import { beforeEach, describe, expect, mock, test } from 'bun:test';

let activeUser: { id: string } | null;
let limiterAllows: boolean;
let limiterKeys: string[];
let turnstileSecret: string;
let turnstileResult: boolean;
let turnstileCalls: Array<{ token: string; remoteIp: string | null }>;
let zapCounts: Record<string, number>;
let castResult: 'created' | 'duplicate';
let castCalls: Array<{ toolId: string; voterId: string }>;
const db = {};
const fakeLimiter = {
    limit: async ({ key }: { key: string }) => {
        limiterKeys.push(key);
        return { success: limiterAllows };
    },
};

mock.module('../../../src/lib/server/route-auth', () => ({
    getCookieSessionUser: async () => activeUser,
}));
mock.module('../../../src/lib/server/runtime-env', () => ({
    requireDatabase: () => db,
    getZapWriteLimiter: () => fakeLimiter,
    getTurnstileSecret: () => turnstileSecret,
}));
mock.module('../../../src/lib/server/turnstile', () => ({
    verifyTurnstile: async (token: string, _secret: string, remoteIp: string | null) => {
        turnstileCalls.push({ token, remoteIp });
        return turnstileResult;
    },
}));
mock.module('../../../src/lib/server/zaps-repository', () => ({
    ZAP_TOOL_ID_PATTERN: /^[a-z0-9-]{1,128}$/,
    getZapCounts: async () => zapCounts,
    castZap: async (_database: unknown, toolId: string, voterId: string) => {
        castCalls.push({ toolId, voterId });
        return castResult;
    },
}));

const { GET } = await import(`../../../src/pages/api/v1/count.ts?test=${Date.now()}`);
const { POST } = await import(`../../../src/pages/api/v1/vote.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    activeUser = { id: 'github:user-1' };
    limiterAllows = true;
    limiterKeys = [];
    turnstileSecret = 'test-secret';
    turnstileResult = true;
    turnstileCalls = [];
    zapCounts = {};
    castResult = 'created';
    castCalls = [];
});

function getContext() {
    return {
        request: new Request('https://ai.dosa.dev/api/v1/count'),
        cookies: { get: () => undefined },
    } as never;
}

function postContext(body?: string, origin = 'https://ai.dosa.dev') {
    const init: RequestInit = {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = body;
    return {
        request: new Request('https://ai.dosa.dev/api/v1/vote', init),
        cookies: { get: () => undefined },
    } as never;
}

describe('GET /api/v1/count', () => {
    test('returns counts keyed with the votes: prefix and a public cache header', async () => {
        zapCounts = { cursor: 42, zed: 7 };
        const response = await GET(getContext());

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=30');
        expect(await response.json()).toEqual({ 'votes:cursor': 42, 'votes:zed': 7 });
    });
});

describe('POST /api/v1/vote', () => {
    test('rejects cross-origin requests and missing sessions', async () => {
        expect((await POST(postContext('{"tool_id":"cursor"}', 'https://example.com'))).status).toBe(403);

        activeUser = null;
        expect((await POST(postContext('{"tool_id":"cursor"}'))).status).toBe(401);
        expect(castCalls).toEqual([]);
    });

    test('rejects malformed bodies and invalid tool ids', async () => {
        const bodies = ['{', '{}', '{"tool_id":"Bad Tool"}', '{"tool_id":"has space"}', '{"tool_id":""}'];
        for (const body of bodies) {
            expect((await POST(postContext(body))).status).toBe(400);
        }
        expect(castCalls).toEqual([]);
    });

    test('rate limits before verifying turnstile or casting', async () => {
        limiterAllows = false;
        const response = await POST(postContext('{"tool_id":"cursor","cf_token":"t"}'));

        expect(response.status).toBe(429);
        expect(limiterKeys).toEqual(['github:user-1']);
        expect(turnstileCalls).toEqual([]);
        expect(castCalls).toEqual([]);
    });

    test('returns 503 when TURNSTILE_SECRET is not configured outside dev', async () => {
        turnstileSecret = '';
        const response = await POST(postContext('{"tool_id":"cursor","cf_token":"t"}'));

        // import.meta.env.DEV is false under `bun test` (production branch)
        expect(response.status).toBe(503);
        expect(turnstileCalls).toEqual([]);
        expect(castCalls).toEqual([]);
    });

    test('rejects when turnstile verification fails', async () => {
        turnstileResult = false;
        const response = await POST(postContext('{"tool_id":"cursor","cf_token":"bad"}'));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'turnstile_failed' });
        expect(castCalls).toEqual([]);
    });

    test('casts a zap for the session user and ignores body visitor_id', async () => {
        const response = await POST(postContext(
            '{"tool_id":"CURSOR","visitor_id":"fp:spoofed","cf_token":"ok"}',
        ));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ tool_id: 'cursor' });
        expect(castCalls).toEqual([{ toolId: 'cursor', voterId: 'github:user-1' }]);
    });

    test('returns already_zapped for duplicates', async () => {
        castResult = 'duplicate';
        const response = await POST(postContext('{"tool_id":"cursor","cf_token":"ok"}'));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'already_zapped' });
    });
});
