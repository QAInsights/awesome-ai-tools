import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../../../src/lib/server/test-d1-adapter';
import { hashSwitchIdentity } from '../../../src/lib/server/switch-voter';

let database = createTestDatabase();
let user: { id: string } | null = null;
let allows = true;
let verified = true;
let secret = 'test-secret';
let limitKeys: string[] = [];
let verificationCalls = 0;
let lookupCalls: boolean[] = [];
let verification: (() => Promise<boolean>) | null = null;
let lookup: (() => Promise<typeof user>) | null = null;
mock.module('../../../src/lib/server/route-auth', () => ({ getCookieSessionUser: async (_cookies: unknown, _db: unknown, touchActivity = true) => {
    lookupCalls.push(touchActivity);
    return lookup ? lookup() : user;
} }));
mock.module('../../../src/lib/server/runtime-env', () => ({
    requireDatabase: () => database.db,
    getSwitchWriteLimiter: () => ({ limit: async ({ key }: { key: string }) => { limitKeys.push(key); return { success: allows }; } }),
    getTurnstileSecret: () => secret,
}));
mock.module('../../../src/lib/server/turnstile', () => ({ verifyTurnstile: async () => { verificationCalls++; return verification ? verification() : verified; } }));
mock.module('../../../src/lib/tools', () => ({
    getToolBySlug: (slug: string) => slug === 'cursor' ? { slug } : undefined,
    getAlternativesFor: () => [{ slug: 'cline' }, { slug: 'zed' }],
}));
mock.module('../../../src/lib/compare', () => ({ hasAlternativesPage: (slug: string) => slug === 'cursor' }));
const { GET, POST } = await import('../../../src/pages/api/v1/switches');
afterAll(() => { database.sqlite.close(); mock.restore(); });
beforeEach(() => {
    database.sqlite.close();
    database = createTestDatabase();
    user = null; allows = true; verified = true; secret = 'test-secret'; limitKeys = []; verificationCalls = 0;
    lookupCalls = []; verification = null; lookup = null;
});

function context(body?: unknown, { origin = 'https://ai.dosa.dev', tool = 'cursor', cookie = '' } = {}) {
    const values = new Map(cookie ? [['aat_switch_voter', cookie]] : []);
    const sets: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    return {
        request: new Request(`https://ai.dosa.dev/api/v1/switches?tool=${tool}`, body === undefined ? {} : {
            method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body),
        }),
        cookies: { get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined,
            set: (name: string, value: string, options: Record<string, unknown>) => { values.set(name, value); sets.push({ name, value, options }); } },
        sets,
    };
}
const vote = (target: string | null = 'cline') => ({ tool: 'cursor', target, token: 'test-token' });

test('anonymous GET is empty and never creates a cookie; invalid sources are rejected', async () => {
    const ctx = context();
    const response = await GET(ctx as never);
    expect(await response.json()).toEqual({ total: 0, counts: [], mine: null });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(ctx.sets).toHaveLength(0);
    expect((await GET(context(undefined, { tool: 'missing' }) as never)).status).toBe(400);
});

test('creates a secure guest identity, hashes it in D1, reuses it to change and retract', async () => {
    const ctx = context(vote());
    const first = await POST(ctx as never);
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toContain('no-store');
    expect(await first.json()).toEqual({ total: 1, counts: [{ tool: 'cline', votes: 1 }], mine: 'cline' });
    expect(ctx.sets).toHaveLength(1);
    const cookie = ctx.sets[0]!;
    expect(cookie.name).toBe('aat_switch_voter');
    expect(cookie.value).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 31536000 });
    expect(database.sqlite.query('SELECT voter_key FROM switch_votes').get()).toEqual({ voter_key: `g:${await hashSwitchIdentity(cookie.value)}` });
    const changed = context(vote('zed'), { cookie: cookie.value });
    expect(await (await POST(changed as never)).json()).toEqual({ total: 1, counts: [{ tool: 'zed', votes: 1 }], mine: 'zed' });
    expect(changed.sets).toHaveLength(0);
    expect((await (await GET(context(undefined, { cookie: cookie.value }) as never)).json()).mine).toBe('zed');
    expect(await (await POST(context(vote(null), { cookie: cookie.value }) as never)).json()).toEqual({ total: 0, counts: [], mine: null });
});

