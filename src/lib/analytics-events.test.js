import { describe, expect, test } from 'bun:test';
import { EVENTS, normalizeClientEvent, sanitizeAuthTrigger } from './analytics-events.js';

describe('analytics event catalog', () => {
    test('owns client eligibility, trigger, provider, and subject policy', () => {
        expect(normalizeClientEvent({
            event: EVENTS.GATE_BLOCKED,
            trigger: 'zap_btn',
            subject: 'cursor',
            provider: 'github',
        })).toMatchObject({
            event: 'gate_blocked',
            trigger: 'zap_btn',
            subject: 'cursor',
            provider: 'github',
        });
        expect(normalizeClientEvent({ event: EVENTS.SIGNIN_COMPLETED })).toBeNull();
        expect(normalizeClientEvent({ event: EVENTS.OUTBOUND_CLICK, subject: 'person@example.com' })?.subject).toBe('');
    });

    test('normalizes unknown attribution to the sidebar', () => {
        expect(sanitizeAuthTrigger('favorite_heart')).toBe('favorite_heart');
        expect(sanitizeAuthTrigger('follow_bell')).toBe('follow_bell');
        expect(sanitizeAuthTrigger('first_run')).toBe('sidebar');
    });
});
