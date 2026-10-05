import { describe, expect, test } from 'bun:test';

// Module top-level touches window/document; stub them before importing.
globalThis.window = { location: { pathname: '/', search: '', hostname: 'ai.dosa.dev', href: 'https://ai.dosa.dev/' } };
globalThis.document = { addEventListener() {}, referrer: '' };

const { badgeReferralEvent, visitEvent } = await import('./site-analytics.js');

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

describe('visitEvent', () => {
    test('records the external referrer host without www', () => {
        expect(visitEvent('https://www.google.com/', '', 'ai.dosa.dev')).toEqual({ trigger: '', subject: 'google.com' });
        expect(visitEvent('https://github.com/QAInsights/awesome-ai-tools', '', 'ai.dosa.dev')).toEqual({ trigger: '', subject: 'github.com' });
    });

    test('treats missing, invalid, and same-site referrers as direct', () => {
        expect(visitEvent('', '', 'ai.dosa.dev').subject).toBe('');
        expect(visitEvent('not a url', '', 'ai.dosa.dev').subject).toBe('');
        expect(visitEvent('https://ai.dosa.dev/tools/cursor', '', 'ai.dosa.dev').subject).toBe('');
    });

    test('maps ?ref= to a known source or other', () => {
        expect(visitEvent('', '?ref=badge', 'ai.dosa.dev').trigger).toBe('badge');
        expect(visitEvent('', '?ref=Newsletter', 'ai.dosa.dev').trigger).toBe('newsletter');
        expect(visitEvent('', '?ref=producthunt', 'ai.dosa.dev').trigger).toBe('other');
        expect(visitEvent('', '?utm_source=x', 'ai.dosa.dev').trigger).toBe('');
    });
});
