import { describe, expect, test } from 'bun:test';
import type { EnrichedTool, Tool } from './tools';
import { getAllTools, getCategoriesDetailed } from './tools';
import { getResolvedComparisons, getTopComparedTools, getTopPricingTools } from './compare';
import {
    contentFingerprint,
    evaluatePages,
    formatIndexingReport,
    getGeneratedPageCandidates,
    getIndexingDecisions,
    isIndexable,
    missingFields,
    NOINDEX_ROBOTS,
    robotsFor,
    summarizeIndexing,
    type IndexCandidate,
} from './indexing';

const FULL: Omit<EnrichedTool, 'slug'> = {
    name: 'Tool',
    description: 'An AI coding agent that edits many files.',
    pricing: 'freemium',
    pricingDetail: 'Free tier, Pro at $20/month.',
    keyFeatures: ['Multi-file edits'],
    bestFor: 'Teams with large repos.',
    notIdealFor: 'Offline work.',
    verdict: 'A strong default for agentic editing.',
    tags: ['agent'],
    lastUpdated: '2026-09-01',
};

function makeTool(slug: string, enriched: Partial<EnrichedTool> | null = {}): Tool {
    return {
        slug,
        name: slug,
        company: 'Acme',
        category: 'Terminal & CLI Agents',
        categoryClean: 'Terminal & CLI Agents',
        categoryShort: 'CLI Agents',
        notes: 'Seed notes.',
        url: 'https://example.com',
        enriched: enriched === null ? null : { ...FULL, description: `${FULL.description} (${slug})`, ...enriched, slug },
    };
}

function page(overrides: Partial<IndexCandidate> & Pick<IndexCandidate, 'type'>): IndexCandidate {
    const subject = makeTool('alpha');
    return { path: `/${overrides.type}/alpha`, subjects: [subject], listed: [], primaryContent: 'alpha content', ...overrides };
}

describe('missingFields', () => {
    test('treats absent, empty, and placeholder values as missing', () => {
        const tool = makeTool('alpha', { pricing: 'unknown', verdict: '  ', keyFeatures: [''], bestFor: undefined });
        expect(missingFields(tool, ['pricing', 'verdict', 'keyFeatures', 'bestFor', 'description'])).toEqual(['pricing', 'verdict', 'keyFeatures', 'bestFor']);
    });

    test('an unenriched tool is missing every field', () => {
        expect(missingFields(makeTool('alpha', null), ['description', 'pricing'])).toEqual(['description', 'pricing']);
    });
});

describe('isIndexable', () => {
    test('passes a fully enriched tool page', () => {
        expect(isIndexable(page({ type: 'tool' }))).toEqual({ indexable: true, reasons: [] });
    });

    test('fails a tool page whose subject lacks required enrichment', () => {
        const decision = isIndexable(page({ type: 'tool', subjects: [makeTool('alpha', { verdict: '' })] }));
        expect(decision.indexable).toBe(false);
        expect(decision.reasons).toEqual(['alpha missing verdict']);
    });

    test('tool pages do not require known pricing', () => {
        expect(isIndexable(page({ type: 'tool', subjects: [makeTool('alpha', { pricing: 'unknown' })] })).indexable).toBe(true);
    });

    test('compare pages need both tools enriched, including pricing', () => {
        const decision = isIndexable(page({ type: 'compare', subjects: [makeTool('alpha'), makeTool('beta', { pricing: 'unknown' })] }));
        expect(decision.reasons).toEqual(['beta missing pricing']);
    });

    test('compare pages cannot compare a tool with itself', () => {
        const alpha = makeTool('alpha');
        expect(isIndexable(page({ type: 'compare', subjects: [alpha, alpha] })).reasons).toEqual(['duplicate subject alpha / alpha']);
    });

    test('pricing pages need pricing detail', () => {
        expect(isIndexable(page({ type: 'pricing', subjects: [makeTool('alpha', { pricingDetail: undefined })] })).reasons).toEqual(['alpha missing pricingDetail']);
    });

    test('alternatives pages need at least 3 qualifying alternatives', () => {
        const listed = [makeTool('b'), makeTool('c'), makeTool('d', null), makeTool('e', { verdict: 'n/a' })];
        const decision = isIndexable(page({ type: 'alternatives', listed }));
        expect(decision.reasons).toEqual(['only 2 qualifying tools listed (min 3)']);
        expect(isIndexable(page({ type: 'alternatives', listed: [...listed, makeTool('f')] })).indexable).toBe(true);
    });

    test('category pages need at least 3 qualifying tools', () => {
        const decision = isIndexable(page({ type: 'category', subjects: [], listed: [makeTool('a'), makeTool('b')] }));
        expect(decision.reasons).toEqual(['only 2 qualifying tools listed (min 3)']);
    });

    test('fails a page with no primary content', () => {
        expect(isIndexable(page({ type: 'tool', primaryContent: ' -- ' })).reasons).toEqual(['no primary content']);
    });

    test('fails a page whose primary content was already seen for the same type', () => {
        const seen = new Map([[`tool:${contentFingerprint('Alpha content.')}`, '/tools/original']]);
        expect(isIndexable(page({ type: 'tool' }), seen).reasons).toEqual(['duplicate primary content of /tools/original']);
        expect(isIndexable(page({ type: 'pricing' }), seen).indexable).toBe(true);
    });

    test('collects every failing reason', () => {
        const decision = isIndexable(page({ type: 'alternatives', subjects: [makeTool('alpha', null)], listed: [], primaryContent: '' }));
        expect(decision.reasons).toEqual(['alpha missing description, lastUpdated', 'only 0 qualifying tools listed (min 3)', 'no primary content']);
    });
});

