import type { APIRoute } from 'astro';
import {
    filterPostHogHeaders,
    filterPostHogResponseHeaders,
    MAX_INGEST_BODY_BYTES,
    posthogUpstreamUrl,
    readBodyWithLimit,
} from '../../lib/server/posthog-proxy';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    let body: ArrayBuffer | undefined;
    if (!['GET', 'HEAD'].includes(method)) {
        body = await readBodyWithLimit(request, MAX_INGEST_BODY_BYTES) ?? undefined;
        if (body === undefined) return new Response('Payload too large', { status: 413 });
    }
    const upstream = await fetch(posthogUpstreamUrl(url.pathname, url.search), {
        method,
        headers: filterPostHogHeaders(request.headers),
        ...(body !== undefined ? { body } : {}),
    });
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: filterPostHogResponseHeaders(upstream.headers),
    });
};
