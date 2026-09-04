import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const points: Array<{ indexes: string[]; blobs: string[] }> = [];
let hasSession = false;
const sessionRow = {
    id: 'github:1',
    provider: 'github',
    provider_user_id: '1',
    display_name: 'Test User',
    email: null,
    avatar_url: null,
    github_username: null,
    email_verified: 1,
    last_seen_at: Date.now(),
};
mock.module('cloudflare:workers', () => ({
    env: {
        DB: {
            prepare: () => ({
                bind: () => ({
                    first: async () => sessionRow,
                    run: async () => ({ success: true, meta: { changes: 0 } }),
                }),
            }),
        },
        ANALYTICS: { writeDataPoint: (point: { indexes: string[]; blobs: string[] }) => points.push(point) },
    },
}));

const { POST } = await import(`../../../src/pages/api/events.ts?test=${Date.now()}`);

afterAll(() => mock.restore());
beforeEach(() => {
    points.splice(0);
    hasSession = false;
});

const cookies = {
    get: (name: string) => name === 'aat_session' && hasSession ? { value: 'session-token' } : undefined,
};

function request(events: unknown[], origin = 'https://ai.dosa.dev') {
    return new Request('https://ai.dosa.dev/api/events', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
    });
}

describe('POST /api/events', () => {
    test('rejects cross-origin submissions', async () => {
        const response = await POST({ request: request([], 'https://example.com'), cookies } as never);
        expect(response.status).toBe(403);
    });

    test('accepts client events while dropping server-owned event names', async () => {
        const response = await POST({
            request: request([
                { event: 'signin_completed', userId: 'attacker', subject: 'ignored' },
                { event: 'gate_blocked', trigger: 'zap_btn', subject: 'cursor' },
                { event: 'not_real' },
            ]),
            cookies,
        } as never);

        expect(response.status).toBe(204);
        expect(points).toHaveLength(1);
        expect(points[0]!.indexes).toEqual(['gate_blocked']);
        expect(points[0]!.blobs[2]).toBe('');
        expect(points[0]!.blobs[4]).toBe('cursor');
    });

    test('attaches the signed-in user to zap events without trusting client data', async () => {
        hasSession = true;
        const response = await POST({
            request: request([{ event: 'zap_cast', userId: 'attacker', subject: 'anysphere-cursor' }]),
            cookies,
        } as never);

        expect(response.status).toBe(204);
        expect(points).toHaveLength(1);
        expect(points[0]!.blobs[2]).toBe('github:1');
        expect(points[0]!.blobs[8]).toBe('auth');
    });

    test('leaves zap events anonymous without a session cookie', async () => {
        const response = await POST({
            request: request([{ event: 'zap_cast', subject: 'anysphere-cursor' }]),
            cookies,
        } as never);

        expect(response.status).toBe(204);
        expect(points).toHaveLength(1);
        expect(points[0]!.blobs[2]).toBe('');
    });

    test('caps a batch at twenty events and validates subjects', async () => {
        const events = Array.from({ length: 25 }, () => ({
            event: 'outbound_click',
            subject: 'cursor',
        }));
        const response = await POST({ request: request(events), cookies } as never);

        expect(response.status).toBe(204);
        expect(points).toHaveLength(20);
        expect(points[0]!.blobs[4]).toBe('cursor');
    });

    test('does not persist arbitrary subject text', async () => {
        const response = await POST({
            request: request([{ event: 'outbound_click', subject: 'person@example.com' }]),
            cookies,
        } as never);
        expect(response.status).toBe(204);
        expect(points[0]!.blobs[4]).toBe('');
    });

    test('returns 204 for an empty batch', async () => {
        const response = await POST({ request: request([]), cookies } as never);
        expect(response.status).toBe(204);
        expect(points).toHaveLength(0);
    });
});
