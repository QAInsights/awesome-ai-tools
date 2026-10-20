import { EVENTS } from '../src/lib/analytics-events.js';
import { AD_FREE_STORAGE_KEY } from '../src/lib/ethical-ads.ts';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';
import { bindAuthSession } from './auth-session-binding.js';

/**
 * Browse gate for the home directory (index.astro).
 *
 * Signed-out visitors scrolling the default tool list see the first
 * BROWSE_GATE_ROW_LIMIT rows; the rest stay hidden behind a wall card
 * until they sign in. Search and category-filtered views are exempt.
 *
 *  - index.astro sets <html data-browse-gate="locked"> pre-paint when the
 *    member hint is absent so the full list never flashes. The hint is
 *    the ad-free flag (AD_FREE_STORAGE_KEY) that js/ad-gate.js keeps in
 *    sync with the session on every page.
 *  - This module then moves control to .browse-gated on #toolGrid (same
 *    CSS rule) so filtered re-renders are never clipped, inserts the
 *    wall card after the row limit, and shows a once-a-day floating
 *    nudge when the wall scrolls into view.
 *  - directory:filtered (js/modules/filter-manager.js) reports whether
 *    the grid shows the pristine list; the gate re-applies when it does.
 */

export const BROWSE_GATE_ROW_LIMIT = 30;
export const BROWSE_GATE_NUDGE_KEY = 'aat_gate_nudge_at';
export const BROWSE_GATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const BROWSE_GATE_ATTR = 'browseGate'; // <html data-browse-gate="locked">

const GATED_CLASS = 'browse-gated';
const CARD_SELECTOR = '[data-browse-gate-card]';
const NUDGE_SELECTOR = '[data-browse-gate-nudge]';

export function isDefaultDirectoryView({ query = '', category = null } = {}) {
    return !String(query || '').trim() && (!category || category === 'all');
}

export function shouldGateDirectory({ signedIn, defaultView }) {
    return !signedIn && Boolean(defaultView);
}

export function shouldShowGateNudge({ signedIn, lastShownAt, now }) {
    if (signedIn) return false;
    const last = Number(lastShownAt);
    return !Number.isFinite(last) || last <= 0 || now - last >= BROWSE_GATE_COOLDOWN_MS;
}

function readStorage(storage, key) {
    try {
        return storage?.getItem(key) ?? '';
    } catch {
        return '';
    }
}

