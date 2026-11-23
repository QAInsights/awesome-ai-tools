import type { APIRoute } from 'astro';
import { getToolBySlug, getAlternativesFor } from '../../../lib/tools';
import { hasAlternativesPage } from '../../../lib/compare';
import { enforceRateLimit } from '../../../lib/server/rate-limit';
import { isAllowedMutationRequest, jsonError } from '../../../lib/server/request-security';
import { getSwitchWriteLimiter, getTurnstileSecret, requireDatabase } from '../../../lib/server/runtime-env';
import { getSwitchVoter, hashSwitchIdentity } from '../../../lib/server/switch-voter';
import { getSwitches, setSwitch } from '../../../lib/server/switches-repository';
import { verifyTurnstile } from '../../../lib/server/turnstile';

export const prerender = false;
const HEADERS = { 'Cache-Control': 'private, no-store' };

function sourceTool(slug: unknown) {
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !hasAlternativesPage(slug)) return undefined;
    return getToolBySlug(slug);
}

export const GET: APIRoute = async ({ request, cookies }) => {
    const tool = sourceTool(new URL(request.url).searchParams.get('tool'));
    if (!tool) return jsonError('Invalid tool', 400);
    try {
        const db = requireDatabase();
        return Response.json(await getSwitches(db, tool.slug, await getSwitchVoter(cookies, db)), { headers: HEADERS });
    } catch {
        return jsonError('Community picks are temporarily unavailable', 503);
    }
};

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);
    let body: { tool?: unknown; target?: unknown; token?: unknown } | null;
    try {
        body = await request.json();
    } catch {
        return jsonError('Invalid request body', 400);
    }
    const tool = sourceTool(body?.tool);
    if (!tool) return jsonError('Invalid tool', 400);
    const target = body?.target;
    if (target !== null && (typeof target !== 'string' || !getAlternativesFor(tool).some(alt => alt.slug === target))) {
        return jsonError('Invalid alternative', 400);
    }
    if (typeof body?.token !== 'string' || !body.token) return jsonError('turnstile_failed', 403);
    try {
        const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
        const limited = await enforceRateLimit(getSwitchWriteLimiter(), await hashSwitchIdentity(ip));
        if (limited) return limited;
        const secret = getTurnstileSecret();
        if (!secret) return jsonError('Switch voting is temporarily unavailable', 503);
        if (!await verifyTurnstile(body.token, secret, request.headers.get('CF-Connecting-IP'))) return jsonError('turnstile_failed', 403);
        const db = requireDatabase();
        const voterKey = (await getSwitchVoter(cookies, db, true))!;
        await setSwitch(db, tool.slug, voterKey, target as string | null);
        return Response.json(await getSwitches(db, tool.slug, voterKey), { headers: HEADERS });
    } catch {
        return jsonError('Switch voting is temporarily unavailable', 503);
    }
};
