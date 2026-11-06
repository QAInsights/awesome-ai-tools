import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getAllTools, getAlternativesFor, getToolBySlug } from './tools';
import { blogPostsLinkingTo } from './alternatives';
import { isRecommendationCandidate } from './tool-availability.js';
import { facetScore, rankFacetTools, type BestFacet } from './best-facets.js';
import { generateCandidates } from './compare-candidates';

const body = readFileSync(new URL('../content/blog/conductor-alternatives.mdx', import.meta.url), 'utf8');

describe('Conductor migration content', () => {
    test('unavailable tools are excluded from recommendations but remain addressable', () => {
        const conductor = getToolBySlug('conductor')!;
        const superset = getToolBySlug('superset')!;
        expect(conductor).toBeDefined();
        expect(getAlternativesFor(conductor).some(t => t.slug === superset.slug)).toBe(true);
        for (const tool of getAllTools()) {
            expect(getAlternativesFor(tool).every(isRecommendationCandidate)).toBe(true);
        }

        const facet: BestFacet = {
            slug: 'parallel', title: 'Parallel', short: 'Parallel', keyword: 'Parallel',
            intro: '', criteria: '', include: { slugs: ['conductor', 'superset'] },
        };
        expect(facetScore(facet, conductor)).toBe(0);
        expect(rankFacetTools(facet, [conductor, superset]).map(t => t.slug)).toEqual(['superset']);
        expect(generateCandidates([conductor, superset], [], {
            priorityPairs: [['conductor', 'superset']],
        })).toEqual([]);

        for (const status of ['discontinued', 'winding-down', ' WINDING-DOWN ']) {
            const unavailable = { ...superset, enriched: { ...superset.enriched!, status } };
            expect(isRecommendationCandidate(unavailable)).toBe(false);
            expect(rankFacetTools(facet, [unavailable])).toEqual([]);
        }
        expect(isRecommendationCandidate({ enriched: null })).toBe(true);
        expect(isRecommendationCandidate({})).toBe(true);
        expect(isRecommendationCandidate({ enriched: { status: 'active' } })).toBe(true);
    });

    test('catalog preserves the service timeline without marking the local app discontinued', () => {
        const tool = getToolBySlug('conductor');
        expect(tool?.company).toBe('Melty Labs (Meta)');
        expect(tool?.enriched?.status).toBe('winding-down');
        for (const text of ['Meta', 'November 4', 'November 13', 'November 20', 'early 2027']) {
            expect(tool?.enriched?.description).toContain(text);
            expect(tool?.enriched?.recentUpdates).toContain(text);
        }
    });

    test('notice reading link resolves to the migration article, not similarly named tools', () => {
        const post = { id: 'conductor-alternatives', body, data: { title: 'Conductor alternatives', pubDate: new Date('2026-11-06') } };
        expect(blogPostsLinkingTo([post], 'conductor')[0]?.id).toBe(post.id);
        expect(blogPostsLinkingTo([], 'conductor')).toEqual([]);
        expect(blogPostsLinkingTo([post], 'conductor-other')).toEqual([]);
    });

    test('article links to six real catalog alternatives and avoids em dashes', () => {
        for (const slug of ['superset', 'orca', 'emdash', 'paseo', 't3-code', 'kandev']) {
            expect(getToolBySlug(slug)).toBeDefined();
            expect(body).toContain(`/tools/${slug}`);
        }
        expect(body).not.toContain('\u2014');
        expect(body).toContain('Transfer to local');
        expect(body).toContain('Settings > Account > Export data');
    });
});
