/**
 * Markdown mirror of a category page - /category/[slug].md
 *
 * Plain-text version of the category table and ranked tool summaries for LLM
 * and answer-engine consumers; linked from the HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCategoriesDetailed, type CategoryInfo } from '../../lib/tools';
import { categoryPageMarkdown } from '../../lib/tool-markdown';

export const getStaticPaths = (() => getCategoriesDetailed().map(category => ({
    params: { slug: category.slug },
    props: { category },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(categoryPageMarkdown((props as { category: CategoryInfo }).category), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
