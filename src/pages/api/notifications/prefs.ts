import type { APIRoute } from 'astro';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { isAllowedMutationRequest, jsonError } from '../../../lib/server/request-security';
import { getOrCreatePrefs, setEmailEnabled } from '../../../lib/server/notification-prefs-repository';
import { requireDatabase } from '../../../lib/server/runtime-env';

export const prerender = false;

function responseBody(user: { email: string | null; emailVerified: boolean }, emailEnabled: boolean) {
    return {
        emailEnabled,
        email: user.email,
        emailVerified: user.emailVerified,
    };
}

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);
        const prefs = await getOrCreatePrefs(db, user.id);
        return Response.json(responseBody(user, prefs.emailEnabled), {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Notifications] Preferences read failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Notification preferences are temporarily unavailable', 503);
    }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    let body: { emailEnabled?: unknown };
    try {
        body = await request.json() as { emailEnabled?: unknown };
    } catch {
        return jsonError('Invalid request body', 400);
    }
    if (typeof body.emailEnabled !== 'boolean') return jsonError('Invalid email preference', 400);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);
        const prefs = await setEmailEnabled(db, user.id, body.emailEnabled);
        return Response.json(responseBody(user, prefs.emailEnabled), {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Notifications] Preferences save failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Unable to save notification preferences', 503);
    }
};
