/**
 * Markdown mirror of a best-of page - /best/[slug].md
 *
 * Plain-text version of the ranked list and comparison table for LLM and
 * answer-engine consumers; linked from the HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { bestPageMarkdown, getBestPages, type BestPage } from '../../lib/best';

export const getStaticPaths = (() => getBestPages().map(page => ({
    params: { slug: page.facet.slug },
    props: { page },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(bestPageMarkdown((props as { page: BestPage }).page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
