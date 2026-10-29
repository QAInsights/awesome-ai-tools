import { describe, expect, test } from 'bun:test';
import { EVENTS } from '../src/lib/analytics-events.js';
import { createAnalytics, mirrorClientEvent } from './analytics-client.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
}

const eventTarget = { addEventListener() {} };

describe('analytics client', () => {
    test('batches events and flushes at the size threshold', async () => {
        const calls = [];
        const client = createAnalytics({
            request: (...args) => { calls.push(args); return Promise.resolve(new Response(null, { status: 204 })); },
            storage: memoryStorage(),
            navigation: {},
            eventTarget,
            randomUUID: () => 'anonymous-id',
        });

        for (let index = 0; index < 10; index += 1) {
            client.track(EVENTS.OUTBOUND_CLICK, { subject: `tool-${index}` });
        }

        expect(calls).toHaveLength(1);
        const [, options] = calls[0];
        expect(options.keepalive).toBe(true);
        const payload = JSON.parse(options.body);
        expect(payload.events).toHaveLength(10);
        expect(payload.events[0].anonId).toBe('anonymous-id');
    });

    test('omits the anonymous id when privacy signals are enabled', () => {
        const calls = [];
        const client = createAnalytics({
            request: (...args) => { calls.push(args); return Promise.resolve(); },
            storage: memoryStorage(),
            navigation: { globalPrivacyControl: true },
            eventTarget,
            randomUUID: () => 'must-not-appear',
        });

        client.track(EVENTS.GATE_BLOCKED);
        client.flush();

        const payload = JSON.parse(calls[0][1].body);
        expect(payload.events[0].anonId).toBe('');
    });

    test('does not throw when the transport fails', () => {
        const client = createAnalytics({
            request: () => { throw new Error('offline'); },
            storage: memoryStorage(),
            navigation: {},
            eventTarget,
        });
        client.track(EVENTS.SIGNIN_STARTED);
        expect(() => client.flush()).not.toThrow();
    });

    test('calls the mirror with the event and fields regardless of privacy signals', () => {
        const calls = [];
        const client = createAnalytics({
            request: (...args) => { calls.push(args); return Promise.resolve(); },
            storage: memoryStorage(),
            navigation: { doNotTrack: '1' },
            eventTarget,
            mirror: (...args) => calls.push(args),
        });
        const fields = { trigger: 'tool_detail', subject: 'cursor' };

        client.track(EVENTS.OUTBOUND_CLICK, fields);
        client.flush();

        expect(calls[0]).toEqual([EVENTS.OUTBOUND_CLICK, fields]);
        expect(JSON.parse(calls[1][1].body).events[0].anonId).toBe('');
    });

    test('keeps the events queue working when the mirror throws', () => {
        const calls = [];
        const client = createAnalytics({
            request: (...args) => { calls.push(args); return Promise.resolve(); },
            storage: memoryStorage(),
            navigation: {},
            eventTarget,
            mirror() { throw new Error('mirror unavailable'); },
        });

        expect(() => client.track(EVENTS.OUTBOUND_CLICK, { subject: 'cursor' })).not.toThrow();
        expect(() => client.flush()).not.toThrow();
        expect(JSON.parse(calls[0][1].body).events).toHaveLength(1);
    });

    test('mirrors only client catalog events with normalized, allowlisted fields', () => {
        const calls = [];
        mirrorClientEvent(EVENTS.OUTBOUND_CLICK, {
            trigger: 'tool_detail',
            subject: 'cursor',
            provider: 'github',
            value: 2,
            durationMs: 25,
            email: 'private@example.com',
            anonId: 'private-id',
            unknown: 'not forwarded',
        }, (...args) => calls.push(args));
        mirrorClientEvent(EVENTS.SIGNIN_COMPLETED, { trigger: 'sidebar', email: 'private@example.com' }, (...args) => calls.push(args));

        expect(calls).toEqual([[
            EVENTS.OUTBOUND_CLICK,
            { trigger: 'tool_detail', subject: 'cursor', provider: 'github', value: 2, durationMs: 25 },
        ]]);
    });
});
