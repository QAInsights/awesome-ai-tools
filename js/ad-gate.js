import { EVENTS } from '../src/lib/analytics-events.js';
import { AD_CLOSED_EVENT, AD_FREE_STORAGE_KEY } from '../src/lib/ethical-ads.ts';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';

/**
 * Ad gate for the floating EthicalAd (src/components/EthicalAd.astro).
 *
 *  - Signed-in members are ad-free: their session sets AD_FREE_STORAGE_KEY so
 *    later pages never load the ad client, and a slot already on the page is
 *    removed as soon as the session resolves.
 *  - When a signed-out visitor closes a filled ad, a small card offers an
 *    ad-free account, at most once per AD_PROMPT_COOLDOWN_MS.
 */

export const AD_PROMPT_STORAGE_KEY = 'aat_ad_prompt_at';
export const AD_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function shouldShowAdPrompt({ signedIn, lastShownAt, now }) {
    if (signedIn) return false;
    const last = Number(lastShownAt);
    return !Number.isFinite(last) || last <= 0 || now - last >= AD_PROMPT_COOLDOWN_MS;
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

/** Keeps the ad-free flag in step with the session and drops any ad on sign-in. */
export function syncAdFreeMember(user, { storage = globalThis.localStorage, doc = globalThis.document } = {}) {
    writeStorage(storage, AD_FREE_STORAGE_KEY, user ? '1' : '');
    if (!user) return;
    doc?.querySelectorAll?.('.ea-slot').forEach(slot => {
        slot.dataset.eaRemoved = 'member';
        slot.remove();
    });
    doc?.querySelector?.('[data-ad-prompt]')?.remove();
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function buildAdPrompt(doc, { style, onDismiss }) {
    const position = style === 'stickybox'
        ? 'bottom-5 right-5 w-[320px]'
        : 'bottom-4 left-4 right-4 sm:left-auto sm:w-[340px]';
    const card = el(doc, 'aside', `ad-prompt fixed z-40 ${position} border border-border bg-panel rounded-2xl p-4 shadow-[0_16px_48px_rgba(0,0,0,0.6)]`);
    card.setAttribute('data-ad-prompt', style);
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Browse ad-free');

    const top = el(doc, 'div', 'flex items-center justify-between gap-3');
    top.append(el(doc, 'p', 'font-mono text-[10px] uppercase tracking-[0.2em] text-gold-soft', 'Ad-free for members'));
    const close = el(doc, 'button', 'text-ink-muted hover:text-white p-1 -m-1 transition-colors shrink-0', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss ad-free offer');
    close.addEventListener('click', onDismiss);
    top.append(close);
    card.append(top);

    card.append(el(doc, 'p', 'text-[14px] font-semibold mt-2', 'Rather browse without ads?'));
    card.append(el(doc, 'p', 'text-[12.5px] text-ink-secondary leading-relaxed mt-1', 'Signed-in members never see ads. It is free with GitHub or Google, and your favorites, follows and Zaps come with you.'));

    const actions = el(doc, 'div', 'flex items-center justify-between gap-3 mt-3');
    const later = el(doc, 'button', 'font-mono text-[11px] text-ink-muted hover:text-ink-secondary transition-colors', 'Not now');
    later.type = 'button';
    later.addEventListener('click', onDismiss);
    const cta = el(doc, 'a', 'text-[13px] text-gold-soft hover:text-white transition-colors font-medium', 'Sign in free →');
    cta.href = '/?signin=1';
    cta.dataset.authTrigger = 'ad_close';
    cta.addEventListener('click', () => card.remove());
    actions.append(later, cta);
    card.append(actions);
    return card;
}

export function initAdGate({
    win = globalThis.window,
    doc = globalThis.document,
    storage = globalThis.localStorage,
    tracker = analytics,
    bindSession = () => bindAuthSession({ authManager: auth }),
    now = () => Date.now(),
} = {}) {
    const session = Promise.resolve()
        .then(bindSession)
        .then(binding => {
            binding.subscribe(({ user }) => syncAdFreeMember(user, { storage, doc }), { emitCurrent: true });
            return binding;
        })
        .catch(error => {
            console.error('[Ads] Auth initialization failed:', error);
            return null;
        });

    win.addEventListener(AD_CLOSED_EVENT, async event => {
        const style = event.detail?.style === 'stickybox' ? 'stickybox' : 'fixedfooter';
        tracker.track(EVENTS.AD_CLOSED, { trigger: style });

        const binding = await session;
        const signedIn = Boolean(binding?.current()?.user);
        const at = now();
        if (!shouldShowAdPrompt({ signedIn, lastShownAt: readStorage(storage, AD_PROMPT_STORAGE_KEY), now: at })) return;
        if (doc.querySelector('[data-ad-prompt]')) return;

        writeStorage(storage, AD_PROMPT_STORAGE_KEY, String(at));
        const prompt = buildAdPrompt(doc, {
            style,
            onDismiss: () => {
                prompt.remove();
                tracker.track(EVENTS.AD_PROMPT_DISMISSED, { trigger: style });
            },
        });
        doc.body.append(prompt);
        tracker.track(EVENTS.AD_PROMPT_SHOWN, { trigger: style });
    });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initAdGate();
}
