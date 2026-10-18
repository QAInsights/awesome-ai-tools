/**
 * Markdown mirror of a switch guide - /switch/[slug].md
 *
 * Plain-text version of the migration checklist, cost delta and FAQs for LLM
 * and answer-engine consumers; linked from the HTML page via rel=alternate.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getResolvedSwitchGuides, switchGuideMarkdown, type ResolvedSwitchGuide } from '../../lib/switch-guides';

export const getStaticPaths = (() => getResolvedSwitchGuides().map(guide => ({
    params: { slug: guide.slug },
    props: { guide },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(switchGuideMarkdown((props as { guide: ResolvedSwitchGuide }).guide), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
