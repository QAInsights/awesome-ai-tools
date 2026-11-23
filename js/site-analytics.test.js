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

const { badgeReferralEvent, visitEvent, outboundProperties, shareVisitProperties, recordShareVisit } = await import('./site-analytics.js');

test('records each shared page only once per browser session', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const captureEvent = mock(() => {});
    const options = { storage, captureEvent };
    expect(recordShareVisit('/tools/cursor', '?ref=tool_share', options)).toBe(true);
    expect(recordShareVisit('/tools/cursor/', '?ref=tool_share&utm_medium=chat', options)).toBe(false);
    expect(recordShareVisit('/tools/claude', '?ref=tool_share', options)).toBe(true);
    expect(recordShareVisit('/tools/other', '', options)).toBe(false);
    expect(captureEvent).toHaveBeenCalledTimes(2);
    values.clear();
    expect(recordShareVisit('/tools/cursor', '?ref=tool_share', options)).toBe(true);
});

test('does not throw or repeatedly capture when session storage is blocked', () => {
    const captureEvent = mock(() => {});
    expect(recordShareVisit('/tools/cursor', '?ref=tool_share', {
        storage: { getItem() { throw new Error('blocked'); } }, captureEvent,
    })).toBe(false);
    expect(captureEvent).not.toHaveBeenCalled();
});

test('outbound captures tool, destination and source on cards and tool pages', () => {
    const anchor = { href: 'https://cursor.com/download', closest: () => ({ dataset: { slug: 'cursor' } }) };
    expect(outboundProperties(anchor, window.location)).toEqual({ tool: 'cursor', url: anchor.href, destination_host: 'cursor.com', source_path: '/', $pathname: '/' });
    expect(outboundProperties({ ...anchor, closest: () => null }, { ...window.location, pathname: '/tools/cursor' }).tool).toBe('cursor');
    expect(outboundProperties({ ...anchor, href: 'invalid' }, window.location)).toBeNull();
    expect(outboundProperties({ ...anchor, closest: () => null }, window.location)).toBeNull();
    expect(outboundProperties({ ...anchor, href: 'https://ai.dosa.dev/tools/cursor' }, window.location)).toBeNull();
});

test('share visits record shipped refs even mid-session, with medium and page', () => {
    expect(shareVisitProperties('/tools/cursor', '?ref=tool_share')).toEqual({ share_ref: 'tool_share', share_medium: 'copy_link', source_path: '/tools/cursor', $pathname: '/tools/cursor' });
    expect(shareVisitProperties('/category/ides', '?ref=category_share&utm_medium=chat').share_medium).toBe('chat');
    expect(shareVisitProperties('/', '')).toBeNull();
    expect(shareVisitProperties('/', '?ref=invalid')).toBeNull();
});

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
