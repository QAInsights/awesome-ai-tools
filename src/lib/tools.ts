/**
 * Build-time tool data loader.
 *
 * Reads README.md and enriched-tools.json at build time and produces
 * a combined array of tool objects for use in Astro pages/components.
 * This replaces the runtime fetch + parse approach in the old app.js.
 */

import readmeMarkdown from '../../README.md?raw';
import enrichedToolsJson from '../../public/data/enriched-tools.json';

export interface ToolSeed {
    slug: string;
    name: string;
    company: string;
    category: string;
    categoryClean: string;
    categoryShort: string;
    notes: string;
    url: string;
}

export interface EnrichedTool {
    slug: string;
    name?: string;
    company?: string;
    description?: string;
    pricing?: string;
    pricingDetail?: string;
    keyFeatures?: string[];
    bestFor?: string;
    notIdealFor?: string;
    recentUpdates?: string;
    verdict?: string;
    tags?: string[];
    lastUpdated?: string;
}

export interface Tool extends ToolSeed {
    enriched: EnrichedTool | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function stripEmoji(s: string): string {
    return String(s ?? '')
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
        .trim();
}

const CATEGORY_MAPPING: Record<string, string> = {
    'AI-Native IDEs & Editors': 'AI IDEs',
    'IDE Extensions & Plugins': 'IDE Plugins',
    'Terminal & CLI Agents': 'CLI Agents',
    'AI-Native Terminals': 'AI Terminals',
    'Autonomous & Async Agents': 'Async Agents',
    'Browser-Based & App Builders': 'Web Builders',
    'AI Code Review & Security': 'Code Review',
    'AI Testing & Quality Assurance': 'QA & Testing',
    'General-Purpose AI Assistants (with Strong Coding Capability)': 'General AI',
    'AI Codebase Knowledge & Generation': 'Codebase AI',
    'Developer Productivity & Workflow': 'Productivity',
    'Editor Platforms with Native AI Features': 'Native Editors',
};

/**
 * Slug generation - mirrors parser.js exactly.
 * First occurrence: name-only slug.
 * Collision: name-company slug.
 */
function slugify(str: string): string {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function getShortCategory(category: string): string {
    const clean = stripEmoji(category);
    for (const [key, val] of Object.entries(CATEGORY_MAPPING)) {
        if (clean.includes(key)) return val;
    }
    return clean;
}

/**
 * Parse the markdown tool tables from README.md.
 * Mirrors parser.js exactly - slug is name-only first, then name-company on collision.
 */
function parseMarkdown(text: string): ToolSeed[] {
    const toolsRaw: Omit<ToolSeed, 'slug'>[] = [];
    const sections = text.split('## ');

    for (let i = 1; i < sections.length; i++) {
        const lines = sections[i].split('\n');
        const categoryLine = lines[0].trim();

        if (categoryLine.toLowerCase().includes('table of contents')) continue;

        let isTable = false;
        for (const line of lines) {
            if (line.startsWith('| Tool |') || line.startsWith('|------|')) {
                isTable = true;
                continue;
            }
            if (isTable && line.trim().startsWith('|')) {
                const cells = line.split('|').map(s => s.trim()).filter(Boolean);
                if (cells.length >= 3) {
                    const toolRaw = cells[0] ?? '';
                    const company = cells[1] ?? '';
                    const notes = cells[2] ?? '';
                    const match = toolRaw.match(/\[(.*?)\]\((.*?)\)/);
                    if (match) {
                        toolsRaw.push({
                            name: match[1].replace(/\*\*/g, ''),
                            url: match[2],
                            company,
                            notes,
                            category: categoryLine,
                            categoryClean: stripEmoji(categoryLine),
                            categoryShort: getShortCategory(categoryLine),
                        });
                    } else {
                        const nameMatch = toolRaw.match(/\*\*(.*?)\*\*/);
                        toolsRaw.push({
                            name: nameMatch ? nameMatch[1] : toolRaw.replace(/\*\*/g, ''),
                            url: '#',
                            company,
                            notes,
                            category: categoryLine,
                            categoryClean: stripEmoji(categoryLine),
                            categoryShort: getShortCategory(categoryLine),
                        });
                    }
                }
            } else if (isTable && (!line.trim().startsWith('|') && line.trim() !== '')) {
                isTable = false;
            }
        }
    }

    // Collision resolution mirrors parser.js exactly:
    // first occurrence: name-only; collision: name-company; further: name-company-N
    const seen = new Map<string, number>();
    return toolsRaw.map(tool => {
        let base = slugify(tool.name);
        if (!base) base = 'tool';
        let slug = base;
        if (seen.has(slug)) {
            const withCompany = `${base}-${slugify(tool.company)}`;
            slug = seen.has(withCompany) ? `${withCompany}-${(seen.get(withCompany) ?? 0) + 1}` : withCompany;
        }
        seen.set(slug, (seen.get(slug) ?? 0) + 1);
        return { ...tool, slug };
    });
}

/**
 * Load enriched tool data from public/data/enriched-tools.json
 */
function loadEnriched(): Map<string, EnrichedTool> {
    const map = new Map<string, EnrichedTool>();
    for (const t of enrichedToolsJson as EnrichedTool[]) {
        if (t.slug) map.set(t.slug, t);
    }
    return map;
}

// ── freshness helpers ─────────────────────────────────────────────────────────

/**
 * Latest valid date from a list of ISO-ish strings, or null when nothing parses.
 * Sorts by parsed time (not lexicographically) so mixed formats stay safe.
 */
export function maxLastUpdated(dates: (string | undefined | null)[]): string | null {
    let best: string | null = null;
    let bestTime = -Infinity;
    for (const d of dates) {
        if (!d) continue;
        const time = new Date(d).getTime();
        if (isNaN(time) || time <= bestTime) continue;
        bestTime = time;
        best = d;
    }
    return best;
}

/**
 * Latest content update across all enriched tools, or null if none are dated.
 * This is the honest sitewide freshness signal - it moves only when the
 * enrichment pipeline actually ships new data, not on every build.
 */
export function getLatestUpdate(tools: Tool[] = getAllTools()): string | null {
    return maxLastUpdated(tools.map(t => t.enriched?.lastUpdated));
}

/**
 * Format an ISO date for display, e.g. "Aug 9, 2026".
 * Rendered in UTC so date-only strings ("2026-08-09") never shift a day
 * behind for visitors west of Greenwich.
 */
export function formatDate(iso?: string | null): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    } catch {
        return iso;
    }
}

