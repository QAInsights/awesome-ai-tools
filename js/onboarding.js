import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';
import { subscribeFavorites } from './favorites.js';
import { subscribeFollows } from './follows.js';

/**
 * Post-signup onboarding checklist: ★ favorite 3 tools → 🔔 follow 1 tool →
 * 🤖 get your badge. Progress lives server-side (`/api/onboarding`); favorite
 * and follow counts are refreshed live from the shared client stores.
 *
 * Surfaces:
 *  - inline card  → any page rendering <OnboardingChecklist /> (/favorites, /zap)
 *  - floating card → the directory (/) and tool pages, where the actions happen
 *  - /badge completes the badge step via completeBadgeStep() in badge-page.js
 */

export const STEP_FAVORITES = 'favorites';
export const STEP_FOLLOWS = 'follows';
export const STEP_BADGE = 'badge';
export const ONBOARDING_STEPS = Object.freeze([STEP_FAVORITES, STEP_FOLLOWS, STEP_BADGE]);

export const FAVORITES_TARGET = 3;
export const FOLLOWS_TARGET = 1;

const CELEBRATION_COPY = Object.freeze({
    eyebrow: 'All done',
    headline: "You're all set 🤖",
    subline: 'Account activated. Pin your badge to a README and keep zapping.',
    ctaLabel: 'Grab your badge',
    ctaHref: '/badge',
});

const DEFAULT_COPY = Object.freeze({
    eyebrow: 'Get started',
    headline: 'Set up your account',
    subline: 'Three quick steps to get the most out of ai.dosa.dev.',
});

function clampCount(value) {
    const count = Math.trunc(Number(value));
    return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Coerce a server payload into a safe onboarding state shape. */
export function normalizeState(input) {
    if (!input || typeof input !== 'object') return null;
    return {
        favoritesCount: clampCount(input.favoritesCount),
        followsCount: clampCount(input.followsCount),
        favoritesTarget: Number(input.favoritesTarget) || FAVORITES_TARGET,
        followsTarget: Number(input.followsTarget) || FOLLOWS_TARGET,
        badgeCompleted: input.badgeCompletedAt != null,
        dismissed: input.dismissedAt != null,
        completed: Boolean(input.completed),
    };
}

/** Which checklist steps are done for a normalized state. */
export function stepCompletion(state) {
    if (!state) return { [STEP_FAVORITES]: false, [STEP_FOLLOWS]: false, [STEP_BADGE]: false };
    return {
        [STEP_FAVORITES]: state.favoritesCount >= (state.favoritesTarget || FAVORITES_TARGET),
        [STEP_FOLLOWS]: state.followsCount >= (state.followsTarget || FOLLOWS_TARGET),
        [STEP_BADGE]: Boolean(state.badgeCompleted),
    };
}

/** Steps that flipped from incomplete → complete between two states. */
export function newlyCompletedSteps(before, after) {
    const next = stepCompletion(after);
    if (!before) return [];
    const previous = stepCompletion(before);
    return ONBOARDING_STEPS.filter(step => !previous[step] && next[step]);
}

/** Where the checklist may appear: inline mount wins, then allow-listed paths. */
export function resolveSurface({ pathname = '/', hasInlineRoot = false } = {}) {
    if (hasInlineRoot) return 'inline';
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path.startsWith('/tools/')) return 'float';
    return null;
}

/** Pure state → view model used by both the inline card and the float. */
export function buildViewModel(state, { celebrating = false } = {}) {
    if (!state) return null;
    const completion = stepCompletion(state);
    const favoritesShown = Math.min(state.favoritesCount, FAVORITES_TARGET);
    const followsShown = Math.min(state.followsCount, FOLLOWS_TARGET);
    const steps = [
        {
            id: STEP_FAVORITES,
            glyph: '★',
            title: `Favorite ${FAVORITES_TARGET} tools`,
            detail: `${favoritesShown}/${FAVORITES_TARGET}`,
            done: completion[STEP_FAVORITES],
            ctaLabel: 'Browse tools',
            ctaHref: '/',
        },
        {
            id: STEP_FOLLOWS,
            glyph: '🔔',
            title: `Follow ${FOLLOWS_TARGET} tool`,
            detail: `${followsShown}/${FOLLOWS_TARGET}`,
            done: completion[STEP_FOLLOWS],
            ctaLabel: 'Follow from the directory',
            ctaHref: '/',
        },
        {
            id: STEP_BADGE,
            glyph: '🤖',
            title: 'Get your badge',
            detail: completion[STEP_BADGE] ? 'Done' : 'Reward',
            done: completion[STEP_BADGE],
            ctaLabel: 'Get your badge',
            ctaHref: '/badge',
        },
    ];
    const doneCount = steps.filter(step => step.done).length;
    const copy = celebrating ? CELEBRATION_COPY : DEFAULT_COPY;
    return {
        celebrating,
        visible: !state.dismissed && (!state.completed || celebrating),
        ...copy,
        steps,
        doneCount,
        total: steps.length,
        progressLabel: `${doneCount} of ${steps.length} done`,
        percent: Math.round((doneCount / steps.length) * 100),
    };
}

