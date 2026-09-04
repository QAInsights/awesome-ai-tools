import { beforeEach, describe, expect, mock, test } from 'bun:test';

let hasSession = false;
let sessionId = 'github:2';
const summary = {
    candidates: 3,
    sent: 2,
    skippedNoChanges: 1,
    skippedTooSoon: 0,
    failed: 0,
    dryRun: false,
    errors: [],
};
const globalState = globalThis as typeof globalThis & {
    __aatAdminRunnerCalls?: string[];
    __aatAdminSummary?: typeof summary;
};

const sessionRow = {
    id: sessionId,
    provider: 'github',
    provider_user_id: sessionId.slice('github:'.length),
    display_name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
    github_username: 'test-user',
    email_verified: 1,
    last_seen_at: Date.now(),
};

const database = {
    prepare() {
        return {
            bind() {
                return {
                    first: async () => hasSession ? { ...sessionRow, id: sessionId } : null,
                    run: async () => ({ success: true, meta: { changes: 0 } }),
                };
            },
        };
    },
};

mock.module('cloudflare:workers', () => ({
    env: {
        DB: database,
        ADMIN_USER_IDS: 'github:1',
    },
}));
mock.module('../../../../../src/lib/server/digest-runner', () => ({
    runScheduledDigest: async (trigger: string) => {
        globalState.__aatAdminRunnerCalls?.push(`digest:${trigger}`);
        return globalState.__aatAdminSummary;
    },
    runScheduledNews: async (trigger: string) => {
        globalState.__aatAdminRunnerCalls?.push(`news:${trigger}`);
        return globalState.__aatAdminSummary;
    },
}));

const { POST } = await import(`../../../../../src/pages/api/admin/digest/run.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    hasSession = false;
    sessionId = 'github:2';
    globalState.__aatAdminRunnerCalls = [];
    globalState.__aatAdminSummary = summary;
});

const cookies = {
    get: () => hasSession ? { value: 'session-token' } : undefined,
};

function request(origin = 'https://ai.dosa.dev') {
    return new Request('https://ai.dosa.dev/api/admin/digest/run', {
        method: 'POST',
        headers: { Origin: origin },
    });
}

describe('POST /api/admin/digest/run', () => {
    test('rejects cross-origin requests', async () => {
        const response = await POST({ request: request('https://example.com'), cookies } as never);

        expect(response.status).toBe(403);
    });

    test('returns not found without a session', async () => {
        const response = await POST({ request: request(), cookies } as never);

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Not found' });
    });

    test('hides the route from signed-in non-admins', async () => {
        hasSession = true;

        const response = await POST({ request: request(), cookies } as never);

        expect(response.status).toBe(404);
        expect(globalState.__aatAdminRunnerCalls).toHaveLength(0);
    });

    test('runs the digest job for an admin', async () => {
        hasSession = true;
        sessionId = 'github:1';

        const response = await POST({ request: request(), cookies } as never);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(summary);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(globalState.__aatAdminRunnerCalls).toContain('digest:manual');
    });
});
