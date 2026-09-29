import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { authAttribution } from './auth-attribution.js';

function currentToolSlug() {
    const match = window.location.pathname.match(/^\/tools\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
}

// Pure decision: an incoming `?ref=badge` link means a maker added the
// Featured badge to their README - count which tool it refers to.
export function badgeReferralEvent(pathname, search) {
    if (new URLSearchParams(search).get('ref') !== 'badge') return null;
    const match = pathname.match(/^\/tools\/([^/]+)\/?$/);
    const subject = match ? decodeURIComponent(match[1]) : '';
    return { trigger: subject ? 'tool_page' : 'home', subject };
}

if (typeof window !== 'undefined') {
    const referral = badgeReferralEvent(window.location.pathname, window.location.search);
    if (referral) {
        analytics.track(EVENTS.BADGE_REFERRAL, referral);
        // Strip ref so reloads/shares don't double-count the referral.
        const url = new URL(window.location.href);
        url.searchParams.delete('ref');
        window.history.replaceState(null, '', url);
    }
}

function placement(anchor) {
    if (anchor.closest('[data-compare-row]')) return 'tool_card';
    if (window.location.pathname.startsWith('/compare')) return 'comparison';
    if (window.location.pathname.startsWith('/category')) return 'category';
    if (window.location.pathname.startsWith('/tools/')) return 'tool_detail';
    return 'unknown';
}

document.addEventListener('click', event => {
    const authLink = event.target.closest?.('a[data-auth-trigger]');
    if (authLink) {
        event.preventDefault();
        authAttribution.open(authLink.dataset.authTrigger);
        return;
    }

    const anchor = event.target.closest?.('a[href^="http"]');
    if (!anchor) return;

    let url;
    try {
        url = new URL(anchor.href);
    } catch {
        return;
    }
    if (url.hostname === window.location.hostname) return;

    const row = anchor.closest('[data-compare-row]');
    const subject = row?.dataset.slug || currentToolSlug();
    if (!subject) return;
    analytics.track(EVENTS.OUTBOUND_CLICK, {
        trigger: placement(anchor),
        subject,
    });
});
