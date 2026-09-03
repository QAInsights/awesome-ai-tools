import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { parseNewsPost, renderNewsPostHtml } from '../../lib/server/news-source';

function parseCollectionPost(post): ReturnType<typeof parseNewsPost> {
    const raw = [
        '---',
        `title: ${JSON.stringify(post.data.title)}`,
        `description: ${JSON.stringify(post.data.description)}`,
        `draft: ${post.data.draft}`,
        '---',
        post.body ?? '',
    ].join('\n');
    return parseNewsPost(post.id, raw);
}

export async function GET(context) {
    const posts = (await getCollection('blog', ({ data }) =>
        data.draft !== true && data.tags?.includes('news')
    ))
        .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
        .slice(0, 30);

    return rss({
        title: 'Today in AI | ai.dosa.dev',
        description: 'A daily AI brief for builders: model releases, developer tools, funding, and policy moves that matter.',
        site: context.site,
        items: posts.map(post => {
            const parsed = parseCollectionPost(post);
            return {
                title: post.data.title,
                pubDate: post.data.pubDate,
                description: post.data.description,
                link: `/blog/${post.id}/`,
                categories: (post.data.tags ?? []).filter(tag => tag !== 'news' && tag !== 'today-in-ai'),
                ...(parsed ? { content: renderNewsPostHtml(parsed) } : {}),
            };
        }),
        customData: '<language>en-us</language>',
    });
}
