import { beforeEach, describe, expect, mock, test } from 'bun:test';

let hasSession = false;
let emailVerified = 1;
let limiterSuccess = true;
let dailyAllowed = true;
let sendFails = false;
const quotaSql: string[] = [];
const sent: { to: string; subject: string; html: string; text: string }[] = [];

const database = {
    prepare(sql: string) {
        return {
            bind() {
                if (sql.includes('tool_email_daily_counts')) {
                    quotaSql.push(sql.trim().split(/\s+/)[0]!);
                    return {
                        first: async () => dailyAllowed ? { count: 2 } : null,
                        run: async () => ({ success: true, meta: { changes: 1 } }),
                    };
                }
                return {
                    first: async () => hasSession ? {
                        id: 'github:1',
                        provider: 'github',
                        provider_user_id: '1',
                        display_name: 'Ada',
                        email: 'ada@example.com',
                        avatar_url: null,
                        github_username: null,
                        email_verified: emailVerified,
                        last_seen_at: Date.now(),
                    } : null,
                    run: async () => ({ success: true, meta: { changes: 0 } }),
                };
            },
        };
    },
};

mock.module('cloudflare:workers', () => ({
    env: {
        DB: database,
        SITE_ORIGIN: 'https://ai.dosa.dev',
        TOOL_EMAIL_LIMITER: { limit: async () => ({ success: limiterSuccess }) },
    },
    waitUntil() {},
}));
mock.module('../../../../src/lib/server/email', () => ({
    sendEmail: async (message: { to: string; subject: string; html: string; text: string }) => {
        if (sendFails) throw new Error('provider down');
        sent.push(message);
        return { messageId: 'm1', dryRun: false };
    },
}));

const { POST } = await import(`../../../../src/pages/api/tools/email-result.ts?test=${Date.now()}`);

mock.restore();

beforeEach(() => {
    hasSession = true;
    emailVerified = 1;
    limiterSuccess = true;
    dailyAllowed = true;
    sendFails = false;
    quotaSql.splice(0);
    sent.splice(0);
});

const cookies = { get: () => hasSession ? { value: 'session-token' } : undefined };

function post(body: unknown, origin = 'https://ai.dosa.dev') {
    return POST({
        request: new Request('https://ai.dosa.dev/api/tools/email-result', {
            method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
        cookies,
    } as never) as Promise<Response>;
}

const validBody = { kind: 'cost-calculator', search: '?team=10&seats=cursor:Pro', content: 'Total <b>$400</b>/mo' };

describe('POST /api/tools/email-result', () => {
    test('rejects cross-origin requests', async () => {
        expect((await post(validBody, 'https://evil.example')).status).toBe(403);
    });

    test('rejects invalid bodies', async () => {
        expect((await post('{')).status).toBe(400);
        expect((await post({ ...validBody, kind: 'stacks' })).status).toBe(400);
        expect((await post({ ...validBody, content: '   ' })).status).toBe(400);
        expect((await post({ ...validBody, content: 'x'.repeat(50_001) })).status).toBe(400);
        expect(sent).toHaveLength(0);
    });

    test('requires a session', async () => {
        hasSession = false;
        expect((await post(validBody)).status).toBe(401);
        expect(sent).toHaveLength(0);
    });

    test('refuses accounts without a verified email', async () => {
        emailVerified = 0;
        const response = await post(validBody);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'email_unverified' });
        expect(sent).toHaveLength(0);
    });

    test('enforces the daily cap with a Retry-After until the next UTC day', async () => {
        dailyAllowed = false;
        const response = await post(validBody);
        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: 'daily_limit' });
        const retryAfter = Number(response.headers.get('Retry-After'));
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(24 * 60 * 60);
        expect(sent).toHaveLength(0);
    });

    test('gives the daily slot back when the provider fails', async () => {
        sendFails = true;
        expect((await post(validBody)).status).toBe(503);
        expect(quotaSql).toEqual(['INSERT', 'UPDATE']);
    });

    test('rate limits per member', async () => {
        limiterSuccess = false;
        expect((await post(validBody)).status).toBe(429);
        expect(sent).toHaveLength(0);
    });

    test('emails the result to the member with an escaped body and a link back', async () => {
        const response = await post(validBody);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ sent: true, email: 'ada@example.com' });
        expect(sent).toHaveLength(1);
        const message = sent[0]!;
        expect(message.to).toBe('ada@example.com');
        expect(message.subject).toBe('Your AI coding cost estimate');
        expect(message.html).toContain('Total &lt;b&gt;$400&lt;/b&gt;/mo');
        expect(message.html).toContain('href="https://ai.dosa.dev/tools/cost-calculator?team=10&amp;seats=cursor%3APro"');
        expect(message.text).toContain('https://ai.dosa.dev/tools/cost-calculator?team=10&seats=cursor%3APro');
        expect(message.html).not.toContain('/unsubscribe');
    });

    test('re-serializes the link query so it cannot break out of the tool URL', async () => {
        await post({ kind: 'rules-converter', search: '"><script>x</script>', content: 'rules' });
        expect(sent[0]!.text).toContain('https://ai.dosa.dev/tools/rules-converter?%22%3E%3Cscript%3Ex%3C%2Fscript%3E=');
        expect(sent[0]!.html).not.toContain('<script>');
    });
});
