/**
 * "Best X for Y" facet pages data layer (/best/[slug]).
 *
 * The page set lives in data/best-facets.json; each page's ranked list is
 * computed at build time from enrichment (see best-facets.js), so no page
 * is a hand-written list.
 */

import facetsJson from '../../data/best-facets.json';
import { comparisonCounts, facetLastmod, formatRefreshMonth, rankFacetTools, refreshMonth, type BestFacet } from './best-facets.js';
import { getComparisons, type Comparison } from './compare';
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
