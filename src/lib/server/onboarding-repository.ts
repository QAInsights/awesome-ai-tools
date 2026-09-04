import type { Database } from './db';

/** Activation targets for the post-signup onboarding checklist. */
export const FAVORITES_TARGET = 3;
export const FOLLOWS_TARGET = 1;

export interface OnboardingRecord {
    badgeCompletedAt: number | null;
    dismissedAt: number | null;
    completedAt: number | null;
}

export interface OnboardingState extends OnboardingRecord {
    favoritesCount: number;
    followsCount: number;
    favoritesTarget: number;
    followsTarget: number;
    favoritesStepComplete: boolean;
    followsStepComplete: boolean;
    badgeStepComplete: boolean;
    completed: boolean;
}

interface OnboardingStateRow {
    favorites_count: number;
    follows_count: number;
    badge_completed_at: number | null;
    dismissed_at: number | null;
    completed_at: number | null;
}

export const EMPTY_ONBOARDING_RECORD: OnboardingRecord = Object.freeze({
    badgeCompletedAt: null,
    dismissedAt: null,
    completedAt: null,
});

function toState(row: OnboardingStateRow | null): OnboardingState {
    const favoritesCount = Math.max(0, Number(row?.favorites_count) || 0);
    const followsCount = Math.max(0, Number(row?.follows_count) || 0);
    const badgeCompletedAt = row?.badge_completed_at ?? null;
    const dismissedAt = row?.dismissed_at ?? null;
    const completedAt = row?.completed_at ?? null;
    const favoritesStepComplete = favoritesCount >= FAVORITES_TARGET;
    const followsStepComplete = followsCount >= FOLLOWS_TARGET;
    const badgeStepComplete = badgeCompletedAt !== null;
    return {
        badgeCompletedAt,
        dismissedAt,
        completedAt,
        favoritesCount,
        followsCount,
        favoritesTarget: FAVORITES_TARGET,
        followsTarget: FOLLOWS_TARGET,
        favoritesStepComplete,
        followsStepComplete,
        badgeStepComplete,
        completed: completedAt !== null
            || (favoritesStepComplete && followsStepComplete && badgeStepComplete),
    };
}

/**
 * Read the full onboarding state in a single query: live favorite/follow
 * counts plus the persisted badge/dismissal/completion columns.
 */
export async function getOnboardingState(db: Database, userId: string): Promise<OnboardingState> {
    const row = await db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM favorites WHERE user_id = ?1) AS favorites_count,
            (SELECT COUNT(*) FROM follows WHERE user_id = ?1) AS follows_count,
            o.badge_completed_at,
            o.dismissed_at,
            o.completed_at
        FROM (SELECT ?1 AS user_id) AS seed
        LEFT JOIN user_onboarding AS o ON o.user_id = seed.user_id
    `).bind(userId).first<OnboardingStateRow>();
    return toState(row);
}

async function writeTimestamp(
    db: Database,
    userId: string,
    column: 'badge_completed_at' | 'dismissed_at' | 'completed_at',
    now = Date.now(),
): Promise<void> {
    await db.batch([
        db.prepare(`
            INSERT OR IGNORE INTO user_onboarding (user_id, updated_at)
            VALUES (?, ?)
        `).bind(userId, now),
        db.prepare(`
            UPDATE user_onboarding
            SET ${column} = ?, updated_at = ?
            WHERE user_id = ? AND ${column} IS NULL
        `).bind(now, now, userId),
    ]);
}

/** Stamp the time the user first copied a badge snippet (kept on later repeats). */
export async function markBadgeCompleted(db: Database, userId: string, now = Date.now()): Promise<OnboardingState> {
    await writeTimestamp(db, userId, 'badge_completed_at', now);
    return getOnboardingState(db, userId);
}

/** Stamp the time the user dismissed the checklist. Steps already done are kept. */
export async function dismissOnboarding(db: Database, userId: string, now = Date.now()): Promise<OnboardingState> {
    await writeTimestamp(db, userId, 'dismissed_at', now);
    return getOnboardingState(db, userId);
}

/**
 * Read state for the onboarding API: stamps `completed_at` the first time every
 * step is complete so activation time is durable, then returns the state.
 */
export async function loadOnboardingState(db: Database, userId: string, now = Date.now()): Promise<OnboardingState> {
    const state = await getOnboardingState(db, userId);
    if (state.completed && state.completedAt === null) {
        await writeTimestamp(db, userId, 'completed_at', now);
        return { ...state, completedAt: now };
    }
    return state;
}
