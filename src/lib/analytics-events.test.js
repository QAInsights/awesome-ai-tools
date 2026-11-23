import { describe, expect, test } from 'bun:test';
import { EVENTS, normalizeClientEvent, sanitizeAuthTrigger } from './analytics-events.js';

describe('analytics event catalog', () => {
    test('allowlists switch votes and normalizes source, destination and action', () => {
        for (const action of ['set', 'change', 'undo']) expect(normalizeClientEvent({ event: EVENTS.SWITCH_VOTE, subject: 'cursor', target: 'cline', action })).toMatchObject({ subject: 'cursor', target: 'cline', action });
        expect(normalizeClientEvent({ event: EVENTS.SWITCH_VOTE, subject: 'invalid@text', target: 'https://example.com', action: 'delete' })).toMatchObject({ subject: '', target: '', action: '' });
        expect(normalizeClientEvent({ event: EVENTS.VISIT, trigger: 'switch_share' })?.trigger).toBe('switch_share');
    });
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
        expect(sanitizeAuthTrigger('stack_add')).toBe('stack_add');
        expect(sanitizeAuthTrigger('ad_close')).toBe('ad_close');
        expect(sanitizeAuthTrigger('news_cta')).toBe('news_cta');
        expect(sanitizeAuthTrigger('directory_cta')).toBe('directory_cta');
        expect(sanitizeAuthTrigger('first_run')).toBe('sidebar');
    });

    test('guest favorites metrics do not capture tool slugs', () => {
        expect(normalizeClientEvent({ event: EVENTS.GUEST_FAVORITE_ADDED, subject: 'cursor' }))
            .toMatchObject({ event: 'guest_favorite_added', subject: '' });
        expect(normalizeClientEvent({ event: EVENTS.GUEST_FAVORITES_IMPORTED })).toBeNull();
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

    test('attributes sign-up starts to the workflow guide CTA', () => {
        expect(sanitizeAuthTrigger('workflow_guide')).toBe('workflow_guide');
        expect(normalizeClientEvent({ event: EVENTS.SIGNIN_STARTED, trigger: 'workflow_guide', provider: 'github' }))
            .toMatchObject({ trigger: 'workflow_guide', provider: 'github' });
    });

    test('accepts ad-close prompt events keyed by ad style', () => {
        expect(normalizeClientEvent({ event: EVENTS.AD_CLOSED, trigger: 'stickybox', subject: 'cursor' }))
            .toMatchObject({ event: 'ad_closed', trigger: 'stickybox', subject: '' });
        expect(normalizeClientEvent({ event: EVENTS.AD_PROMPT_SHOWN, trigger: 'fixedfooter' })?.trigger).toBe('fixedfooter');
        expect(normalizeClientEvent({ event: EVENTS.AD_PROMPT_DISMISSED, trigger: 'banner' })?.trigger).toBe('');
    });

    test('accepts visit events with a referrer host and ref source', () => {
        expect(normalizeClientEvent({ event: EVENTS.VISIT, trigger: 'badge', subject: 'GitHub.com' }))
            .toMatchObject({ event: 'visit', trigger: 'badge', subject: 'github.com' });
        expect(normalizeClientEvent({ event: EVENTS.VISIT, trigger: 'spam', subject: 'https://x.com/path' }))
            .toMatchObject({ event: 'visit', trigger: '', subject: '' });
        expect(normalizeClientEvent({ event: EVENTS.VISIT, subject: 'localhost' })?.subject).toBe('');
    });

    test('records directory link copies and visits without accepting URLs as subjects', () => {
        expect(normalizeClientEvent({ event: EVENTS.DIRECTORY_LINK_COPIED, trigger: 'tool_share', subject: 'cursor' }))
            .toMatchObject({ event: 'directory_link_copied', trigger: 'tool_share', subject: 'cursor' });
        expect(normalizeClientEvent({ event: EVENTS.DIRECTORY_LINK_COPIED, trigger: 'other', subject: 'https://x.com/' }))
            .toMatchObject({ trigger: '', subject: '' });
        expect(normalizeClientEvent({ event: EVENTS.VISIT, trigger: 'category_share' })?.trigger).toBe('category_share');
    });
});
