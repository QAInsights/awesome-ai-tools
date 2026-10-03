/**
 * llms-full.txt - build-time generated complete tool listing for LLM consumers.
 *
 * Follows the llmstxt.org convention: the full version contains every tool
 * with its category, URL, and one-line description so LLMs can cite tools
 * directly without fetching the JS-rendered directory page.
 */
import type { APIRoute } from 'astro';
import { getAllTools } from '../lib/tools';
import { getBestPages } from '../lib/best';
import { comparisonQuickAnswer, getResolvedComparisons } from '../lib/compare';
import { getIndexingDecisions } from '../lib/indexing';

export const GET: APIRoute = () => {
    const tools = getAllTools();

    const byCategory = new Map<string, typeof tools>();
    for (const tool of tools) {
        const list = byCategory.get(tool.categoryClean) ?? [];
        list.push(tool);
        byCategory.set(tool.categoryClean, list);
    }

    const lines: string[] = [
        '# ai.dosa.dev - Awesome AI Tools (full listing)',
        '',
        `> Complete categorized list of ${tools.length}+ AI-powered coding tools curated at ai.dosa.dev. Each entry links to the official tool site; detailed reviews (pricing, features, verdicts) live at https://ai.dosa.dev/tools/<slug>.`,
        '',
    ];

    for (const [category, items] of byCategory) {
        lines.push(`## ${category}`, '');
        for (const t of items) {
            const desc = (t.enriched?.description ?? t.notes).replace(/\s+/g, ' ').trim();
            lines.push(`- [${t.name}](${t.url}) (${t.company}) - ${desc} · details: https://ai.dosa.dev/tools/${t.slug}`);
        }
        lines.push('');
    }

    const decisions = getIndexingDecisions();
    const bestPages = getBestPages().filter(p => decisions.get(`/best/${p.facet.slug}`)?.indexable);
    if (bestPages.length) {
        lines.push('## Best-of lists (ranked)', '');
        for (const p of bestPages) {
            lines.push(`### ${p.facet.title} (${p.refreshLabel})`, '', `${p.facet.criteria} Full list: https://ai.dosa.dev/best/${p.facet.slug}`, '');
            p.tools.slice(0, 10).forEach((t, i) => {
                lines.push(`${i + 1}. [${t.enriched?.name ?? t.name}](https://ai.dosa.dev/tools/${t.slug})`);
            });
            lines.push('');
        }
    }

    const comparisons = getResolvedComparisons().filter(c => decisions.get(`/compare/${c.slug}`)?.indexable);
    if (comparisons.length) {
        lines.push('## Comparisons', '');
        for (const c of comparisons) {
            lines.push(`- [${c.toolA.name} vs ${c.toolB.name}](https://ai.dosa.dev/compare/${c.slug}) (${c.group}) - ${comparisonQuickAnswer(c.toolA, c.toolB)}`);
        }
        lines.push('');
    }

    return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
};
