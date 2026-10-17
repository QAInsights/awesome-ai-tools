import type { APIRoute } from 'astro';
import { getToolBySlug } from '../../../lib/tools';
import { getVisibleStackItems } from '../../../lib/stack-public-view';
import { renderStackSvg } from '../../../lib/stack-svg';
import { getPublicStack } from '../../../lib/server/stacks-repository';
import { requireDatabase } from '../../../lib/server/runtime-env';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
    const requestedUsername = params.username ?? '';
    const requestedSlug = (params.stack ?? '').replace(/\.svg$/i, '');

    try {
        const db = requireDatabase();
        const result = await getPublicStack(db, requestedUsername, requestedSlug);
        if (result.status === 'redirect') {
            return new Response(null, {
                status: 301,
                headers: {
                    Location: `/u/${encodeURIComponent(result.username)}/${encodeURIComponent(result.slug)}.svg`,
                    'Cache-Control': 'public, max-age=300',
                },
            });
        }
        if (result.status !== 'found') {
            return new Response('Stack not found', {
                status: 404,
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
            });
        }

        const items = getVisibleStackItems(result.stack.items, getToolBySlug);
        const svg = renderStackSvg({
            title: result.stack.title,
            username: result.stack.username,
            displayName: result.stack.displayName,
            items,
        });

        return new Response(svg, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=600',
            },
        });
    } catch (error) {
        console.error('[Stack SVG] Render failed:', error instanceof Error ? error.message : String(error));
        return new Response('Unable to render stack card', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }
};
