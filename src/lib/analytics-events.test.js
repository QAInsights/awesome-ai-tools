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

    test('accepts onboarding events with whitelisted triggers and step subjects', () => {
        expect(normalizeClientEvent({
            event: EVENTS.ONBOARDING_SHOWN,
            trigger: 'float',
        })).toMatchObject({ event: 'onboarding_shown', trigger: 'float', subject: '' });

        expect(normalizeClientEvent({
            event: EVENTS.ONBOARDING_STEP_COMPLETED,
            trigger: 'inline',
            subject: 'favorites',
        })).toMatchObject({ event: 'onboarding_step_completed', trigger: 'inline', subject: 'favorites' });

        expect(normalizeClientEvent({
            event: EVENTS.ONBOARDING_DISMISSED,
            trigger: 'modal',
            subject: 'cursor',
        })).toMatchObject({ event: 'onboarding_dismissed', trigger: '', subject: '' });

        expect(normalizeClientEvent({
            event: EVENTS.ONBOARDING_STEP_COMPLETED,
            trigger: 'unknown',
            subject: 'vote_stuffing',
        })?.subject).toBe('');
    });
});
