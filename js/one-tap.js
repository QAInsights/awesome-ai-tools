import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';

const ONE_TAP_SKIPPED_PATHS = ['/admin', '/settings', '/unsubscribe'];

export function shouldOfferOneTap({ pathname = '', signedIn = false, modalOpen = false, signInRequested = false } = {}) {
    if (signedIn || modalOpen || signInRequested) return false;
    return !ONE_TAP_SKIPPED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

/** Loaded on every BaseLayout page; shares the single auth initialization with the page entry points. */
export async function initOneTap({ doc = document, loc = location, authManager = auth, bind = bindAuthSession } = {}) {
    // Read before awaiting: the home entry strips `?signin` once it opens the modal.
    const signInRequested = new URLSearchParams(loc.search).has('signin');
    await bind({ authManager, root: doc });
    const modal = doc.getElementById('signInModal');
    const eligible = shouldOfferOneTap({
        pathname: loc.pathname,
        signedIn: authManager.isAuthenticated(),
        modalOpen: Boolean(modal && !modal.classList.contains('hidden')),
        signInRequested,
    });
    return eligible ? authManager.showOneTap() : false;
}

if (typeof document !== 'undefined') {
    initOneTap().catch(error => console.error('[Auth] One Tap unavailable:', error));
}
