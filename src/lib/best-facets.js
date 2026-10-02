/**
 * Matching and ranking for the "Best X for Y" facet pages (/best/[slug]).
 *
 * Facets are defined in data/best-facets.json. Plain JS so astro.config.mjs
 * can rank the same tools under Node when computing sitemap lastmod.
 */

/**
 * @typedef {object} FacetCondition
 * @property {string[]} [pricing] Enriched pricing values that match.
 * @property {string[]} [categories] README categories (emoji stripped) that match.
 * @property {string[]} [patterns] Case-insensitive regex sources tested against the tool's text fields.
 */

/**
 * @typedef {object} BestFacet
 * @property {string} slug
 * @property {string} title Page H1, e.g. "Best Free AI Coding Tools".
 * @property {string} short Short label for cross-links, e.g. "Free".
 * @property {string} keyword Primary search phrase, e.g. "free AI coding tools".
 * @property {string} intro Editorial intro paragraph.
 * @property {string} criteria How tools qualify, shown on the page.
 * @property {FacetCondition} include A tool qualifies when it matches any key of this condition.
 */

/**
 * @typedef {object} FacetTool
 * @property {string} slug
 * @property {string} name
 * @property {string} category
 * @property {{ name?: string, description?: string, pricing?: string, pricingDetail?: string, keyFeatures?: string[], bestFor?: string, tags?: string[], lastUpdated?: string } | null} enriched
 */

/** Weight of a pattern match per text field: where a term appears says how central it is to the tool. */
export const FIELD_WEIGHTS = {
    name: 3,
    tags: 3,
    bestFor: 3,
    description: 2,
    keyFeatures: 2,
    pricingDetail: 1,
};
export const CATEGORY_WEIGHT = 4;
export const PRICING_WEIGHT = 2;
export const MAX_RANKED = 25;

/** @param {string} category */
function cleanCategory(category) {
    return String(category ?? '')
        .replace(/\p{Extended_Pictographic}|[\uFE00-\uFE0F\u200D]/gu, '')
        .trim();
}

/**
 * @param {FacetTool} tool
 * @returns {Record<keyof typeof FIELD_WEIGHTS, string>}
 */
function fieldTexts(tool) {
    const e = tool.enriched ?? {};
    return {
        name: e.name ?? tool.name,
        tags: (e.tags ?? []).join(' | '),
        bestFor: e.bestFor ?? '',
        description: e.description ?? '',
        keyFeatures: (e.keyFeatures ?? []).join(' | '),
        pricingDetail: e.pricingDetail ?? '',
    };
}

/**
 * Relevance of a tool to a facet; 0 means it does not qualify.
 * @param {BestFacet} facet
 * @param {FacetTool} tool
 */
export function facetScore(facet, tool) {
    const { pricing = [], categories = [], patterns = [] } = facet.include;
    let score = 0;
    const toolPricing = (tool.enriched?.pricing ?? '').toLowerCase();
    if (toolPricing && pricing.includes(toolPricing)) score += PRICING_WEIGHT;
    if (categories.includes(cleanCategory(tool.category))) score += CATEGORY_WEIGHT;
    if (patterns.length) {
        const regex = new RegExp(patterns.join('|'), 'i');
        const texts = fieldTexts(tool);
        for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
            if (regex.test(texts[/** @type {keyof typeof FIELD_WEIGHTS} */ (field)])) score += weight;
        }
    }
    return score;
}

/**
 * Qualifying tools for a facet, best first: relevance, then comparison
 * popularity, then freshest enrichment, then input (README) order.
 * Only enriched tools are ranked - the page renders their review data.
 * @template {FacetTool} T
 * @param {BestFacet} facet
 * @param {T[]} tools
 * @param {ReadonlyMap<string, number>} [popularity] Curated comparison count per slug.
 * @param {number} [limit]
 * @returns {T[]}
 */
export function rankFacetTools(facet, tools, popularity = new Map(), limit = MAX_RANKED) {
    const time = (/** @type {T} */ t) => {
        const parsed = Date.parse(t.enriched?.lastUpdated ?? '');
        return Number.isNaN(parsed) ? 0 : parsed;
    };
    return tools
        .map((tool, index) => ({ tool, index, score: tool.enriched ? facetScore(facet, tool) : 0 }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score
            || (popularity.get(b.tool.slug) ?? 0) - (popularity.get(a.tool.slug) ?? 0)
            || time(b.tool) - time(a.tool)
            || a.index - b.index)
        .slice(0, limit)
        .map(entry => entry.tool);
}

/**
 * Curated comparison count per tool slug.
 * @param {{ a: string, b: string }[]} comparisons
 */
export function comparisonCounts(comparisons) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const c of comparisons) {
        counts.set(c.a, (counts.get(c.a) ?? 0) + 1);
        counts.set(c.b, (counts.get(c.b) ?? 0) + 1);
    }
    return counts;
}

/**
 * First day of the UTC month containing `now`, as YYYY-MM-01. Best-of pages
 * are re-ranked and re-dated every month, so this is their refresh stamp.
 * @param {Date} [now]
 */
export function refreshMonth(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Month label for page titles, e.g. "October 2026".
 * @param {string} month YYYY-MM-01
 */
export function formatRefreshMonth(month) {
    return new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Sitemap lastmod for a best-of page: the later of the monthly refresh and
 * the newest review it lists. Stays fixed within a month unless a listed
 * tool's review changes.
 * @param {(string | undefined | null)[]} listedDates
 * @param {Date} [now]
 */
export function facetLastmod(listedDates, now = new Date()) {
    const month = refreshMonth(now);
    let best = month;
    let bestTime = Date.parse(month);
    for (const d of listedDates) {
        const time = Date.parse(d ?? '');
        if (!Number.isNaN(time) && time > bestTime) {
            best = /** @type {string} */ (d);
            bestTime = time;
        }
    }
    return best;
}
