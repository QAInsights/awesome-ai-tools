import type { APIRoute } from 'astro';
import { jsonError } from '../../lib/server/request-security';
import { loadSiteStats } from '../../lib/server/site-stats';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
    try {
        const cache = (globalThis as any).caches?.default as Cache | undefined;
        const key = new Request(new URL('/api/stats', request.url).toString(), { method: 'GET' });
        const cached = await cache?.match(key);
        if (cached) return cached;

        const stats = await loadSiteStats();
        const cacheable = stats.traffic !== null || stats.github !== null;
        const response = Response.json(stats, {
            headers: {
                'Cache-Control': cacheable ? 'public, max-age=300, s-maxage=3600' : 'no-store',
            },
        });
        if (cache && cacheable) await cache.put(key, response.clone());
        return response;
    } catch (error) {
        console.error('[Site Stats] Request failed:', error instanceof Error ? error.message : String(error));
        return jsonError('Stats unavailable', 503);
    }
};
