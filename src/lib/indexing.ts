/**
 * Indexing guardrails for generated pages.
 *
 * Every templated page (tool, compare, alternatives, pricing, category
 * "best-of") must carry data unique to it before it is offered to search
 * engines. A page is indexable only when:
 *   - the tools it is about have the enrichment fields the template renders,
 *   - it lists enough qualifying (enriched) tools to be a real collection,
 *   - its primary content is not a duplicate of another page of the same type.
 * Failing pages render `noindex, follow` and are dropped from the sitemap
 * (see src/lib/noindex-scan.js), so link equity still flows through them.
 */

import { getAllTools, getAlternativesFor, getCategoriesDetailed, type EnrichedTool, type Tool } from './tools';
import { getResolvedComparisons, getTopComparedTools, getTopPricingTools } from './compare';

export type GeneratedPageType = 'tool' | 'compare' | 'alternatives' | 'pricing' | 'category';

export const GENERATED_PAGE_TYPES: GeneratedPageType[] = ['tool', 'compare', 'alternatives', 'pricing', 'category'];

export type EnrichedField = Exclude<keyof EnrichedTool, 'slug'>;

export interface IndexingRule {
    /** Enrichment fields every subject tool of the page must have. */
    subjectFields: EnrichedField[];
    /** Enrichment fields a listed tool needs to count as qualifying. */
    listedFields: EnrichedField[];
    /** Minimum number of qualifying listed tools. */
    minQualifying: number;
}

export const INDEXING_RULES: Record<GeneratedPageType, IndexingRule> = {
    tool: {
        subjectFields: ['description', 'keyFeatures', 'bestFor', 'verdict', 'lastUpdated'],
        listedFields: [],
        minQualifying: 0,
    },
    compare: {
        subjectFields: ['description', 'keyFeatures', 'bestFor', 'verdict', 'pricing', 'lastUpdated'],
        listedFields: [],
        minQualifying: 0,
    },
    alternatives: {
        subjectFields: ['description', 'lastUpdated'],
        listedFields: ['description', 'pricing', 'verdict'],
        minQualifying: 3,
    },
    pricing: {
        subjectFields: ['pricing', 'pricingDetail', 'lastUpdated'],
        listedFields: [],
        minQualifying: 0,
    },
    category: {
        subjectFields: [],
        listedFields: ['description', 'pricing', 'verdict'],
        minQualifying: 3,
    },
};

export interface IndexCandidate {
    type: GeneratedPageType;
    /** Site path without trailing slash, e.g. "/compare/cursor-vs-devin". */
    path: string;
    /** Tools the page is about; each must pass the rule's subjectFields. */
    subjects: Tool[];
    /** Tools the page lists; counted against the rule's minQualifying. */
    listed: Tool[];
    /** The content that makes this page unique; compared across pages of the same type. */
    primaryContent: string;
}

export interface IndexDecision {
    indexable: boolean;
    reasons: string[];
}

export const NOINDEX_ROBOTS = 'noindex, follow';

const PLACEHOLDER_VALUES = new Set(['', '-', 'n/a', 'na', 'none', 'null', 'tbd', 'todo', 'unknown', 'undefined']);

function hasValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value !== 'string') return false;
    return !PLACEHOLDER_VALUES.has(value.replace(/\s+/g, ' ').trim().toLowerCase());
}

/** Enrichment fields from `fields` that the tool is missing (placeholders count as missing). */
export function missingFields(tool: Tool, fields: EnrichedField[]): EnrichedField[] {
    const { enriched } = tool;
    return fields.filter(field => !enriched || !hasValue(enriched[field]));
}

