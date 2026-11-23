import type { AstroCookies } from 'astro';
import { sanitizeAuthTrigger } from '../analytics-events.js';
import { authAnalyticsUrl } from '../auth-analytics-url.js';

export const AUTH_TRIGGER_COOKIE_NAME = 'aat_auth_trigger';

export function getAuthContext(cookies: AstroCookies, request: Request) {
    try {
        const raw = cookies.get('aat_auth_context')?.value || '';
        let context;
        try { context = JSON.parse(raw); } catch { context = JSON.parse(decodeURIComponent(raw)); }
        const url = new URL(context.url);
        if (url.origin !== new URL(request.url).origin) return {};
        return {
            $pathname: url.pathname,
            $current_url: authAnalyticsUrl(url.href).slice(0, 2048),
            $session_id: typeof context.sessionId === 'string' ? context.sessionId.slice(0, 128) : '',
        };
    } catch { return {}; }
}

export function getAuthTrigger(cookies: AstroCookies): string {
    return sanitizeAuthTrigger(cookies.get(AUTH_TRIGGER_COOKIE_NAME)?.value);
}
