import type { APIRoute } from 'astro';
import { toolIconUpstreamUrl } from '../../../lib/tool-icon';
import { getToolBySlug } from '../../../lib/tools';

export const prerender = false;

function notFound(cacheControl = 'public, max-age=3600'): Response {
    return new Response('Tool icon not found', {
        status: 404,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': cacheControl,
        },
    });
}

export const GET: APIRoute = async ({ params }) => {
    const tool = getToolBySlug(params.slug ?? '');
    if (!tool) return notFound();

    const upstreamUrl = toolIconUpstreamUrl(tool.url);
    if (!upstreamUrl) return notFound();

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, { redirect: 'follow' });
    } catch {
        return notFound('no-store');
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok) return notFound('no-store');
    if (!contentType.toLowerCase().startsWith('image/')) return notFound();

    return new Response(upstream.body, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        },
    });
};
