import type { APIRoute } from 'astro';
import { getAllTools, getToolBySlug } from '../../../lib/tools';
import { queryCatalogTools, toPublicCatalogTool } from '../../../lib/tool-query';

export const prerender = false;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export const OPTIONS: APIRoute = () => new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
});

export const GET: APIRoute = ({ url }) => {
    const slug = url.searchParams.get('slug')?.trim();
    if (slug) {
        const tool = getToolBySlug(slug);
        if (!tool) {
            return new Response(JSON.stringify({ error: `Tool not found: ${slug}` }), {
                status: 404,
                headers: {
                    ...CORS_HEADERS,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'public, max-age=60',
                },
            });
        }
        return new Response(JSON.stringify({ tool: toPublicCatalogTool(tool) }), {
            status: 200,
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=3600',
            },
        });
    }

    const result = queryCatalogTools(getAllTools(), {
        q: url.searchParams.get('q'),
        category: url.searchParams.get('category'),
        pricing: url.searchParams.get('pricing'),
        tag: url.searchParams.get('tag'),
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
    });

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
        },
    });
};
