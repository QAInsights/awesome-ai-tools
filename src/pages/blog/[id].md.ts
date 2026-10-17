/**
 * Markdown mirror of a blog / Today in AI post - /blog/[id].md
 *
 * Plain-text version of the article for LLM and answer-engine consumers;
 * linked from the HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { postMarkdown } from '../../lib/post-markdown';

export const getStaticPaths = (async () => {
  const entries = await getCollection('blog', ({ data }) => data.draft !== true);
  return entries.map(entry => ({ params: { id: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(postMarkdown((props as { entry: CollectionEntry<'blog'> }).entry), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
