/**
 * Markdown mirror of a tool detail page - /tools/[slug].md
 *
 * Plain-text version of the tool's review, pricing, features, fit, verdict,
 * alternatives, and FAQs for LLM and answer-engine consumers; linked from the
 * HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getAllTools, type Tool } from '../../lib/tools';
import { toolPageMarkdown } from '../../lib/tool-markdown';

export const getStaticPaths = (() => getAllTools().map(tool => ({
    params: { slug: tool.slug },
    props: { tool },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(toolPageMarkdown((props as { tool: Tool }).tool), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
