import { EVENTS, REF_SOURCES } from '../src/lib/analytics-events.js';
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

const VISIT_KEY = 'aat_visit';

function bareHost(hostname) {
    return hostname.toLowerCase().replace(/^www\./, '');
}

// Pure decision: where a new session came from. Same-site referrers count as direct.
export function visitEvent(referrer, search, ownHostname) {
    let subject = '';
    try {
        subject = referrer ? bareHost(new URL(referrer).hostname) : '';
    } catch {}
    if (subject === bareHost(ownHostname)) subject = '';
    const ref = (new URLSearchParams(search).get('ref') ?? '').trim().toLowerCase();
    const trigger = !ref ? '' : REF_SOURCES.includes(ref) ? ref : 'other';
    return { trigger, subject };
}

function isNewSession() {
    try {
        if (window.sessionStorage.getItem(VISIT_KEY)) return false;
        window.sessionStorage.setItem(VISIT_KEY, '1');
        return true;
    } catch {
        return false;
    }
}

if (typeof window !== 'undefined') {
    if (isNewSession()) {
        analytics.track(EVENTS.VISIT, visitEvent(document.referrer, window.location.search, window.location.hostname));
    }

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
