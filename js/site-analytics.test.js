import { describe, expect, mock, test } from 'bun:test';

// Module top-level touches window/document; stub them before importing.
let handleClick;
const clickSignIn = mock(() => {});
globalThis.window = { location: { pathname: '/', search: '', hostname: 'ai.dosa.dev', href: 'https://ai.dosa.dev/' } };
globalThis.document = {
    addEventListener(type, listener) {
        if (type === 'click') handleClick = listener;
    },
    getElementById(id) {
        if (id === 'signInTriggerBtn') return { click: clickSignIn };
        if (id === 'signInModal') return {};
        return null;
    },
    querySelectorAll: () => [],
    referrer: '',
};

const { badgeReferralEvent, visitEvent } = await import('./site-analytics.js');

test('a workflow guide button opens the existing sign-in modal', () => {
    const cta = { dataset: { authTrigger: 'workflow_guide' } };
    const preventDefault = mock(() => {});
    handleClick({
        target: { closest: selector => selector === '[data-auth-trigger]' ? cta : null },
        preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(clickSignIn).toHaveBeenCalledTimes(1);
});

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
        expect(visitEvent('', '?ref=tool_share', 'ai.dosa.dev').trigger).toBe('tool_share');
        expect(visitEvent('', '?ref=category_share', 'ai.dosa.dev').trigger).toBe('category_share');
        expect(visitEvent('', '?ref=producthunt', 'ai.dosa.dev').trigger).toBe('other');
        expect(visitEvent('', '?utm_source=x', 'ai.dosa.dev').trigger).toBe('');
    });
});
