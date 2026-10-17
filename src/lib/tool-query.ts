import { humanizePricing } from './compare';
import { getCategorySlug, type Tool } from './tools';

export interface ToolQueryParams {
    q?: string | null;
    category?: string | null;
    pricing?: string | null;
    tag?: string | null;
    limit?: number | string | null;
    offset?: number | string | null;
}

export interface PublicCatalogTool {
    slug: string;
    name: string;
    company: string;
    category: string;
    categorySlug: string;
    pricing: string;
    pricingDetail: string | null;
    summary: string;
    bestFor: string | null;
    notIdealFor: string | null;
    verdict: string | null;
    keyFeatures: string[];
    tags: string[];
    officialUrl: string | null;
    detailUrl: string;
    markdownUrl: string;
    lastUpdated: string | null;
}

export interface ToolQueryResult {
    total: number;
    limit: number;
    offset: number;
    tools: PublicCatalogTool[];
}

const SITE = 'https://ai.dosa.dev';
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const MAX_OFFSET = 10_000;

function normalizeInt(value: number | string | null | undefined, fallback: number, min: number, max: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function matchesPricingFilter(tool: Tool, filter: string): boolean {
    const raw = (tool.enriched?.pricing ?? '').toLowerCase().trim();
    const target = filter.toLowerCase().trim();
    if (!target) return true;
    if (target === 'free') return raw === 'free' || raw === 'open-source' || raw === 'open_source' || raw === 'oss';
    if (target === 'open-source' || target === 'oss') {
        const text = `${raw} ${(tool.enriched?.tags ?? []).join(' ')} ${tool.notes}`.toLowerCase();
        return /open[-_ ]?source|\boss\b|\bmit\b|\bapache-2\.0\b|\bagpl/i.test(text);
    }
    return raw === target;
}

function matchesCategoryFilter(tool: Tool, filter: string): boolean {
    const target = filter.toLowerCase().trim();
    if (!target) return true;
    const catSlug = getCategorySlug(tool.categoryShort);
    return (
        catSlug === target
        || tool.categoryShort.toLowerCase() === target
        || tool.categoryClean.toLowerCase() === target
        || tool.categoryClean.toLowerCase().includes(target)
    );
}

function matchesTagFilter(tool: Tool, filter: string): boolean {
    const target = filter.toLowerCase().trim();
    if (!target) return true;
    const tags = tool.enriched?.tags ?? [];
    return tags.some(t => t.toLowerCase() === target || t.toLowerCase().includes(target));
}

function scoreSearchMatch(tool: Tool, query: string): number {
    const q = query.toLowerCase().trim();
    if (!q) return 1;
    const e = tool.enriched;
    const name = (e?.name ?? tool.name).toLowerCase();
    const slug = tool.slug.toLowerCase();
    const company = (e?.company ?? tool.company).toLowerCase();
    const tags = (e?.tags ?? []).join(' ').toLowerCase();
    const summary = `${e?.description ?? ''} ${tool.notes} ${e?.bestFor ?? ''} ${(e?.keyFeatures ?? []).join(' ')}`.toLowerCase();

    let score = 0;
    if (slug === q || name === q) score += 20;
    else if (name.startsWith(q) || slug.startsWith(q)) score += 12;
    else if (name.includes(q)) score += 8;

    if (company.includes(q)) score += 5;
    if (tags.includes(q)) score += 6;
    if (summary.includes(q)) score += 3;

    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && score === 0) {
        const combined = `${name} ${company} ${tags} ${summary}`;
        if (tokens.every(token => combined.includes(token))) {
            score += 4;
        }
    }
    return score;
}

export function toPublicCatalogTool(tool: Tool): PublicCatalogTool {
    const e = tool.enriched;
    const hasUrl = typeof tool.url === 'string' && /^https?:\/\//i.test(tool.url);
    return {
        slug: tool.slug,
        name: e?.name ?? tool.name,
        company: e?.company ?? tool.company,
        category: tool.categoryClean,
        categorySlug: getCategorySlug(tool.categoryShort),
        pricing: humanizePricing(e?.pricing),
        pricingDetail: e?.pricingDetail ?? null,
        summary: (e?.description ?? tool.notes ?? '').replace(/\s+/g, ' ').trim(),
        bestFor: e?.bestFor ?? null,
        notIdealFor: e?.notIdealFor ?? null,
        verdict: e?.verdict ?? null,
        keyFeatures: e?.keyFeatures ?? [],
        tags: e?.tags ?? [],
        officialUrl: hasUrl ? tool.url : null,
        detailUrl: `${SITE}/tools/${tool.slug}`,
        markdownUrl: `${SITE}/tools/${tool.slug}.md`,
        lastUpdated: e?.lastUpdated ?? null,
    };
}

export function queryCatalogTools(tools: Tool[], params: ToolQueryParams = {}): ToolQueryResult {
    const q = (params.q ?? '').trim();
    const category = (params.category ?? '').trim();
    const pricing = (params.pricing ?? '').trim();
    const tag = (params.tag ?? '').trim();
    const limit = normalizeInt(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = normalizeInt(params.offset, 0, 0, MAX_OFFSET);

    const scored: { tool: Tool; score: number }[] = [];
    for (const tool of tools) {
        if (category && !matchesCategoryFilter(tool, category)) continue;
        if (pricing && !matchesPricingFilter(tool, pricing)) continue;
        if (tag && !matchesTagFilter(tool, tag)) continue;
        const score = scoreSearchMatch(tool, q);
        if (score <= 0) continue;
        scored.push({ tool, score });
    }

    if (q) {
        scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
    }

    const total = scored.length;
    const slice = scored.slice(offset, offset + limit).map(entry => toPublicCatalogTool(entry.tool));
    return {
        total,
        limit,
        offset,
        tools: slice,
    };
}
