import type { APIRoute } from 'astro';
import { enforceRateLimit } from '../../../lib/server/rate-limit';
import { isAllowedMutationRequest, jsonError } from '../../../lib/server/request-security';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { getTurnstileSecret, getZapWriteLimiter, requireDatabase } from '../../../lib/server/runtime-env';
import { verifyTurnstile } from '../../../lib/server/turnstile';
import { castZap, ZAP_TOOL_ID_PATTERN } from '../../../lib/server/zaps-repository';

export const prerender = false;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function jsonNoStore(body: Record<string, unknown>, status: number): Response {
    return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return jsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return jsonError('Invalid request body', 400);
        }
        if (!body || typeof body !== 'object') return jsonError('Invalid request body', 400);

        const { tool_id, cf_token } = body as { tool_id?: unknown; cf_token?: unknown };
        const toolId = String(tool_id ?? '').toLowerCase().trim();
        if (!ZAP_TOOL_ID_PATTERN.test(toolId)) return jsonError('Invalid tool_id', 400);
        const cfToken = typeof cf_token === 'string' ? cf_token : '';

        const limited = await enforceRateLimit(getZapWriteLimiter(), user.id);
        if (limited) return limited;

        const secret = getTurnstileSecret();
        if (!secret) {
            if (!import.meta.env.DEV) {
                console.error('[Zaps] TURNSTILE_SECRET is not configured');
                return jsonError('Zaps are temporarily unavailable', 503);
            }
        } else {
            const verified = await verifyTurnstile(cfToken, secret, request.headers.get('CF-Connecting-IP'));
            if (!verified) return jsonNoStore({ error: 'turnstile_failed' }, 403);
        }

        const result = await castZap(db, toolId, user.id);
        if (result === 'duplicate') return jsonNoStore({ error: 'already_zapped' }, 400);
        return jsonNoStore({ tool_id: toolId }, 200);
    } catch (error) {
        console.error('[Zaps] Vote failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Zaps are temporarily unavailable', 503);
    }
};
