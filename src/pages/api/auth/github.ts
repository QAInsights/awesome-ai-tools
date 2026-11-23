import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { resolveAuthReturnPath } from '../../../lib/auth-session.js';
import { getAuthContext, getAuthTrigger } from '../../../lib/server/auth-attribution';
import { trackRequest } from '../../../lib/server/analytics';
import { fetchGitHubIdentity } from '../../../lib/server/github-auth';
import {
    getGitHubClientId,
    getGitHubClientSecret,
    requireDatabase,
} from '../../../lib/server/runtime-env';
import {
    createUserSession,
    SESSION_COOKIE_NAME,
    sessionCookieOptions,
} from '../../../lib/server/user-session';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
    const url = new URL(request.url);
    const code   = url.searchParams.get('code');
    const state  = url.searchParams.get('state');
    const error  = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');
    const storedState = cookies.get('github_oauth_state')?.value ?? null;
    const storedOrigin = cookies.get('github_auth_origin')?.value ?? null;
    const trigger = getAuthTrigger(cookies);
    cookies.delete('github_oauth_state', { path: '/' });
    cookies.delete('github_auth_origin', { path: '/' });

    let decodedOrigin = storedOrigin;
    try {
        decodedOrigin = storedOrigin ? decodeURIComponent(storedOrigin) : null;
    } catch {}
    const redirectOrigin = resolveAuthReturnPath(decodedOrigin);

    if (error) {
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'github', trigger, subject: 'authorization_denied' });
        const msg = encodeURIComponent(errorDesc ?? error ?? 'Authorization denied');
        return redirect(`${redirectOrigin}?auth_error=${msg}`);
    }

    if (!code || !state || !storedState || state !== storedState) {
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'github', trigger, subject: 'invalid_state' });
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Invalid OAuth state')}`);
    }

    const clientId = getGitHubClientId();
    const clientSecret = getGitHubClientSecret();

    if (!clientId || !clientSecret) {
        console.error('[GitHub OAuth] Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'github', trigger, subject: 'not_configured' });
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Server configuration error')}`);
    }

    try {
        const profile = await fetchGitHubIdentity(code, clientId, clientSecret);
        const session = await createUserSession(requireDatabase(), profile);
        cookies.set(
            SESSION_COOKIE_NAME,
            session.token,
            sessionCookieOptions(url),
        );
        trackRequest(request, EVENTS.SIGNIN_COMPLETED, {
            ...getAuthContext(cookies, request),
            userId: session.user.id,
            provider: 'github',
            trigger,
            value: session.isNewUser ? 1 : 0,
        });
        return redirect(`${redirectOrigin}?github_auth=1&state=${encodeURIComponent(state)}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[GitHub OAuth] Authentication failed:', message);
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'github', trigger, subject: 'authentication_failed' });
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Authentication failed. Please try again.')}`);
    }
};
