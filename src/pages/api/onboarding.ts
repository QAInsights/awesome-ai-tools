import type { APIRoute } from 'astro';
import {
    dismissOnboarding,
    loadOnboardingState,
    markBadgeCompleted,
} from '../../lib/server/onboarding-repository';
import { getCookieSessionUser } from '../../lib/server/route-auth';
import { isAllowedMutationRequest, jsonError } from '../../lib/server/request-security';
import { requireDatabase } from '../../lib/server/runtime-env';

export const prerender = false;

const ACTIONS = Object.freeze(['badge_completed', 'dismiss'] as const);
type OnboardingAction = typeof ACTIONS[number];

function parseAction(value: unknown): OnboardingAction | null {
    return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
        ? value as OnboardingAction
        : null;
}

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const onboarding = await loadOnboardingState(db, user.id);
        return Response.json({ onboarding }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Onboarding] Read failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Onboarding is temporarily unavailable', 503);
    }
};

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    let body: { action?: unknown };
    try {
        body = await request.json() as { action?: unknown };
    } catch {
        return jsonError('Invalid request body', 400);
    }
    const action = parseAction(body?.action);
    if (!action) return jsonError('Invalid onboarding action', 400);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        if (action === 'badge_completed') await markBadgeCompleted(db, user.id);
        else await dismissOnboarding(db, user.id);

        const onboarding = await loadOnboardingState(db, user.id);
        return Response.json({ onboarding }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Onboarding] Update failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Unable to save onboarding progress', 503);
    }
};
