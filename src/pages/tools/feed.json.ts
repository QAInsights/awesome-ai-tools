import { getAllTools } from '../../lib/tools';
import { buildToolsFeed } from '../../lib/tools-feed';

export const prerender = true;

export function GET(context) {
    const site = context.site?.origin ?? 'https://ai.dosa.dev';
    const feed = buildToolsFeed(getAllTools(), site);
    return new Response(JSON.stringify(feed, null, 2), {
        headers: {
            'Content-Type': 'application/feed+json; charset=utf-8',
        },
    });
}
