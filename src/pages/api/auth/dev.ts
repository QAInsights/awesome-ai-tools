import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { getAuthContext, getAuthTrigger } from '../../../lib/server/auth-attribution';
import { trackRequest } from '../../../lib/server/analytics';
import { hasLocalDevOrigin, isLocalDevRequest } from '../../../lib/server/dev-auth';
import { jsonError } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { toClientUser } from '../../../lib/server/route-auth';
import {
    createUserSession,
    SESSION_COOKIE_NAME,
    sessionCookieOptions,
} from '../../../lib/server/user-session';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isLocalDevRequest(request, import.meta.env.DEV)) {
        return new Response(null, { status: 404 });
    }
    if (!hasLocalDevOrigin(request)) return jsonError('Invalid request origin', 403);
    const trigger = getAuthTrigger(cookies);

    try {
        const session = await createUserSession(requireDatabase(), {
            provider: 'github',
            providerUserId: 'local-staging-tester',
            name: 'Local Staging Tester',
            email: null,
            picture: null,
            githubUsername: 'local-staging-tester',
            emailVerified: false,
        });
        cookies.set(
            SESSION_COOKIE_NAME,
            session.token,
            sessionCookieOptions(new URL(request.url)),
        );
        trackRequest(request, EVENTS.SIGNIN_COMPLETED, {
            ...getAuthContext(cookies, request),
            userId: session.user.id,
            provider: 'dev',
            trigger,
            value: session.isNewUser ? 1 : 0,
        });
        return Response.json({ user: toClientUser(session.user) }, {
            status: 201,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('[Dev Auth] Session creation failed:', error instanceof Error ? error.message : String(error));
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'dev', trigger, subject: 'session_failed' });
        return jsonError('Development login unavailable', 503);
    }
};