function writeStorage(storage, key, value) {
    try {
        if (value) storage?.setItem(key, value);
        else storage?.removeItem(key);
    } catch {}
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function totalTools(doc) {
    try {
        const seed = doc.getElementById('tools-data');
        if (seed) {
            const parsed = JSON.parse(seed.textContent || '[]');
            if (Array.isArray(parsed) && parsed.length) return parsed.length;
        }
    } catch {}
    return doc.getElementById('toolGrid')?.querySelectorAll?.('[data-compare-row]')?.length || 0;
}

/** The wall card rendered after BROWSE_GATE_ROW_LIMIT rows. */
export function buildGateCard(doc, { total, limit, onSignIn }) {
    const card = el(doc, 'aside',
        'browse-gate-card my-4 md:my-6 rounded-3xl border border-[#3a2d1a] ' +
        'bg-[linear-gradient(180deg,rgba(214,183,122,0.09),rgba(214,183,122,0.02))] ' +
        'px-6 py-8 md:px-10 md:py-10 flex flex-col items-start gap-4');
    card.setAttribute('data-browse-gate-card', '');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Members unlock the full index');

    card.append(el(doc, 'p',
        'font-mono text-[11px] uppercase tracking-[0.22em] text-[#e2c48a] m-0',
        'Members unlock the full index'));

    card.append(el(doc, 'p',
        'text-[22px] md:text-[28px] font-semibold text-white leading-tight tracking-tight m-0',
        `${total} tools curated by hand. You have seen ${limit}.`));

    card.append(el(doc, 'p',
        'text-[15px] text-[#a3a3a3] leading-relaxed m-0 max-w-[640px]',
        'Sign in free to browse every entry ad-free and keep your favorites, follows, Zaps and stacks in sync across devices.'));

    card.append(el(doc, 'p',
        'font-mono text-[11px] uppercase tracking-[0.18em] text-[#737373] m-0',
        'Full index · Ad-free · Favorites · Follows · Zaps · Stacks'));

    const cta = el(doc, 'button',
        'cursor-pointer rounded-full border border-[#f0d08f] ' +
        'bg-[linear-gradient(180deg,#f1d99f,#d6b77a)] px-5 py-2.5 text-sm font-semibold text-[#2d1d0b] ' +
        'transition-all duration-300 hover:-translate-y-px hover:border-[#f4ddb0] ' +
        'hover:bg-[linear-gradient(180deg,#f5dfae,#e0c184)]',
        'Sign in free');
    cta.type = 'button';
    cta.addEventListener('click', onSignIn);
    card.append(cta);

    card.append(el(doc, 'p',
        'font-mono text-[11px] text-[#525252] m-0',
        'GitHub or Google · free forever · no subscription'));

    return card;
}

/** The floating, dismissible nudge shown when the wall scrolls into view. */
export function buildGateNudge(doc, { total, limit, onSignIn, onDismiss }) {
    const card = el(doc, 'aside',
        'browse-gate-nudge fixed z-40 bottom-4 left-4 right-4 sm:left-auto sm:bottom-5 sm:right-5 sm:w-[340px] ' +
        'border border-[#3a2d1a] bg-[#0d0b08] rounded-2xl p-4 shadow-[0_16px_48px_rgba(0,0,0,0.6)]');
    card.setAttribute('data-browse-gate-nudge', '');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Unlock the full index');

    const top = el(doc, 'div', 'flex items-center justify-between gap-3');
    top.append(el(doc, 'p', 'font-mono text-[10px] uppercase tracking-[0.2em] text-[#e2c48a] m-0', 'You hit the free limit'));
    const close = el(doc, 'button', 'text-[#737373] hover:text-white p-1 -m-1 transition-colors shrink-0', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss unlock offer');
    close.addEventListener('click', onDismiss);
    top.append(close);
    card.append(top);

    card.append(el(doc, 'p', 'text-[14px] font-semibold mt-2 m-0', `${limit} of ${total} tools shown`));
    card.append(el(doc, 'p', 'text-[12.5px] text-[#a3a3a3] leading-relaxed mt-1 m-0',
        'Members browse the full index ad-free. Free with GitHub or Google, and your favorites, follows and Zaps come with you.'));

    const actions = el(doc, 'div', 'flex items-center justify-between gap-3 mt-3');
    const later = el(doc, 'button', 'font-mono text-[11px] text-[#737373] hover:text-[#a3a3a3] transition-colors', 'Not now');
    later.type = 'button';
    later.addEventListener('click', onDismiss);
    const cta = el(doc, 'button', 'text-[13px] text-[#e2c48a] hover:text-white transition-colors font-medium', 'Sign in free →');
    cta.type = 'button';
    cta.addEventListener('click', onSignIn);
    actions.append(later, cta);
    card.append(actions);
    return card;
}

/**
 * Default visibility observer: the grid scrolls inside .registry on
 * desktop; on mobile the registry is overflow:visible so the viewport
 * is the root (same convention as js/renderer.js).
 */
function defaultObserverFactory(doc, win) {
    return (target, onVisible) => {
        const registry = doc.querySelector('.registry');
        const root = win.innerWidth <= 768 ? null : registry;
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.disconnect();
                onVisible();
            });
        }, { root, rootMargin: '0px' });
        observer.observe(target);
        return () => observer.disconnect();
    };
}

