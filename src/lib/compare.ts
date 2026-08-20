/**
 * Curated comparison pages data layer.
 *
 * Reads data/comparisons.json (hand-picked high-intent pairs) and resolves
 * each pair against the build-time tool data (README seed + enriched JSON).
 * Everything here runs at build time - comparison pages never fetch data
 * client-side, so search engines and AI crawlers see the full content.
 */

import comparisonsJson from '../../data/comparisons.json';
import { getAllTools, getToolBySlug, type Tool } from './tools';

export interface Comparison {
    slug: string;
    a: string;
    b: string;
    group: string;
}

export interface ResolvedComparison extends Comparison {
    toolA: Tool;
    toolB: Tool;
    lastUpdated: string | null;
}

let _comparisons: Comparison[] | null = null;

export function getComparisons(): Comparison[] {
    if (_comparisons) return _comparisons;
    _comparisons = comparisonsJson as Comparison[];
    return _comparisons!;
}

export function resolveComparison(comparison: Comparison): ResolvedComparison | null {
    const toolA = getToolBySlug(comparison.a);
    const toolB = getToolBySlug(comparison.b);
    if (!toolA || !toolB) return null;

    const latest = [toolA.enriched?.lastUpdated, toolB.enriched?.lastUpdated]
        .filter((d): d is string => Boolean(d))
        .map(d => ({ raw: d, time: new Date(d).getTime() }))
        .filter(d => !isNaN(d.time))
        .sort((a, b) => a.time - b.time)
        .at(-1);
    return { ...comparison, toolA, toolB, lastUpdated: latest?.raw ?? null };
}

export function getResolvedComparisons(): ResolvedComparison[] {
    return getComparisons()
        .map(resolveComparison)
        .filter((c): c is ResolvedComparison => c !== null);
}

/** All curated comparisons that include the given tool slug. */
export function getComparisonsForTool(toolSlug: string): Comparison[] {
    return getComparisons().filter(c => c.a === toolSlug || c.b === toolSlug);
}

let _topCompared: Tool[] | null = null;

/**
 * The most-compared tools - curated comparison frequency is a proxy for
 * high-intent "X alternatives" queries. Ordered by comparison count desc;
 * ties keep README order (getAllTools order - Array.sort is stable).
 */
export function getTopComparedTools(limit = 20): Tool[] {
    if (!_topCompared) {
        const counts = new Map<string, number>();
        for (const c of getComparisons()) {
            counts.set(c.a, (counts.get(c.a) ?? 0) + 1);
            counts.set(c.b, (counts.get(c.b) ?? 0) + 1);
        }
        _topCompared = getAllTools()
            .filter(t => counts.has(t.slug))
            .sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0));
    }
    return _topCompared.slice(0, limit);
}

/** Whether /tools/{slug}/alternatives is generated for this tool. */
export function hasAlternativesPage(slug: string): boolean {
    return getTopComparedTools().some(t => t.slug === slug);
}

export function humanizePricing(val?: string): string {
    if (!val) return 'Unknown';
    const map: Record<string, string> = { free: 'Free', freemium: 'Freemium', paid: 'Paid', open_source: 'Open Source', 'open-source': 'Open Source', oss: 'Open Source', enterprise: 'Enterprise' };
    return map[val.toLowerCase()] ?? (val.charAt(0).toUpperCase() + val.slice(1));
}

export function truncate(str: string | undefined, max: number): string {
    const s = String(str ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
}

/** Ensure a clause ends with sentence punctuation before joining clauses. */
function asSentence(s: string): string {
    return /[.!?…]$/.test(s) ? s : s + '.';
}

/** AEO FAQs derived strictly from enriched data - no invented claims. */
export function buildComparisonFaqs(toolA: Tool, toolB: Tool): { q: string; a: string }[] {
    const a = toolA.enriched;
    const b = toolB.enriched;
    const faqs: { q: string; a: string }[] = [];

    if (a?.pricing || b?.pricing) {
        const parts = [
            a?.pricing ? `${toolA.name} is ${humanizePricing(a.pricing)}` : null,
            b?.pricing ? `${toolB.name} is ${humanizePricing(b.pricing)}` : null,
        ].filter(Boolean);
        faqs.push({
            q: `Is ${toolA.name} or ${toolB.name} free?`,
            a: `${parts.join('; ')}. Check each tool's detail page for full pricing breakdowns.`,
        });
    }

    if (a?.bestFor && b?.bestFor) {
        faqs.push({
            q: `Which should I choose, ${toolA.name} or ${toolB.name}?`,
            a: `${asSentence(`${toolA.name} is best for ${truncate(a.bestFor, 200)}`)} ${asSentence(`${toolB.name} is best for ${truncate(b.bestFor, 200)}`)}`,
        });
    }

    faqs.push({
        q: `What is the main difference between ${toolA.name} and ${toolB.name}?`,
        a: `${toolA.name} (${toolA.company}) is listed as ${toolA.categoryClean}; ${toolB.name} (${toolB.company}) is listed as ${toolB.categoryClean}. ${asSentence(truncate(a?.description ?? toolA.notes, 180))} By contrast, ${asSentence(truncate(b?.description ?? toolB.notes, 180))}`,
    });

    return faqs;
}
