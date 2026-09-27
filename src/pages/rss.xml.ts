import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async (context) => {
  const blog = await getCollection('blog', ({ data }) => {
    return data.draft !== true;
  });

  // Sort posts by publication date (descending)
  const posts = blog.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'AI Tools Blog',
    description: 'Exploring the latest in artificial intelligence coding tools, IDEs, and autonomous agents.',
    site: context.site ?? 'https://ai.dosa.dev',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>en-us</language>`,
  });
};
