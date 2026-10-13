import { describe, expect, test } from 'bun:test';
import { verifyTurnstile } from './turnstile';

function fetchReturning(status: number, json: unknown) {
    return (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
}

describe('verifyTurnstile', () => {
    test('returns true when siteverify succeeds', async () => {
        expect(await verifyTurnstile('token', 'secret', null, fetchReturning(200, { success: true }))).toBe(true);
    });

    test('returns false when siteverify reports failure', async () => {
        expect(await verifyTurnstile('token', 'secret', null, fetchReturning(200, { success: false }))).toBe(false);
    });

    test('returns false for an empty token without fetching', async () => {
        let called = false;
        const fetchImpl = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;

        expect(await verifyTurnstile('', 'secret', null, fetchImpl)).toBe(false);
        expect(await verifyTurnstile('token', '', null, fetchImpl)).toBe(false);
        expect(called).toBe(false);
    });

    test('returns false when fetch throws', async () => {
        const fetchImpl = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;

        expect(await verifyTurnstile('token', 'secret', null, fetchImpl)).toBe(false);
    });

    test('sends the remote ip when provided', async () => {
        let sentBody = '';
        const fetchImpl = (async (_url: string, init: { body: URLSearchParams }) => {
            sentBody = init.body.toString();
            return new Response(JSON.stringify({ success: true }));
        }) as unknown as typeof fetch;

        expect(await verifyTurnstile('token', 'secret', '1.2.3.4', fetchImpl)).toBe(true);
        expect(sentBody).toContain('remoteip=1.2.3.4');
    });
});
