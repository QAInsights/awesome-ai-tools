import type { APIRoute } from 'astro';
import { normalizeClientEvent } from '../../lib/analytics-events.js';
import { trackRequest } from '../../lib/server/analytics';
import { isAllowedMutationRequest, jsonError } from '../../lib/server/request-security';
import { getCookieSessionUser } from '../../lib/server/route-auth';
import { requireDatabase } from '../../lib/server/runtime-env';
import { SESSION_COOKIE_NAME } from '../../lib/server/user-session';

export const prerender = false;

const MAX_BODY_BYTES = 8_192;
const MAX_EVENTS = 20;

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    const contentLength = Number(request.headers.get('Content-Length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) return jsonError('Request body too large', 413);

    let body: { events?: unknown };
    try {
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return jsonError('Request body too large', 413);
        body = JSON.parse(text) as { events?: unknown };
    } catch {
        return jsonError('Invalid request body', 400);
    }

    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
    const user = cookies.get(SESSION_COOKIE_NAME)
        ? await Promise.resolve()
            .then(() => getCookieSessionUser(cookies, requireDatabase()))
            .catch(() => null)
        : null;
    for (const input of events) {
        const event = normalizeClientEvent(input);
        if (!event) continue;
        trackRequest(request, event.event, { ...event, userId: user?.id });
    }

    return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store' },
    });
};
