import type { APIRoute } from 'astro';
import { jsonError } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { getZapCounts } from '../../../lib/server/zaps-repository';

export const prerender = false;

export const GET: APIRoute = async () => {
    try {
        const counts = await getZapCounts(requireDatabase());
        const body: Record<string, number> = {};
        for (const [toolId, count] of Object.entries(counts)) {
            body[`votes:${toolId}`] = count;
        }
        return Response.json(body, {
            headers: { 'Cache-Control': 'public, max-age=30' },
        });
    } catch (error) {
        console.error('[Zaps] Count failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Zap counts are temporarily unavailable', 503);
    }
};