/** Minimal API client for /api/onboarding. Returns null on 401 (signed out). */
export function createOnboardingClient({ request = globalThis.fetch } = {}) {
    async function read() {
        const response = await request('/api/onboarding', {
            headers: { Accept: 'application/json' },
        });
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(`Onboarding read failed: ${response.status}`);
        const payload = await response.json();
        return normalizeState(payload?.onboarding);
    }

    async function post(action) {
        const response = await request('/api/onboarding', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action }),
        });
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(`Onboarding update failed: ${response.status}`);
        const payload = await response.json();
        return normalizeState(payload?.onboarding);
    }

    return {
        read,
        dismiss: () => post('dismiss'),
        completeBadge: () => post('badge_completed'),
    };
}

/**
 * State machine for the checklist. Owns server state, live store counts,
 * step-completion analytics, one-time celebration, and dismissal. UI changes
 * flow through `onUpdate(viewModel | null)` so any view can render it.
 */
export function createOnboardingController({
    client = createOnboardingClient(),
    tracker = analytics,
    onUpdate = () => {},
} = {}) {
    let serverState = null;
    let surface = 'inline';
    let celebrated = false;
    let seeded = false;
    let shownTracked = false;
    const live = { favorites: null, follows: null };
    const firedSteps = new Set();

    function effectiveState() {
        if (!serverState) return null;
        return {
            ...serverState,
            favoritesCount: live.favorites ?? serverState.favoritesCount,
            followsCount: live.follows ?? serverState.followsCount,
        };
    }

    function fireStepEvents(previous, current) {
        newlyCompletedSteps(previous, current).forEach(step => {
            if (firedSteps.has(step)) return;
            firedSteps.add(step);
            tracker.track(EVENTS.ONBOARDING_STEP_COMPLETED, { trigger: surface, subject: step });
        });
    }

    function maybeCelebrate(current) {
        if (!current || celebrated) return;
        const completion = stepCompletion(current);
        if (ONBOARDING_STEPS.every(step => completion[step])) celebrated = true;
    }

    function present() {
        const state = effectiveState();
        const view = state ? buildViewModel(state, { celebrating: celebrated }) : null;
        if (view?.visible && !shownTracked) {
            shownTracked = true;
            tracker.track(EVENTS.ONBOARDING_SHOWN, { trigger: surface });
        }
        onUpdate(view);
    }

    function applyServerState(next, { fire = true } = {}) {
        const previous = effectiveState();
        serverState = next;
        if (!next) {
            live.favorites = null;
            live.follows = null;
            present();
            return next;
        }
        const current = effectiveState();
        if (!seeded) {
            // First load: steps already complete happened in the past — no events.
            seeded = true;
            const completion = stepCompletion(current);
            ONBOARDING_STEPS.forEach(step => {
                if (completion[step]) firedSteps.add(step);
            });
        } else if (fire) {
            fireStepEvents(previous, current);
        }
        maybeCelebrate(current);
        present();
        return current;
    }

    function setLiveCounts(counts) {
        if (!serverState || !counts) return;
        const previous = effectiveState();
        if (Number.isFinite(Number(counts.favorites))) live.favorites = clampCount(counts.favorites);
        if (Number.isFinite(Number(counts.follows))) live.follows = clampCount(counts.follows);
        const current = effectiveState();
        fireStepEvents(previous, current);
        maybeCelebrate(current);
        present();
    }

    async function refresh() {
        try {
            return applyServerState(await client.read());
        } catch {
            return null;
        }
    }

    function dismiss() {
        if (serverState) serverState = { ...serverState, dismissed: true };
        tracker.track(EVENTS.ONBOARDING_DISMISSED, { trigger: surface });
        present();
        return client.dismiss()
            .then(state => {
                if (state) applyServerState(state, { fire: false });
            })
            .catch(() => {});
    }

    async function completeBadge() {
        try {
            return applyServerState(await client.completeBadge());
        } catch {
            return null;
        }
    }

    function handleSignedOut() {
        serverState = null;
        seeded = false;
        celebrated = false;
        live.favorites = null;
        live.follows = null;
        present();
    }

    return {
        refresh,
        dismiss,
        completeBadge,
        setLiveCounts,
        handleSignedOut,
        setSurface(next) {
            surface = next;
        },
        getState: effectiveState,
        isCelebrating: () => celebrated,
    };
}

