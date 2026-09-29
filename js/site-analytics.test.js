import { describe, expect, test } from 'bun:test';

// Module top-level touches window/document; stub them before importing.
globalThis.window = { location: { pathname: '/', search: '', hostname: 'ai.dosa.dev', href: 'https://ai.dosa.dev/' } };
globalThis.document = { addEventListener() {} };

const { badgeReferralEvent } = await import('./site-analytics.js');

describe('badgeReferralEvent', () => {
    test('returns a tool_page event for a tool URL with ref=badge', () => {
        expect(badgeReferralEvent('/tools/cursor', '?ref=badge')).toEqual({ trigger: 'tool_page', subject: 'cursor' });
        expect(badgeReferralEvent('/tools/claude-code/', '?ref=badge&utm=x')).toEqual({ trigger: 'tool_page', subject: 'claude-code' });
    });

    test('returns a home event with empty subject outside tool pages', () => {
        expect(badgeReferralEvent('/', '?ref=badge')).toEqual({ trigger: 'home', subject: '' });
        expect(badgeReferralEvent('/category/ai-ides', '?ref=badge')).toEqual({ trigger: 'home', subject: '' });
    });

    test('returns null without ref=badge', () => {
        expect(badgeReferralEvent('/tools/cursor', '')).toBeNull();
        expect(badgeReferralEvent('/tools/cursor', '?ref=x')).toBeNull();
        expect(badgeReferralEvent('/', '?tool=cursor')).toBeNull();
    });
});
