import type { APIRoute } from 'astro';
import {
    listPublicStackProfileUsernames,
    listPublicStacksForSitemap,
} from '../lib/server/stacks-repository';
import { requireDatabase } from '../lib/server/runtime-env';
import { buildStackSitemapXml } from '../lib/stack-public-view';

export const prerender = false;

export const GET: APIRoute = async () => {
    try {
        const db = requireDatabase();
        const [stacks, usernames] = await Promise.all([
            listPublicStacksForSitemap(db),
            listPublicStackProfileUsernames(db),
        ]);
        const xml = buildStackSitemapXml(stacks, usernames);
        return new Response(xml, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('[Stacks sitemap] Failed to build XML:', error instanceof Error ? error.message : String(error));
        return new Response('Unable to generate sitemap', {
            status: 503,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
    }
};
