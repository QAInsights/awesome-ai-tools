/**
 * "Best X for Y" facet pages data layer (/best/[slug]).
 *
 * The page set lives in data/best-facets.json; each page's ranked list is
 * computed at build time from enrichment (see best-facets.js), so no page
 * is a hand-written list.
 */

import facetsJson from '../../data/best-facets.json';
import { comparisonCounts, facetLastmod, formatRefreshMonth, rankFacetTools, refreshMonth, type BestFacet } from './best-facets.js';
import { getComparisons, getComparisonsForTool, hasAlternativesPage, humanizePricing, type Comparison } from './compare';
import { isKnownFree } from './tool-faqs';
import { getAllTools, type Tool } from './tools';

export type { BestFacet };

export interface BestPage {
    facet: BestFacet;
    /** Qualifying tools, best first. */
    tools: Tool[];
    /** Curated comparisons where both tools are on this page. */
    comparisons: Comparison[];
    /** Monthly refresh stamp (YYYY-MM-01) and its label, e.g. "October 2026". */
    refreshMonth: string;
    refreshLabel: string;
    /** Later of the monthly refresh and the newest listed review; matches the sitemap lastmod. */
    lastmod: string;
}

export function getBestFacets(): BestFacet[] {
    return facetsJson as BestFacet[];
}

export function buildBestPages(facets: BestFacet[], tools: Tool[], comparisons: Comparison[], now = new Date()): BestPage[] {
    const popularity = comparisonCounts(comparisons);
    const month = refreshMonth(now);
    return facets.map(facet => {
        const ranked = rankFacetTools(facet, tools, popularity);
        const onPage = new Set(ranked.map(t => t.slug));
        return {
            facet,
            tools: ranked,
            comparisons: comparisons.filter(c => onPage.has(c.a) && onPage.has(c.b)),
            refreshMonth: month,
            refreshLabel: formatRefreshMonth(month),
            lastmod: facetLastmod(ranked.map(t => t.enriched?.lastUpdated), now),
        };
    });
}

let _pages: BestPage[] | null = null;

export function getBestPages(): BestPage[] {
    if (!_pages) _pages = buildBestPages(getBestFacets(), getAllTools(), getComparisons());
    return _pages;
}

/** Best-of pages that list the given tool. */
export function getBestPagesForTool(slug: string): BestPage[] {
    return getBestPages().filter(p => p.tools.some(t => t.slug === slug));
}

/** Best free/open-source pick on the page, if it isn't already the top pick. */
export function getBestFreePick(page: BestPage): Tool | undefined {
    const free = page.tools.find(t => isKnownFree(t.enriched?.pricing));
    return free && free !== page.tools[0] ? free : undefined;
}

const SITE = 'https://ai.dosa.dev';
const oneLine = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Markdown mirror of a best-of page (/best/<slug>.md) for LLM and answer-engine consumers. */
export function bestPageMarkdown(page: BestPage): string {
    const { facet, tools, comparisons, refreshLabel, lastmod } = page;
    const name = (t: Tool) => t.enriched?.name ?? t.name;
    const top = tools[0];
    const freePick = getBestFreePick(page);
    const lines = [
        `# ${facet.title} (${refreshLabel})`,
        '',
        `> ${oneLine(facet.intro)}`,
        '',
        `Source: ${SITE}/best/${facet.slug} · Updated ${lastmod} · ${tools.length} tools ranked · Published by dosa.dev`,
        '',
    ];
    if (top) {
        lines.push('## Quick answer', '', `**Top pick: ${name(top)}** (${humanizePricing(top.enriched?.pricing)}). ${oneLine(top.enriched?.verdict)}`);
        if (freePick) lines.push('', `**Best free option: ${name(freePick)}.** ${oneLine(freePick.enriched?.bestFor)}`);
        lines.push('');
    }
    lines.push('## How we rank', '', oneLine(facet.criteria), '', '## Comparison table', '', '| # | Tool | Company | Pricing | Best for |', '|---|---|---|---|---|');
    const cell = (s?: string) => oneLine(s).replace(/\|/g, '\\|');
    tools.forEach((t, i) => {
        lines.push(`| ${i + 1} | [${cell(name(t))}](${SITE}/tools/${t.slug}) | ${cell(t.enriched?.company ?? t.company)} | ${humanizePricing(t.enriched?.pricing)} | ${cell(t.enriched?.bestFor)} |`);
    });
    lines.push('', '## Ranked list', '');
    tools.forEach((t, i) => {
        lines.push(`### ${i + 1}. ${name(t)}`, '', oneLine(t.enriched?.verdict ?? t.enriched?.description ?? t.notes), '', `- Review: ${SITE}/tools/${t.slug}`);
        if (hasAlternativesPage(t.slug)) lines.push(`- Alternatives: ${SITE}/tools/${t.slug}/alternatives`);
        for (const c of getComparisonsForTool(t.slug).slice(0, 2)) lines.push(`- Compare: ${SITE}/compare/${c.slug}`);
        lines.push('');
    });
    if (comparisons.length) {
        lines.push('## Head-to-head comparisons', '');
        for (const c of comparisons) lines.push(`- ${SITE}/compare/${c.slug}`);
        lines.push('');
    }
    return lines.join('\n');
}
