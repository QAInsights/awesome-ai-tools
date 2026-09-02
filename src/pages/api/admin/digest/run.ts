import type { APIRoute } from 'astro';
import { getCookieSessionUser } from '../../../../lib/server/route-auth';
import { isAllowedMutationRequest, jsonError } from '../../../../lib/server/request-security';
import { getAdminUserIds, requireDatabase } from '../../../../lib/server/runtime-env';
import { runScheduledDigest } from '../../../../lib/server/digest-runner';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    const db = requireDatabase();
    const user = await getCookieSessionUser(cookies, db);
    if (!user || !getAdminUserIds().has(user.id)) return jsonError('Not found', 404);

    const summary = await runScheduledDigest('manual');
    return Response.json(summary, {
        headers: { 'Cache-Control': 'no-store' },
    });
};
