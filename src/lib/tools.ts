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
 * Slug generation — mirrors parser.js exactly.
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
 * Mirrors parser.js exactly — slug is name-only first, then name-company on collision.
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