// ── public API ────────────────────────────────────────────────────────────────

let _tools: Tool[] | null = null;

/**
 * Returns all tools (lazy-loaded and cached).
 * Safe to call multiple times - only reads files once.
 */
export function getAllTools(): Tool[] {
    if (_tools) return _tools;

    const seeds = parseMarkdown(readmeMarkdown);
    const enrichedMap = loadEnriched();

    _tools = seeds.map(seed => ({
        ...seed,
        enriched: enrichedMap.get(seed.slug) ?? null,
    }));

    return _tools;
}

/**
 * Get a single tool by slug.
 */
export function getToolBySlug(slug: string): Tool | undefined {
    return getAllTools().find(t => t.slug === slug);
}

/**
 * Get all unique categories.
 */
export function getCategories(): string[] {
    const cats = new Set(getAllTools().map(t => t.category));
    return [...cats];
}

/**
 * Other tools in the same category - the alternatives set.
 * Enriched tools first, README order preserved within each group.
 */
export function getAlternativesFor(tool: Tool): Tool[] {
    return getAllTools()
        .filter(t => t.category === tool.category && t.slug !== tool.slug)
        .sort((a, b) => Number(b.enriched !== null) - Number(a.enriched !== null));
}

export interface CategoryInfo {
    /** Full cleaned category name, e.g. "AI-Native IDEs & Editors" */
    name: string;
    /** Short label, e.g. "AI IDEs" */
    short: string;
    /** URL slug, e.g. "ai-ides" */
    slug: string;
    /** One-line description from the README section intro */
    description: string;
    tools: Tool[];
}

export function getCategorySlug(short: string): string {
    return short.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Read the intro line that follows each `## Category` heading in README.md.
 */
function loadCategoryDescriptions(): Map<string, string> {
    const map = new Map<string, string>();
    try {
        const sections = readmeMarkdown.split('\n## ');
        for (const section of sections.slice(1)) {
            const lines = section.split('\n');
            const categoryLine = lines[0].trim();
            if (categoryLine.toLowerCase().includes('table of contents')) continue;
            // First non-empty, non-table, non-blockquote line after the heading
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('|') || line.startsWith('---')) continue;
                if (line.startsWith('>')) break;
                map.set(stripEmoji(categoryLine), line);
                break;
            }
        }
    } catch { /* ignore */ }
    return map;
}

let _categories: CategoryInfo[] | null = null;

/**
 * All categories with descriptions and their tools, in README order.
 */
export function getCategoriesDetailed(): CategoryInfo[] {
    if (_categories) return _categories;

    const descriptions = loadCategoryDescriptions();
    const tools = getAllTools();
    const byCategory = new Map<string, Tool[]>();
    for (const tool of tools) {
        const list = byCategory.get(tool.categoryClean) ?? [];
        list.push(tool);
        byCategory.set(tool.categoryClean, list);
    }

    _categories = [...byCategory.entries()].map(([name, catTools]) => ({
        name,
        short: catTools[0].categoryShort,
        slug: getCategorySlug(catTools[0].categoryShort),
        description: descriptions.get(name) ?? '',
        tools: catTools,
    }));

    return _categories;
}
