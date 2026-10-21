import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from './test-d1-adapter';
import { issueCode } from './email-otp';

let db: ReturnType<typeof createTestDatabase>['db'];
let sqlite: ReturnType<typeof createTestDatabase>['sqlite'];
let limiter: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
let verifyLimiter: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
let sendFailure: Error | null;
const sentCodes: Array<{ to: string; code: string }> = [];
const cookieWrites: Array<{ name: string; value: string; options: unknown }> = [];
const authErrors: string[] = [];

class EmailBindingUnavailableError extends Error {}

mock.module('./runtime-env', () => ({
    getEmailOtpLimiter: () => limiter,
    getEmailOtpVerifyLimiter: () => verifyLimiter,
    requireDatabase: () => db,
}));
mock.module('./email', () => ({
    EmailBindingUnavailableError,
    sendLoginCodeEmail: async (to: string, code: string) => {
        if (sendFailure) throw sendFailure;
        sentCodes.push({ to, code });
    },
}));
mock.module('./analytics', () => ({
    trackRequest: (_request: Request, event: string, fields: { subject?: string }) => {
        if (event === 'auth_error' && fields.subject) authErrors.push(fields.subject);
    },
}));
mock.module('./auth-attribution', () => ({
    getAuthTrigger: () => 'follow_bell',
}));

const { POST: startEmail } = await import('../../pages/api/auth/email/start.ts');
const { POST: verifyEmail } = await import('../../pages/api/auth/email/verify.ts');

afterAll(() => mock.restore());

beforeEach(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;
    limiter = { limit: async () => ({ success: true }) };
    verifyLimiter = { limit: async () => ({ success: true }) };
    sendFailure = null;
    sentCodes.length = 0;
    cookieWrites.length = 0;
    authErrors.length = 0;
});

function context(path: string, body: unknown, headers: Record<string, string> = {}) {
    const request = new Request(`https://ai.dosa.dev${path}`, {
        method: 'POST',
        headers: {
            Origin: 'https://ai.dosa.dev',
            'Content-Type': 'application/json',
            'cf-connecting-ip': '192.0.2.8',
            ...headers,
        },
        body: JSON.stringify(body),
    });
    const cookies = {
        get: () => undefined,
        set: (name: string, value: string, options: unknown) => cookieWrites.push({ name, value, options }),
    };
    return { request, cookies } as never;
}

async function responseBody(response: Response): Promise<{
    error?: string;
    user?: {
        id: string;
        provider: string;
        email: string | null;
        name: string;
        picture: string | null;
        emailVerified: boolean;
    };
}> {
    return response.json() as Promise<{
        error?: string;
        user?: {
            id: string;
            provider: string;
            email: string | null;
            name: string;
            picture: string | null;
            emailVerified: boolean;
        };
    }>;
}

