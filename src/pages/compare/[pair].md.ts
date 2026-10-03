/**
 * Markdown mirror of a comparison page - /compare/[pair].md
 *
 * Plain-text version of the comparison table, quick answer and FAQs for LLM
 * and answer-engine consumers; linked from the HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { comparisonMarkdown, getResolvedComparisons, type ResolvedComparison } from '../../lib/compare';

export const getStaticPaths = (() => getResolvedComparisons().map(comparison => ({
    params: { pair: comparison.slug },
    props: { comparison },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(comparisonMarkdown((props as { comparison: ResolvedComparison }).comparison), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