/**
 * Standalone badge-step hook used by the badge page: completes the step when a
 * visitor copies a snippet, without mounting any checklist UI.
 */
export async function completeBadgeStep({ client = createOnboardingClient(), tracker = analytics } = {}) {
    try {
        const state = await client.completeBadge();
        if (state?.badgeCompleted) {
            tracker.track(EVENTS.ONBOARDING_STEP_COMPLETED, { trigger: 'unknown', subject: STEP_BADGE });
        }
        return state;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* DOM view — tokens per DESIGN.md (bg-panel, border-border, gold)     */
/* ------------------------------------------------------------------ */

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function progressTrack(doc, view) {
    const track = el(doc, 'div', 'h-1.5 rounded-full bg-white/10 overflow-hidden');
    const fill = el(doc, 'div', 'h-full bg-gold rounded-full transition-all duration-300');
    fill.style.width = `${view.percent}%`;
    fill.setAttribute('role', 'progressbar');
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', '100');
    fill.setAttribute('aria-valuenow', String(view.percent));
    track.append(fill);
    return track;
}

function dismissButton(doc, { onDismiss, label = 'Dismiss onboarding checklist' }) {
    const button = el(doc, 'button', 'text-ink-muted hover:text-white p-1 -m-1 transition-colors shrink-0', '✕');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = 'Dismiss';
    button.addEventListener('click', onDismiss);
    return button;
}

function buildCelebrationCard(doc, view, handlers) {
    const card = el(doc, 'section', 'border border-gold/50 bg-panel rounded-xl overflow-hidden');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Account setup complete');

    const header = el(doc, 'div', 'flex items-start justify-between gap-3 px-5 pt-5');
    const heading = el(doc, 'div');
    heading.append(
        el(doc, 'p', 'font-mono text-[10px] uppercase tracking-[0.2em] text-gold', view.eyebrow),
        el(doc, 'h2', 'text-[18px] font-semibold tracking-tight mt-1.5', view.headline),
        el(doc, 'p', 'text-[14px] text-ink-secondary mt-1', view.subline),
    );
    header.append(heading, dismissButton(doc, { ...handlers, label: 'Dismiss activation card' }));
    card.append(header);

    const reward = el(doc, 'div', 'flex flex-wrap items-center gap-4 px-5 py-5');
    reward.append(el(doc, 'span', 'text-[32px] leading-none', '🤖'));
    const cta = el(doc, 'a', 'inline-flex items-center py-2.5 px-5 bg-gradient-to-r from-gold-hi to-gold-lo text-black text-sm font-semibold rounded-full hover:-translate-y-px transition-all active:scale-[0.98]', view.ctaLabel);
    cta.href = view.ctaHref;
    const secondary = el(doc, 'a', 'text-[13px] text-gold-soft hover:text-white transition-colors', 'View favorites →');
    secondary.href = '/favorites';
    reward.append(cta, secondary);
    card.append(reward);
    return card;
}

function buildCard(doc, view, handlers) {
    if (view.celebrating) return buildCelebrationCard(doc, view, handlers);

    const card = el(doc, 'section', 'border border-border bg-panel rounded-xl overflow-hidden');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Account setup');

    const header = el(doc, 'div', 'flex items-start justify-between gap-3 px-5 pt-5');
    const heading = el(doc, 'div');
    heading.append(
        el(doc, 'p', 'font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted', view.eyebrow),
        el(doc, 'h2', 'text-[18px] font-semibold tracking-tight mt-1.5', view.headline),
        el(doc, 'p', 'text-[14px] text-ink-secondary mt-1', view.subline),
    );
    header.append(heading, dismissButton(doc, handlers));
    card.append(header);

    const progress = el(doc, 'div', 'px-5 pt-4 pb-5');
    progress.append(progressTrack(doc, view));
    progress.append(el(doc, 'p', 'font-mono text-[11px] text-ink-muted mt-2', view.progressLabel));
    card.append(progress);

    const list = el(doc, 'ol', 'border-t border-border');
    view.steps.forEach(step => {
        const row = el(doc, 'li', 'flex items-center gap-3 px-5 py-3.5 border-t border-border first:border-t-0');
        const marker = el(doc, 'span', step.done
            ? 'w-7 h-7 rounded-full bg-gold border border-gold text-black flex items-center justify-center font-mono text-[12px] shrink-0'
            : 'w-7 h-7 rounded-full border border-border text-ink-muted flex items-center justify-center font-mono text-[12px] shrink-0',
        step.done ? '✓' : step.glyph);
        row.append(marker);

        const text = el(doc, 'div', 'min-w-0');
        text.append(el(doc, 'p', 'text-[14px] font-medium', step.title));
        if (!step.done) {
            const cta = el(doc, 'a', 'text-[12px] text-gold-soft hover:text-white transition-colors', `${step.ctaLabel} →`);
            cta.href = step.ctaHref;
            text.append(cta);
        }
        row.append(text);

        row.append(el(doc, 'span', 'ml-auto font-mono text-[11px] text-ink-muted shrink-0', step.done ? 'Done' : step.detail));
        list.append(row);
    });
    card.append(list);
    return card;
}

function buildFloat(doc, view, handlers) {
    const card = el(doc, 'aside', 'fixed bottom-4 right-4 left-4 z-30 sm:left-auto sm:w-[340px] border border-border bg-panel rounded-2xl p-4 shadow-[0_16px_48px_rgba(0,0,0,0.6)]');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Account setup');

    const top = el(doc, 'div', 'flex items-center justify-between gap-3');
    top.append(
        el(doc, 'p', 'font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted', `${view.eyebrow} · ${view.progressLabel}`),
        dismissButton(doc, handlers),
    );
    card.append(top);
    card.append(el(doc, 'p', 'text-[14px] font-semibold mt-2', view.headline));
    card.append(progressTrack(doc, view));

    const bottom = el(doc, 'div', 'flex items-center justify-between mt-3');
    const next = view.steps.find(step => !step.done);
    bottom.append(
        el(doc, 'span', 'font-mono text-[11px] text-ink-muted', next ? `Next: ${next.title}` : view.progressLabel),
    );
    const cta = el(doc, 'a', 'text-[13px] text-gold-soft hover:text-white transition-colors font-medium', 'Continue →');
    cta.href = '/favorites';
    bottom.append(cta);
    card.append(bottom);
    return card;
}

/**
 * Mount the checklist on the current page. No-op (returns null) on pages
 * without an inline root or an allow-listed float path — those pages never
 * touch auth or /api/onboarding.
 */
export function initOnboarding({
    root = globalThis.document,
    location = globalThis.location,
    controllerFactory = onUpdate => createOnboardingController({ onUpdate }),
    bindSession = bindAuthSession,
    subscribeFav = subscribeFavorites,
    subscribeFollow = subscribeFollows,
} = {}) {
    const inlineRoot = root.getElementById?.('onboardingChecklist') ?? null;
    const surface = resolveSurface({
        pathname: location?.pathname ?? '/',
        hasInlineRoot: Boolean(inlineRoot),
    });
    if (!surface) return null;

    const handlers = { onDismiss: () => ctrl.dismiss() };
    let floatNode = null;

    function present(view) {
        if (inlineRoot) {
            inlineRoot.replaceChildren();
            if (view?.visible) {
                inlineRoot.append(buildCard(root, view, handlers));
                inlineRoot.classList.remove('hidden');
            } else {
                inlineRoot.classList.add('hidden');
            }
            return;
        }
        floatNode?.remove();
        floatNode = null;
        if (view?.visible && !view.celebrating) {
            floatNode = buildFloat(root, view, handlers);
            root.body?.append(floatNode);
        }
    }

    const ctrl = controllerFactory(present);
    ctrl.setSurface(surface);

    void (async () => {
        try {
            const session = await bindSession({ authManager: auth });
            session.subscribe(({ user }) => {
                if (user) void ctrl.refresh();
                else ctrl.handleSignedOut();
            }, { emitCurrent: true });
        } catch (error) {
            console.error('[Onboarding] Auth initialization failed:', error);
        }
    })();

    // Live step progress from the shared favorite/follow stores.
    subscribeFav(records => ctrl.setLiveCounts({ favorites: records.length }));
    subscribeFollow(records => ctrl.setLiveCounts({ follows: records.length }));

    return ctrl;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => initOnboarding());
}
