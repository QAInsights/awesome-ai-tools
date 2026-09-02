import type { APIRoute } from 'astro';
import { listFollows } from '../../../lib/server/follows-repository';
import { jsonError } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { getCookieSessionUser } from '../../../lib/server/route-auth';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return jsonError('Unauthorized', 401);

        const follows = await listFollows(db, user.id);
        return Response.json({ follows }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        console.error('[Follows] Read failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Follows are temporarily unavailable', 503);
    }
};