/** Case, punctuation and whitespace insensitive key for duplicate detection. */
export function contentFingerprint(text: string): string {
    return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function duplicateKey(page: IndexCandidate): string | null {
    const fingerprint = contentFingerprint(page.primaryContent);
    return fingerprint ? `${page.type}:${fingerprint}` : null;
}

/**
 * Decide whether a generated page may be indexed.
 * `seen` maps duplicate keys of already-indexable pages to their paths;
 * pass it when evaluating a batch so later duplicates are caught.
 */
export function isIndexable(page: IndexCandidate, seen: ReadonlyMap<string, string> = new Map()): IndexDecision {
    const rule = INDEXING_RULES[page.type];
    const reasons: string[] = [];

    for (const subject of page.subjects) {
        const missing = missingFields(subject, rule.subjectFields);
        if (missing.length) reasons.push(`${subject.slug} missing ${missing.join(', ')}`);
    }

    const subjectSlugs = page.subjects.map(t => t.slug);
    if (new Set(subjectSlugs).size < subjectSlugs.length) {
        reasons.push(`duplicate subject ${subjectSlugs.join(' / ')}`);
    }

    if (rule.minQualifying > 0) {
        const qualifying = page.listed.filter(t => missingFields(t, rule.listedFields).length === 0).length;
        if (qualifying < rule.minQualifying) {
            reasons.push(`only ${qualifying} qualifying tools listed (min ${rule.minQualifying})`);
        }
    }

    const key = duplicateKey(page);
    if (!key) {
        reasons.push('no primary content');
    } else {
        const original = seen.get(key);
        if (original && original !== page.path) reasons.push(`duplicate primary content of ${original}`);
    }

    return { indexable: reasons.length === 0, reasons };
}

/** Evaluate pages in order; the first indexable page with given primary content wins. */
export function evaluatePages(pages: IndexCandidate[]): Map<string, IndexDecision> {
    const seen = new Map<string, string>();
    const decisions = new Map<string, IndexDecision>();
    for (const page of pages) {
        const decision = isIndexable(page, seen);
        decisions.set(page.path, decision);
        const key = duplicateKey(page);
        if (decision.indexable && key) seen.set(key, page.path);
    }
    return decisions;
}

function toolContent(tool: Tool): string {
    return [tool.enriched?.description, tool.enriched?.verdict].filter(Boolean).join(' ');
}

/** One candidate per generated page, mirroring each template's getStaticPaths. */
export function getGeneratedPageCandidates(): IndexCandidate[] {
    const tools: IndexCandidate[] = getAllTools().map(tool => ({
        type: 'tool',
        path: `/tools/${tool.slug}`,
        subjects: [tool],
        listed: [],
        primaryContent: toolContent(tool),
    }));
    const compares: IndexCandidate[] = getResolvedComparisons().map(c => ({
        type: 'compare',
        path: `/compare/${c.slug}`,
        subjects: [c.toolA, c.toolB],
        listed: [],
        primaryContent: [c.toolA.slug, c.toolB.slug].sort().join(' vs '),
    }));
    const alternatives: IndexCandidate[] = getTopComparedTools().map(tool => ({
        type: 'alternatives',
        path: `/tools/${tool.slug}/alternatives`,
        subjects: [tool],
        listed: getAlternativesFor(tool),
        primaryContent: toolContent(tool),
    }));
    const pricing: IndexCandidate[] = getTopPricingTools().map(tool => ({
        type: 'pricing',
        path: `/tools/${tool.slug}/pricing`,
        subjects: [tool],
        listed: [],
        primaryContent: tool.enriched?.pricingDetail ?? '',
    }));
    const categories: IndexCandidate[] = getCategoriesDetailed().map(category => ({
        type: 'category',
        path: `/category/${category.slug}`,
        subjects: [],
        listed: category.tools,
        primaryContent: category.tools.map(t => t.slug).sort().join(' '),
    }));
    return [...tools, ...compares, ...alternatives, ...pricing, ...categories];
}

let _decisions: Map<string, IndexDecision> | null = null;

export function getIndexingDecisions(): Map<string, IndexDecision> {
    if (!_decisions) _decisions = evaluatePages(getGeneratedPageCandidates());
    return _decisions;
}

/** Robots value for a generated page: `noindex, follow` when it fails the guardrails. */
export function robotsFor(path: string): string | undefined {
    const decision = getIndexingDecisions().get(path);
    if (!decision) throw new Error(`No indexing decision for generated page ${path}`);
    return decision.indexable ? undefined : NOINDEX_ROBOTS;
}

export interface IndexingTypeSummary {
    type: GeneratedPageType;
    total: number;
    indexable: number;
    noindexed: { path: string; reasons: string[] }[];
}

export function summarizeIndexing(
    pages: IndexCandidate[] = getGeneratedPageCandidates(),
    decisions: Map<string, IndexDecision> = getIndexingDecisions(),
): IndexingTypeSummary[] {
    return GENERATED_PAGE_TYPES.map(type => {
        const ofType = pages.filter(p => p.type === type);
        const noindexed = ofType
            .map(p => ({ path: p.path, reasons: decisions.get(p.path)?.reasons ?? ['not evaluated'] }))
            .filter(p => !decisions.get(p.path)?.indexable);
        return { type, total: ofType.length, indexable: ofType.length - noindexed.length, noindexed };
    });
}

export function formatIndexingReport(summary: IndexingTypeSummary[], maxListed = 10): string {
    const rows = summary.map(s => [s.type, String(s.total), String(s.indexable), String(s.noindexed.length)]);
    const totals = summary.reduce((acc, s) => [acc[0]! + s.total, acc[1]! + s.indexable, acc[2]! + s.noindexed.length], [0, 0, 0]);
    rows.push(['all', ...totals.map(String)]);
    const header = ['type', 'total', 'indexable', 'noindex'];
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)));
    const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
    const out = ['Indexing guardrails: generated pages', line(header), line(widths.map(w => '-'.repeat(w))), ...rows.slice(0, -1).map(line), line(rows.at(-1)!)];
    for (const s of summary) {
        if (!s.noindexed.length) continue;
        out.push('', `noindex ${s.type} (${s.noindexed.length}):`);
        for (const page of s.noindexed.slice(0, maxListed)) out.push(`  ${page.path}: ${page.reasons.join('; ')}`);
        if (s.noindexed.length > maxListed) out.push(`  ... and ${s.noindexed.length - maxListed} more`);
    }
    return out.join('\n');
}
