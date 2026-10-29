import type { APIRoute } from 'astro';
import {
    filterPostHogHeaders,
    filterPostHogResponseHeaders,
    posthogUpstreamUrl,
} from '../../lib/server/posthog-proxy';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const upstream = await fetch(posthogUpstreamUrl(url.pathname, url.search), {
        method,
        headers: filterPostHogHeaders(request.headers),
        ...(!['GET', 'HEAD'].includes(method) ? { body: await request.arrayBuffer() } : {}),
    });
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: filterPostHogResponseHeaders(upstream.headers),
    });
};