export function initBrowseGate({
    win = globalThis.window,
    doc = globalThis.document,
    storage = globalThis.localStorage,
    tracker = analytics,
    attribution = authAttribution,
    bindSession = () => bindAuthSession({ authManager: auth }),
    observe = defaultObserverFactory(globalThis.document, globalThis.window),
    watchGrid = (target, cb) => {
        const watcher = new MutationObserver(cb);
        watcher.observe(target, { childList: true });
        return () => watcher.disconnect();
    },
    now = () => Date.now(),
} = {}) {
    const grid = doc?.getElementById?.('toolGrid');
    if (!grid) return;

    let signedIn = false;
    let defaultView = isDefaultDirectoryView({
        query: new URLSearchParams(win.location?.search || '').get('q') || '',
    });
    let card = null;
    let nudge = null;
    let unobserveCard = null;
    let unwatchGrid = null;
    let wallTracked = false;
    let positioning = false;

    const total = totalTools(doc);

    // Pre-paint the inline script hid the rows via <html data-browse-gate>;
    // the module owns the gate from here via .browse-gated on the grid so
    // filtered re-renders are never clipped.
    const memberHint = readStorage(storage, AD_FREE_STORAGE_KEY) === '1';
    if (defaultView && !memberHint) grid.classList.add(GATED_CLASS);
    if (doc.documentElement?.dataset) delete doc.documentElement.dataset[BROWSE_GATE_ATTR];

    function onSignIn() {
        attribution.open('browse_gate');
        // The header trigger's click listener is only bound inside the
        // deferred bootstrap, so a CTA click before it lands is a no-op.
        // If the modal did not open synchronously, fall back to the
        // ?signin=1 deep link, which app.js honours once auth is ready.
        const modal = doc.getElementById?.('signInModal');
        if (!modal || modal.classList.contains('hidden')) {
            win.location.href = '/?signin=1';
        }
    }

    // The wall must sit right after the last free row. Lazy batches append
    // rows at the grid end, so the card is re-pinned on every childList
    // change (MutationObserver): before row 31 when it exists, at the end
    // otherwise (the hidden sentinel and hidden rows take no space).
    function positionCard() {
        if (!card || positioning) return;
        const rows = grid.querySelectorAll('[data-compare-row]');
        const anchor = rows[BROWSE_GATE_ROW_LIMIT] || null;
        positioning = true;
        try {
            if (anchor) {
                if (card.nextElementSibling !== anchor) grid.insertBefore(card, anchor);
            } else if (card.parentNode !== grid || grid.children[grid.children.length - 1] !== card) {
                grid.appendChild(card);
            }
        } finally {
            positioning = false;
        }
    }

    function ensureCard() {
        // renderTools() rebuilds the grid with innerHTML = '', which detaches
        // the previous card; re-create when it is no longer in the grid.
        if (card && card.parentNode === grid) {
            positionCard();
            return;
        }
        unobserveCard?.();
        card = buildGateCard(doc, { total, limit: BROWSE_GATE_ROW_LIMIT, onSignIn });
        positionCard();
        unobserveCard = observe(card, onWallVisible);
        unwatchGrid ??= watchGrid(grid, positionCard);
    }

    function removeCard() {
        unobserveCard?.();
        unobserveCard = null;
        unwatchGrid?.();
        unwatchGrid = null;
        card?.remove?.();
        card = null;
    }

    function removeNudge() {
        nudge?.remove?.();
        nudge = null;
    }

    function removeGate() {
        grid.classList.remove(GATED_CLASS);
        removeCard();
        removeNudge();
    }

    function onWallVisible() {
        if (!wallTracked) {
            wallTracked = true;
            tracker.track(EVENTS.GATE_BLOCKED, { trigger: 'browse_gate' });
        }
        maybeShowNudge();
    }

    function maybeShowNudge() {
        // The ad-close prompt owns the same corner and removes the nudge
        // node directly; drop the stale reference so state stays honest.
        if (nudge && nudge.parentNode !== doc.body) nudge = null;
        if (nudge) return;
        if (doc.querySelector(NUDGE_SELECTOR) || doc.querySelector('[data-ad-prompt]')) return;
        const at = now();
        if (!shouldShowGateNudge({ signedIn, lastShownAt: readStorage(storage, BROWSE_GATE_NUDGE_KEY), now: at })) return;

        writeStorage(storage, BROWSE_GATE_NUDGE_KEY, String(at));
        nudge = buildGateNudge(doc, {
            total,
            limit: BROWSE_GATE_ROW_LIMIT,
            onSignIn,
            onDismiss: () => {
                removeNudge();
                tracker.track(EVENTS.BROWSE_GATE_DISMISSED, { trigger: 'nudge' });
            },
        });
        doc.body.append(nudge);
        tracker.track(EVENTS.BROWSE_GATE_SHOWN, { trigger: 'nudge' });
    }

    function sync() {
        if (!shouldGateDirectory({ signedIn, defaultView })) {
            removeGate();
            return;
        }
        grid.classList.add(GATED_CLASS);
        ensureCard();
    }

    Promise.resolve()
        .then(bindSession)
        .then(binding => {
            binding.subscribe(({ user }) => {
                signedIn = Boolean(user);
                sync();
            }, { emitCurrent: true });
        })
        .catch(error => {
            console.error('[Gate] Auth initialization failed:', error);
        });

    doc.addEventListener('directory:filtered', event => {
        defaultView = isDefaultDirectoryView({
            query: event.detail?.query,
            category: event.detail?.category,
        });
        sync();
    });

    // Gate the SSR list immediately for presumed visitors (hint absent).
    if (!memberHint) sync();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initBrowseGate();
}
