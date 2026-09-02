import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { trackRequest } from '../../../lib/server/analytics';
import { followWithFavorite, removeFollow } from '../../../lib/server/follows-repository';
import { isAllowedMutationRequest, jsonError } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { getCookieSessionUser } from '../../../lib/server/route-auth';

export const prerender = false;

function validSlug(value: string | undefined): value is string {
    return Boolean(value && value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
}

export const PUT: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);
    if (!validSlug(params.slug)) return jsonError('Tool not found', 404);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const result = await followWithFavorite(db, user.id, params.slug);
        if (result.created) {
            trackRequest(request, EVENTS.FOLLOW_ADDED, {
                userId: user.id,
                provider: user.provider,
                trigger: 'follow_bell',
                subject: params.slug,
            });
        }
        return Response.json(result, {
            status: result.created ? 201 : 200,
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Follows] Save failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Unable to save follow', 503);
    }
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);
    if (!validSlug(params.slug)) return jsonError('Tool not found', 404);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const removed = await removeFollow(db, user.id, params.slug);
        if (removed) {
            trackRequest(request, EVENTS.FOLLOW_REMOVED, {
                userId: user.id,
                provider: user.provider,
                trigger: 'follow_bell',
                subject: params.slug,
            });
        }
        return new Response(null, {
            status: 204,
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Follows] Remove failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Unable to remove follow', 503);
    }
};