function addUser({
    id,
    provider,
    providerUserId,
    email,
    verified,
    picture = null,
    lastSeen = 10,
}: {
    id: string;
    provider: string;
    providerUserId: string;
    email: string;
    verified: number;
    picture?: string | null;
    lastSeen?: number;
}) {
    sqlite.query(`
        INSERT INTO users (
            id, provider, provider_user_id, display_name, email, avatar_url,
            email_verified, created_at, updated_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, provider, providerUserId, 'Existing Name', email, picture, verified, 1, 2, lastSeen);
}

describe('email sign-in start route', () => {
    test('rejects a cross-origin request', async () => {
        const response = await startEmail(context('/api/auth/email/start', { email: 'ada@example.com' }, {
            Origin: 'https://attacker.example',
        }));

        expect(response.status).toBe(403);
        expect(sentCodes).toHaveLength(0);
        sqlite.close();
    });

    test('returns the same accepted response for known and unknown email addresses', async () => {
        addUser({
            id: 'google:42',
            provider: 'google',
            providerUserId: '42',
            email: 'ada@example.com',
            verified: 1,
        });
        const known = await startEmail(context('/api/auth/email/start', { email: 'ADA@example.com' }));
        const unknown = await startEmail(context('/api/auth/email/start', { email: 'new@example.com' }));

        expect(known.status).toBe(202);
        expect(unknown.status).toBe(202);
        expect(await responseBody(known)).toEqual(await responseBody(unknown));
        expect(sentCodes.map(item => item.to)).toEqual(['ada@example.com', 'new@example.com']);
        sqlite.close();
    });

    test('rejects invalid email and applies the client IP limiter', async () => {
        const invalid = await startEmail(context('/api/auth/email/start', { email: 'invalid' }));
        limiter = { limit: async input => {
            expect(input.key).toBe('email-otp:192.0.2.8');
            return { success: false };
        } };
        const limited = await startEmail(context('/api/auth/email/start', { email: 'ada@example.com' }));

        expect(invalid.status).toBe(400);
        expect(limited.status).toBe(429);
        expect(sentCodes).toHaveLength(0);
        sqlite.close();
    });

    test('deletes failed sends so they do not consume the email code quota', async () => {
        sendFailure = new Error('service unavailable');
        const failures = [];
        for (let index = 0; index < 3; index += 1) {
            failures.push(await startEmail(context('/api/auth/email/start', { email: 'ada@example.com' })));
        }
        sendFailure = null;
        const success = await startEmail(context('/api/auth/email/start', { email: 'ada@example.com' }));

        expect(failures.map(response => response.status)).toEqual([503, 503, 503]);
        expect(success.status).toBe(202);
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_otps WHERE email = ?').get('ada@example.com'))
            .toEqual({ count: 1 });
        expect(authErrors).toContain('send_failed');
        sqlite.close();
    });

    test('keeps an earlier code valid when a resend fails', async () => {
        const email = 'ada@example.com';
        await issueCode(db, email, Date.now() - 1_000, '123456');
        sendFailure = new Error('service unavailable');

        const failedResend = await startEmail(context('/api/auth/email/start', { email }));
        sendFailure = null;
        const verified = await verifyEmail(context('/api/auth/email/verify', { email, code: '123456' }));

        expect(failedResend.status).toBe(503);
        expect(verified.status).toBe(201);
        sqlite.close();
    });
});

describe('email sign-in verify route', () => {
    test('rejects cross-origin and malformed verification requests', async () => {
        const origin = await verifyEmail(context('/api/auth/email/verify', { email: 'ada@example.com', code: '123456' }, {
            Origin: 'https://attacker.example',
        }));
        const invalid = await verifyEmail(context('/api/auth/email/verify', { email: 'ada@example.com', code: '123' }));

        expect(origin.status).toBe(403);
        expect(invalid.status).toBe(400);
        sqlite.close();
    });

    test('applies the client IP limiter after validating the verification input', async () => {
        let limitCalls = 0;
        verifyLimiter = { limit: async input => {
            limitCalls += 1;
            expect(input.key).toBe('email-otp-verify:192.0.2.8');
            return { success: false };
        } };
        const invalid = await verifyEmail(context('/api/auth/email/verify', {
            email: 'ada@example.com',
            code: '123',
        }));
        const email = 'ada@example.com';
        await issueCode(db, email, Date.now(), '123456');
        const limited = await verifyEmail(context('/api/auth/email/verify', { email, code: '123456' }));

        expect(invalid.status).toBe(400);
        expect(limitCalls).toBe(1);
        expect(limited.status).toBe(429);
        expect(await responseBody(limited)).toEqual({ error: 'rate_limited' });
        expect(authErrors).toContain('rate_limited');
        expect(sqlite.query('SELECT consumed_at FROM email_otps WHERE email = ?').get(email))
            .toEqual({ consumed_at: null });
        sqlite.close();
    });

    test('returns 401 for invalid or expired codes and 429 after too many attempts', async () => {
        const invalid = await verifyEmail(context('/api/auth/email/verify', { email: 'ada@example.com', code: '123456' }));
        const email = 'grace@example.com';
        await issueCode(db, email, Date.now() - 700_000, '111111');
        const expired = await verifyEmail(context('/api/auth/email/verify', { email, code: '111111' }));
        const target = 'lin@example.com';
        await issueCode(db, target, Date.now(), '222222');
        sqlite.query('UPDATE email_otps SET attempts = 4 WHERE email = ?').run(target);
        const tooMany = await verifyEmail(context('/api/auth/email/verify', { email: target, code: '000000' }));

        expect(invalid.status).toBe(401);
        expect(await responseBody(invalid)).toEqual({ error: 'Invalid or expired code' });
        expect(expired.status).toBe(401);
        expect(tooMany.status).toBe(429);
        expect(await responseBody(tooMany)).toEqual({ error: 'Request a new code' });
        sqlite.close();
    });

    test('creates an email account and sets the session cookie on success', async () => {
        const email = 'ada@example.com';
        await issueCode(db, email, Date.now(), '654321');
        const response = await verifyEmail(context('/api/auth/email/verify', { email, code: '654321' }));
        const body = await responseBody(response);

        expect(response.status).toBe(201);
        expect(body.user).toMatchObject({
            provider: 'email',
            email,
            name: 'Member',
            picture: null,
            emailVerified: true,
        });
        expect(cookieWrites).toHaveLength(1);
        expect(cookieWrites[0]?.name).toBe('aat_session');
        expect(cookieWrites[0]?.value).toBeTruthy();
        expect(sqlite.query('SELECT provider, email_verified FROM users WHERE email = ?').get(email)).toEqual({
            provider: 'email',
            email_verified: 1,
        });
        sqlite.close();
    });

    test('signs into the most recently active verified identity without changing its profile', async () => {
        addUser({
            id: 'google:old',
            provider: 'google',
            providerUserId: 'old',
            email: 'ada@example.com',
            verified: 1,
            picture: 'https://example.com/old.png',
            lastSeen: 20,
        });
        addUser({
            id: 'google:recent',
            provider: 'google',
            providerUserId: 'recent',
            email: 'ADA@example.com',
            verified: 1,
            picture: 'https://example.com/recent.png',
            lastSeen: 30,
        });
        await issueCode(db, 'ada@example.com', Date.now(), '543210');
        const response = await verifyEmail(context('/api/auth/email/verify', {
            email: 'ada@example.com',
            code: '543210',
        }));
        const body = await responseBody(response);

        expect(response.status).toBe(201);
        expect(body.user).toMatchObject({
            id: 'google:recent',
            provider: 'google',
            name: 'Existing Name',
            picture: 'https://example.com/recent.png',
        });
        expect(sqlite.query("SELECT provider, display_name, avatar_url FROM users WHERE id = 'google:recent'").get())
            .toEqual({ provider: 'google', display_name: 'Existing Name', avatar_url: 'https://example.com/recent.png' });
        expect(sqlite.query("SELECT COUNT(*) AS count FROM users WHERE provider = 'email'").get()).toEqual({ count: 0 });
        sqlite.close();
    });

    test('does not link an unverified Google email identity', async () => {
        addUser({
            id: 'google:unverified',
            provider: 'google',
            providerUserId: 'unverified',
            email: 'ada@example.com',
            verified: 0,
        });
        await issueCode(db, 'ada@example.com', Date.now(), '654321');
        const response = await verifyEmail(context('/api/auth/email/verify', {
            email: 'ada@example.com',
            code: '654321',
        }));
        const body = await responseBody(response);

        expect(response.status).toBe(201);
        expect(body.user?.provider).toBe('email');
        expect(body.user?.id).toMatch(/^email:[0-9a-f]{32}$/);
        expect(sqlite.query("SELECT provider FROM users WHERE id = 'google:unverified'").get()).toEqual({
            provider: 'google',
        });
        expect(sqlite.query("SELECT COUNT(*) AS count FROM users WHERE provider = 'email'").get()).toEqual({ count: 1 });
        sqlite.close();
    });

    test('restores the code when session creation fails and rejects it after a successful retry', async () => {
        const email = 'ada@example.com';
        await issueCode(db, email, Date.now(), '654321');
        sqlite.exec(`
            CREATE TRIGGER fail_email_session BEFORE INSERT ON sessions
            BEGIN SELECT RAISE(ABORT, 'session unavailable'); END;
        `);

        const failed = await verifyEmail(context('/api/auth/email/verify', { email, code: '654321' }));
        expect(failed.status).toBe(503);
        expect(sqlite.query('SELECT consumed_at FROM email_otps WHERE email = ?').get(email))
            .toEqual({ consumed_at: null });

        sqlite.exec('DROP TRIGGER fail_email_session');
        const retried = await verifyEmail(context('/api/auth/email/verify', { email, code: '654321' }));
        const replay = await verifyEmail(context('/api/auth/email/verify', { email, code: '654321' }));

        expect(retried.status).toBe(201);
        expect(replay.status).toBe(401);
        sqlite.close();
    });
});
