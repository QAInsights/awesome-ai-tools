/**
 * Candidate generator for /compare/<a>-vs-<b> pages.
 *
 * Proposes niche same-category pairs that share at least two distinctive tags
 * (tags carried by more than GENERIC_TAG_SHARE of tools, like "ai" or
 * "developer tools", don't count), ranked by
 * search demand (GSC impressions for either tool) and co-favorites, with
 * IDF-weighted tag overlap as the tie-breaker. Used by
 * scripts/generate-comparisons.ts to grow data/comparisons.json in reviewable
 * batches.
 */
import { INDEXING_RULES, missingFields } from './indexing';
import type { Comparison } from './compare';
import type { Tool } from './tools';

export const MIN_SHARED_TAGS = 2;
export const GENERIC_TAG_SHARE = 0.1;

export interface DemandSignals {
    /** GSC impressions per tool slug. */
    impressions?: ReadonlyMap<string, number>;
    /** Number of users who favorited both tools, keyed by `pairKey`. */
    coFavorites?: ReadonlyMap<string, number>;
}

export interface CandidateOptions {
    /** Pairs to propose first, in order (exempt from the shared-tag minimum). */
    priorityPairs?: [string, string][];
    /** Tools whose pairs rank ahead of other demand-ranked pairs and need only one distinctive shared tag. */
    priorityTools?: string[];
    /** Slugs that must not appear in a new pair URL (e.g. redirect sources). */
    reservedSlugs?: ReadonlySet<string>;
    /** Max new pairs per tool in one batch. */
    maxPerTool?: number;
    limit?: number;
}

export interface Candidate extends Comparison {
    sharedTags: string[];
    impressions: number;
    coFavorites: number;
    similarity: number;
    priority: number;
}

/** Normalized tag: lowercase words, punctuation collapsed, trailing plural dropped. */
export function normalizeTag(tag: string): string {
    return tag.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
        .split(' ')
        .map(word => (word.length > 3 && /([^aeiousp]|e)s$/.test(word) ? word.slice(0, -1) : word))
        .join(' ');
}

export function toolTags(tool: Tool): Set<string> {
    return new Set((tool.enriched?.tags ?? []).map(normalizeTag).filter(Boolean));
}

/** Order-independent identity of a pair. */
export function pairKey(a: string, b: string): string {
    return [a, b].sort().join('~');
}

/** Canonical comparison for a new pair: slugs in alphabetical order. */
export function canonicalPair(x: string, y: string, group: string): Comparison {
    const [a, b] = [x, y].sort() as [string, string];
    return { slug: `${a}-vs-${b}`, a, b, group };
}

/** Both tools carry every field the compare template renders (same rule as indexing). */
export function isComparable(tool: Tool): boolean {
    return missingFields(tool, INDEXING_RULES.compare.subjectFields).length === 0;
}

/**
 * Group label for a category: reuse the label most existing comparisons
 * involving that category use, otherwise the category name without its parenthetical.
 */
export function groupLabels(tools: Tool[], comparisons: Comparison[]): Map<string, string> {
    const bySlug = new Map(tools.map(t => [t.slug, t]));
    const votes = new Map<string, Map<string, number>>();
    for (const c of comparisons) {
        for (const category of new Set([bySlug.get(c.a)?.categoryClean, bySlug.get(c.b)?.categoryClean])) {
            if (!category) continue;
            const counts = votes.get(category) ?? new Map<string, number>();
            counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
            votes.set(category, counts);
        }
    }
    const labels = new Map<string, string>();
    for (const category of new Set(tools.map(t => t.categoryClean))) {
        const counts = [...(votes.get(category) ?? new Map<string, number>())].sort((x, y) => y[1] - x[1]);
        labels.set(category, counts[0]?.[0] ?? category.replace(/\s*\(.*\)\s*$/, '').trim());
    }
    return labels;
}

