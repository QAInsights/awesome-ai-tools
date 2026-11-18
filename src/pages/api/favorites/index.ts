import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { isFavoriteSlug, MAX_GUEST_FAVORITES } from '../../../lib/favorite-slugs.js';
import { trackRequest } from '../../../lib/server/analytics';
import { importFavorites, listFavorites } from '../../../lib/server/favorites-repository';
import { isAllowedMutationRequest, jsonError } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { getCookieSessionUser } from '../../../lib/server/route-auth';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const favorites = await listFavorites(db, user.id);
        return Response.json({ favorites }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Favorites] Read failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Favorites are temporarily unavailable', 503);
    }
};

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const payload = await request.json().catch(() => null) as { slugs?: unknown; expectedUserId?: unknown } | null;
        const slugs = payload?.slugs;
        if (!Array.isArray(slugs) || !slugs.length || slugs.length > MAX_GUEST_FAVORITES || !slugs.every(isFavoriteSlug)) {
            return jsonError('Invalid favorites', 400);
        }
        // The browser may have switched sessions in another tab since opt-in.
        if (payload?.expectedUserId !== user.id) return jsonError('Account changed. Refresh and try again.', 409);

        const added = await importFavorites(db, user.id, [...new Set(slugs)]);
        if (added > 0) {
            trackRequest(request, EVENTS.GUEST_FAVORITES_IMPORTED, {
                userId: user.id,
                provider: user.provider,
                value: added,
            });
        }
        const favorites = await listFavorites(db, user.id);
        return Response.json({ favorites }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('[Favorites] Import failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Unable to import favorites', 503);
    }
};