describe('evaluatePages', () => {
    test('keeps the first page with given content indexable and noindexes later copies', () => {
        const first = page({ type: 'pricing', path: '/tools/a/pricing', primaryContent: 'Free tier, Pro $20.' });
        const copy = page({ type: 'pricing', path: '/tools/b/pricing', primaryContent: 'free tier pro $20' });
        const decisions = evaluatePages([first, copy]);
        expect(decisions.get('/tools/a/pricing')?.indexable).toBe(true);
        expect(decisions.get('/tools/b/pricing')?.reasons).toEqual(['duplicate primary content of /tools/a/pricing']);
    });

    test('a failing page does not claim its content for later pages', () => {
        const thin = page({ type: 'tool', path: '/tools/a', subjects: [makeTool('a', { verdict: '' })], primaryContent: 'same' });
        const good = page({ type: 'tool', path: '/tools/b', subjects: [makeTool('b')], primaryContent: 'same' });
        const decisions = evaluatePages([thin, good]);
        expect(decisions.get('/tools/a')?.indexable).toBe(false);
        expect(decisions.get('/tools/b')?.indexable).toBe(true);
    });
});

describe('generated page catalog', () => {
    test('has one candidate per generated page, mirroring getStaticPaths', () => {
        const summary = summarizeIndexing();
        const totals = Object.fromEntries(summary.map(s => [s.type, s.total]));
        expect(totals).toEqual({
            tool: getAllTools().length,
            compare: getResolvedComparisons().length,
            alternatives: getTopComparedTools().length,
            pricing: getTopPricingTools().length,
            category: getCategoriesDetailed().length,
        });
        const paths = getGeneratedPageCandidates().map(p => p.path);
        expect(new Set(paths).size).toBe(paths.length);
    });

    test('robotsFor returns noindex only for failing pages and rejects unknown paths', () => {
        for (const [path, decision] of getIndexingDecisions()) {
            expect(robotsFor(path)).toBe(decision.indexable ? undefined : NOINDEX_ROBOTS);
        }
        expect(() => robotsFor('/not-a-generated-page')).toThrow();
    });

    test('report lists per-type counts and noindexed reasons', () => {
        const report = formatIndexingReport([
            { type: 'tool', total: 3, indexable: 2, noindexed: [{ path: '/tools/x', reasons: ['x missing verdict'] }] },
            { type: 'compare', total: 1, indexable: 1, noindexed: [] },
        ]);
        expect(report).toMatch(/^tool\s+3\s+2\s+1$/m);
        expect(report).toMatch(/^all\s+4\s+3\s+1$/m);
        expect(report).toContain('/tools/x: x missing verdict');
    });
});