export function generateCandidates(
    tools: Tool[],
    existing: Comparison[],
    signals: DemandSignals = {},
    options: CandidateOptions = {},
): Candidate[] {
    const { priorityPairs = [], priorityTools = [], reservedSlugs = new Set<string>(), maxPerTool = Infinity, limit = Infinity } = options;
    const taken = new Set(existing.map(c => pairKey(c.a, c.b)));
    const labels = groupLabels(tools, existing);
    const eligible = tools.filter(t => isComparable(t) && !reservedSlugs.has(t.slug));
    const tags = new Map(eligible.map(t => [t.slug, toolTags(t)]));

    const df = new Map<string, number>();
    for (const set of tags.values()) for (const tag of set) df.set(tag, (df.get(tag) ?? 0) + 1);
    const idf = (tag: string) => Math.log(eligible.length / (df.get(tag) ?? 1));
    const distinctive = (tag: string) => (df.get(tag) ?? 0) <= eligible.length * GENERIC_TAG_SHARE;

    const pairRank = new Map(priorityPairs.map(([a, b], i) => [pairKey(a, b), priorityPairs.length - i]));
    const toolRank = new Set(priorityTools);

    const candidates: Candidate[] = [];
    for (let i = 0; i < eligible.length; i++) {
        for (let j = i + 1; j < eligible.length; j++) {
            const x = eligible[i]!;
            const y = eligible[j]!;
            if (x.categoryClean !== y.categoryClean) continue;
            const key = pairKey(x.slug, y.slug);
            if (taken.has(key)) continue;
            const ty = tags.get(y.slug)!;
            const shared = [...tags.get(x.slug)!].filter(tag => ty.has(tag)).sort();
            const pinned = pairRank.has(key);
            const boosted = toolRank.has(x.slug) || toolRank.has(y.slug);
            const minDistinctive = boosted ? 1 : MIN_SHARED_TAGS;
            if (!pinned && (shared.length < MIN_SHARED_TAGS || shared.filter(distinctive).length < minDistinctive)) continue;
            const priority = pinned ? 2 + pairRank.get(key)! : (boosted ? 1 : 0);
            candidates.push({
                ...canonicalPair(x.slug, y.slug, labels.get(x.categoryClean) ?? x.categoryClean),
                sharedTags: shared,
                impressions: (signals.impressions?.get(x.slug) ?? 0) + (signals.impressions?.get(y.slug) ?? 0),
                coFavorites: signals.coFavorites?.get(key) ?? 0,
                similarity: shared.reduce((sum, tag) => sum + idf(tag), 0),
                priority,
            });
        }
    }

    const demand = (c: Candidate) => Math.log10(1 + c.impressions) + Math.log2(1 + c.coFavorites);
    candidates.sort((p, q) => q.priority - p.priority
        || demand(q) - demand(p)
        || q.similarity - p.similarity
        || p.slug.localeCompare(q.slug));

    const perTool = new Map<string, number>();
    const picked: Candidate[] = [];
    for (const c of candidates) {
        if (picked.length >= limit) break;
        const isPinned = pairRank.has(pairKey(c.a, c.b));
        if (!isPinned && ((perTool.get(c.a) ?? 0) >= maxPerTool || (perTool.get(c.b) ?? 0) >= maxPerTool)) continue;
        picked.push(c);
        perTool.set(c.a, (perTool.get(c.a) ?? 0) + 1);
        perTool.set(c.b, (perTool.get(c.b) ?? 0) + 1);
    }
    return picked;
}

/** Tool impressions from a GSC "Pages" export (CSV) - /tools/<slug>/* and /compare/<a>-vs-<b> credit their tools. */
export function parseGscPagesCsv(csv: string, slugs: ReadonlySet<string>): Map<string, number> {
    const rows = csv.split(/\r?\n/).filter(Boolean);
    const header = (rows.shift() ?? '').split(',').map(h => h.trim().toLowerCase());
    const pageCol = header.findIndex(h => h.includes('page') || h.includes('url'));
    const impCol = header.indexOf('impressions');
    const totals = new Map<string, number>();
    if (pageCol < 0 || impCol < 0) throw new Error('GSC CSV needs a page/URL column and an Impressions column');
    const credit = (slug: string, n: number) => {
        if (slugs.has(slug)) totals.set(slug, (totals.get(slug) ?? 0) + n);
    };
    for (const row of rows) {
        const cols = row.split(',');
        const impressions = Number(cols[impCol]);
        if (!Number.isFinite(impressions)) continue;
        const path = (cols[pageCol] ?? '').trim().replace(/^https?:\/\/[^/]+/, '');
        const tool = path.match(/^\/tools\/([^/?#]+)/);
        if (tool) { credit(tool[1]!, impressions); continue; }
        const pair = path.match(/^\/compare\/([^/?#]+)$/);
        if (!pair) continue;
        for (const slug of slugs) {
            if (pair[1]!.startsWith(`${slug}-vs-`) || pair[1]!.endsWith(`-vs-${slug}`)) credit(slug, impressions);
        }
    }
    return totals;
}

/** Co-favorite counts from `favorites` rows (user_id, tool_slug), e.g. a `wrangler d1 execute --json` export. */
export function coFavoriteCounts(rows: { user_id: string; tool_slug: string }[]): Map<string, number> {
    const byUser = new Map<string, Set<string>>();
    for (const { user_id, tool_slug } of rows) {
        const set = byUser.get(user_id) ?? new Set<string>();
        set.add(tool_slug);
        byUser.set(user_id, set);
    }
    const counts = new Map<string, number>();
    for (const set of byUser.values()) {
        const slugs = [...set];
        for (let i = 0; i < slugs.length; i++) {
            for (let j = i + 1; j < slugs.length; j++) {
                const key = pairKey(slugs[i]!, slugs[j]!);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
    }
    return counts;
}

/** data/comparisons.json layout: one pair per line, groups separated by a blank line. */
export function serializeComparisons(comparisons: Comparison[]): string {
    const byGroup = new Map<string, Comparison[]>();
    for (const c of comparisons) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    const blocks = [...byGroup.values()].map(list => list
        .map(c => `  { "slug": ${JSON.stringify(c.slug)}, "a": ${JSON.stringify(c.a)}, "b": ${JSON.stringify(c.b)}, "group": ${JSON.stringify(c.group)}${c.source ? `, "source": ${JSON.stringify(c.source)}` : ''} }`)
        .join(',\n'));
    return `[\n${blocks.join(',\n\n')}\n]\n`;
}
