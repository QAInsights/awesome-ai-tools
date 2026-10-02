import { describe, expect, test } from 'bun:test';
import { comparisonCounts, facetLastmod, facetScore, formatRefreshMonth, rankFacetTools, refreshMonth, type BestFacet, type FacetTool } from './best-facets.js';
import { buildBestPages, getBestFacets, getBestPages } from './best';
import { getIndexingDecisions } from './indexing';
import type { Tool } from './tools';

const FACET: BestFacet = {
    slug: 'test',
    title: 'Best Test Tools',
    short: 'Test',
    keyword: 'test tools',
    intro: 'Intro.',
    criteria: 'Criteria.',
    include: { pricing: ['free'], categories: ['Terminal & CLI Agents'], patterns: ['JetBrains'] },
};

function tool(slug: string, enriched: FacetTool['enriched'], category = 'AI-Native IDEs & Editors'): FacetTool {
    return { slug, name: slug, category, enriched };
}

describe('facetScore', () => {
    test('weights where a match appears', () => {
        expect(facetScore(FACET, tool('a', { pricing: 'Free' }))).toBe(2);
        expect(facetScore(FACET, tool('b', {}, '⌨️ Terminal & CLI Agents'))).toBe(4);
        expect(facetScore(FACET, tool('c', { tags: ['jetbrains'] }))).toBe(3);
        expect(facetScore(FACET, tool('d', { description: 'Works in JetBrains.', keyFeatures: ['JetBrains plugin'] }))).toBe(4);
        expect(facetScore(FACET, tool('e', { description: 'Nothing relevant.', pricing: 'paid' }))).toBe(0);
    });
});

describe('rankFacetTools', () => {
    test('drops unenriched and non-matching tools and orders by score, popularity, freshness, input order', () => {
        const tools = [
            tool('unenriched', null, 'Terminal & CLI Agents'),
            tool('miss', { description: 'no match' }),
            tool('low-old', { pricing: 'free', lastUpdated: '2026-01-01' }),
            tool('low-new', { pricing: 'free', lastUpdated: '2026-05-01' }),
            tool('low-popular', { pricing: 'free' }),
            tool('high', { tags: ['JetBrains'], bestFor: 'JetBrains users' }),
            tool('low-new-2', { pricing: 'free', lastUpdated: '2026-05-01' }),
        ];
        const ranked = rankFacetTools(FACET, tools, new Map([['low-popular', 2]]));
        expect(ranked.map(t => t.slug)).toEqual(['high', 'low-popular', 'low-new', 'low-new-2', 'low-old']);
        expect(rankFacetTools(FACET, tools, new Map(), 2)).toHaveLength(2);
    });

    test('counts curated comparisons per tool', () => {
        expect(comparisonCounts([{ a: 'x', b: 'y' }, { a: 'x', b: 'z' }])).toEqual(new Map([['x', 2], ['y', 1], ['z', 1]]));
    });
});

describe('monthly refresh', () => {
    const now = new Date('2026-10-17T12:00:00Z');

    test('stamps the first day of the UTC month', () => {
        expect(refreshMonth(now)).toBe('2026-10-01');
        expect(refreshMonth(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-01');
        expect(formatRefreshMonth('2026-10-01')).toBe('October 2026');
    });

    test('lastmod is the later of the refresh month and the newest listed review', () => {
        expect(facetLastmod(['2026-08-01', undefined, 'not a date'], now)).toBe('2026-10-01');
        expect(facetLastmod(['2026-08-01', '2026-10-09'], now)).toBe('2026-10-09');
    });
});

describe('best-of pages', () => {
    test('only lists comparisons whose tools are both on the page', () => {
        const mk = (slug: string): Tool => ({
            slug, name: slug, company: 'Acme', category: 'AI-Native IDEs & Editors', categoryClean: 'AI-Native IDEs & Editors',
            categoryShort: 'AI IDEs', notes: '', url: 'https://example.com', enriched: { slug, pricing: 'free' },
        });
        const [page] = buildBestPages([FACET], [mk('a'), mk('b'), { ...mk('c'), enriched: null }], [
            { slug: 'a-vs-b', a: 'a', b: 'b', group: 'g' },
            { slug: 'a-vs-c', a: 'a', b: 'c', group: 'g' },
        ], new Date('2026-10-17T00:00:00Z'));
        expect(page?.tools.map(t => t.slug)).toEqual(['a', 'b']);
        expect(page?.comparisons.map(c => c.slug)).toEqual(['a-vs-b']);
        expect(page?.refreshLabel).toBe('October 2026');
    });

    test('defines at least 10 facets with unique slugs and complete copy', () => {
        const facets = getBestFacets();
        expect(facets.length).toBeGreaterThanOrEqual(10);
        expect(new Set(facets.map(f => f.slug)).size).toBe(facets.length);
        for (const f of facets) {
            expect(f.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            for (const field of [f.title, f.short, f.keyword, f.intro, f.criteria]) expect(field.trim().length).toBeGreaterThan(0);
            const { pricing = [], categories = [], patterns = [] } = f.include;
            expect(pricing.length + categories.length + patterns.length).toBeGreaterThan(0);
            for (const p of patterns) expect(() => new RegExp(p, 'i')).not.toThrow();
        }
    });

    test('every current facet page lists at least 5 qualifying tools and is indexable', () => {
        const decisions = getIndexingDecisions();
        for (const page of getBestPages()) {
            expect(page.tools.length).toBeGreaterThanOrEqual(5);
            expect(decisions.get(`/best/${page.facet.slug}`)).toEqual({ indexable: true, reasons: [] });
        }
    });
});
