/**
 * Build-time tool data loader.
 *
 * Reads README.md and enriched-tools.json at build time and produces
 * a combined array of tool objects for use in Astro pages/components.
 * This replaces the runtime fetch + parse approach in the old app.js.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// process.cwd() is the project root when run by Astro's build pipeline
const ROOT = process.cwd();

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

const CATEGORY_SHORT: Record<string, string> = {
    'Full IDE': 'IDE',
    'Editor Extension': 'Ext',
    'Terminal Agent': 'CLI',
    'Autonomous Agent': 'Agent',
    'Browser-Based Builder': 'Builder',
    'Code Review': 'Review',
    'AI Chat': 'Chat',
    'Code Completion': 'Complete',
    'AI Platform': 'Platform',
    'AI Search': 'Search',
    'AI DevOps': 'DevOps',
};

function getShortCategory(category: string): string {
    const clean = stripEmoji(category);
    for (const [key, short] of Object.entries(CATEGORY_SHORT)) {
        if (clean.includes(key)) return short;
    }
    return clean.slice(0, 6);
}

function slugify(name: string, company: string): string {
    const combined = `${company}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return combined;
}

/**
 * Parse the markdown tool tables from README.md
 * Mirrors the logic in js/parser.js
 */
function parseMarkdown(text: string): ToolSeed[] {
    const tools: ToolSeed[] = [];
    const slugCounts = new Map<string, number>();

    const lines = text.split('\n');
    let currentCategory = '';

    for (const line of lines) {
        // Detect category heading
        const headingMatch = line.match(/^#{1,3}\s+(.+)/);
        if (headingMatch) {
            currentCategory = headingMatch[1].trim();
            continue;
        }

        // Parse table rows — skip header and separator
        if (!line.startsWith('|') || line.includes('---')) continue;

        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 3) continue;

        // Row format: | Name | Company | Notes |
        // Name cell may be [Name](url)
        const nameCell = cells[0] ?? '';
        const company = cells[1] ?? '';
        const notes = cells[2] ?? '';

        const linkMatch = nameCell.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (!linkMatch) continue;

        const name = linkMatch[1].trim();
        const url = linkMatch[2].trim();
        if (!name || !url) continue;

        const categoryClean = stripEmoji(currentCategory);
        const categoryShort = getShortCategory(currentCategory);

        // Slug collision handling
        let baseSlug = slugify(name, company);
        const count = slugCounts.get(baseSlug) ?? 0;
        slugCounts.set(baseSlug, count + 1);
        const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;

        tools.push({
            slug,
            name,
            company,
            category: currentCategory,
            categoryClean,
            categoryShort,
            notes,
            url,
        });
    }

    return tools;
}

/**
 * Load enriched tool data from public/data/enriched-tools.json
 */
function loadEnriched(): Map<string, EnrichedTool> {
    try {
        const raw = readFileSync(join(ROOT, 'public', 'data', 'enriched-tools.json'), 'utf-8');
        const arr: EnrichedTool[] = JSON.parse(raw);
        const map = new Map<string, EnrichedTool>();
        for (const t of arr) {
            if (t.slug) map.set(t.slug, t);
        }
        return map;
    } catch {
        return new Map();
    }
}

// ── public API ────────────────────────────────────────────────────────────────

let _tools: Tool[] | null = null;

/**
 * Returns all tools (lazy-loaded and cached).
 * Safe to call multiple times — only reads files once.
 */
export function getAllTools(): Tool[] {
    if (_tools) return _tools;

    const readmePath = join(ROOT, 'README.md');
    const md = readFileSync(readmePath, 'utf-8');
    const seeds = parseMarkdown(md);
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