test('signed-in users use their account key instead of guest cookies', async () => {
    user = { id: 'github:42' };
    const ctx = context(vote(), { cookie: 'a'.repeat(64) });
    expect((await POST(ctx as never)).status).toBe(200);
    expect(database.sqlite.query('SELECT voter_key FROM switch_votes').get()).toEqual({ voter_key: 'u:github:42' });
    expect(ctx.sets).toHaveLength(0);
});

test('rejects cross-origin requests and invalid source, target, self-votes and malformed JSON', async () => {
    expect((await POST(context(vote(), { origin: 'https://evil.example' }) as never)).status).toBe(403);
    for (const body of [null, {}, { ...vote(), tool: 'missing' }, { ...vote(), target: 'cursor' }, { ...vote(), target: 'unknown' }, { ...vote(), target: 1 }, { tool: 'cursor', token: 'test' }]) {
        expect((await POST(context(body) as never)).status).toBe(400);
    }
    const ctx = context(vote());
    ctx.request = new Request(ctx.request.url, { method: 'POST', headers: { Origin: 'https://ai.dosa.dev' }, body: '{' });
    expect((await POST(ctx as never)).status).toBe(400);
    expect(database.sqlite.query('SELECT COUNT(*) AS n FROM switch_votes').get()).toEqual({ n: 0 });
});

test('requires a token and fails closed on verification failure or missing secret', async () => {
    expect((await POST(context({ ...vote(), token: '' }) as never)).status).toBe(403);
    verified = false;
    const ctx = context(vote());
    expect((await POST(ctx as never)).status).toBe(403);
    expect(ctx.sets).toHaveLength(0);
    secret = '';
    expect((await POST(context(vote()) as never)).status).toBe(503);
    expect(database.sqlite.query('SELECT COUNT(*) AS n FROM switch_votes').get()).toEqual({ n: 0 });
});

test('overlaps read-only session lookup and verification, then returns a single write/read batch', async () => {
    let finishVerification!: (value: boolean) => void;
    let finishLookup!: (value: typeof user) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    verification = () => new Promise(resolve => { finishVerification = resolve; });
    lookup = () => new Promise(resolve => { finishLookup = resolve; signalStarted(); });
    const batch = database.db.batch.bind(database.db);
    const sizes: number[] = [];
    database.db.batch = (statements => { sizes.push(statements.length); return batch(statements); }) as typeof database.db.batch;
    const ctx = context(vote());
    const pending = POST(ctx as never);
    await started;
    expect(verificationCalls).toBe(1);
    expect(lookupCalls).toEqual([false]);
    expect(ctx.sets).toHaveLength(0);
    expect(sizes).toEqual([]);
    finishLookup(null);
    finishVerification(true);
    expect(await (await pending).json()).toEqual({ total: 1, counts: [{ tool: 'cline', votes: 1 }], mine: 'cline' });
    expect(sizes).toEqual([3]);
    expect(lookupCalls).toEqual([false]);
    expect(ctx.sets).toHaveLength(1);
});

test('verification failure or lookup rejection never writes or creates a guest cookie', async () => {
    const batch = database.db.batch.bind(database.db);
    let batches = 0;
    database.db.batch = (statements => { batches++; return batch(statements); }) as typeof database.db.batch;
    verified = false;
    const rejected = context(vote());
    expect(await (await POST(rejected as never)).json()).toEqual({ error: 'turnstile_failed' });
    expect(lookupCalls).toEqual([false]);
    expect(rejected.sets).toHaveLength(0);
    verified = true;
    lookup = async () => { throw new Error('database unavailable'); };
    const unavailable = context(vote());
    expect((await POST(unavailable as never)).status).toBe(503);
    expect(unavailable.sets).toHaveLength(0);
    expect(batches).toBe(0);
});

test('rate limits by SHA-256 IP, before Turnstile or identity creation', async () => {
    allows = false;
    const ctx = context(vote());
    const response = await POST(ctx as never);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(limitKeys).toEqual([await hashSwitchIdentity('192.0.2.1')]);
    expect(limitKeys[0]).not.toContain('192.0.2.1');
    expect(verificationCalls).toBe(0);
    expect(ctx.sets).toHaveLength(0);
});
