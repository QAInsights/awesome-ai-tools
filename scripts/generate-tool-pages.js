/**
 * Build-time generator for slug catalog.
 *
 * Reads README.md, parses the tool tables via js/parser.js, and
 * writes data/slugs.json (authoritative slug list, emitted at repo root
 * for the backend scheduler to consume).
 *
 * (Note: HTML generation and sitemap updates were removed in Phase 8 of the
 * Astro migration since Astro handles those natively via src/pages/tools/[slug].astro).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdown } from '../js/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const README_PATH     = join(ROOT, 'README.md');
const DATA_DIR        = join(ROOT, 'data');

function stripEmoji(s) {
    return String(s ?? '')
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
        .trim();
}

export async function generateToolPages() {
    const md       = readFileSync(README_PATH, 'utf-8');
    const tools    = parseMarkdown(md);

    mkdirSync(DATA_DIR, { recursive: true });

    // addedAt is the day a slug first enters the catalog; keep the stored
    // stamp on regenerations and stamp genuinely new slugs with today.
    const slugsPath = join(DATA_DIR, 'slugs.json');
    let priorBySlug = new Map();
    try {
        const prior = JSON.parse(readFileSync(slugsPath, 'utf-8'));
        if (Array.isArray(prior)) {
            for (const entry of prior) {
                if (entry?.slug && typeof entry?.addedAt === 'string') priorBySlug.set(entry.slug, entry);
            }
        }
    } catch { /* first generation or unreadable file: everyone gets stamped today */ }
    const today = new Date().toISOString().slice(0, 10);

    const slugs = new Set();
    const catalog = [];

    for (const tool of tools) {
        if (!tool.slug) continue;
        if (slugs.has(tool.slug)) {
            console.warn(`[generate-tool-pages] Duplicate slug after collision pass: ${tool.slug}`);
            continue;
        }
        slugs.add(tool.slug);
        catalog.push({
            slug: tool.slug,
            name: tool.name,
            company: tool.company,
            category: stripEmoji(tool.category),
            addedAt: priorBySlug.get(tool.slug)?.addedAt ?? today,
        });
    }

    // Emit slug catalog for the backend scheduler
    writeFileSync(slugsPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    // Slugs that left the catalog keep their drop record in
    // data/removed-slugs.json so /new/<date> permalinks outlive removals.
    const removedPath = join(DATA_DIR, 'removed-slugs.json');
    let removedBySlug = new Map();
    try {
        const removed = JSON.parse(readFileSync(removedPath, 'utf-8'));
        if (Array.isArray(removed)) {
            for (const entry of removed) {
                if (entry?.slug) removedBySlug.set(entry.slug, entry);
            }
        }
    } catch { /* no removed file yet */ }
    for (const entry of priorBySlug.values()) {
        if (!slugs.has(entry.slug)) removedBySlug.set(entry.slug, entry);
    }
    for (const slug of slugs) removedBySlug.delete(slug);
    const removedList = [...removedBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    writeFileSync(removedPath, JSON.stringify(removedList, null, 2) + '\n', 'utf-8');

    return { count: slugs.size };
}

// Allow direct invocation for quick dev
if (import.meta.main) {
    const { count } = await generateToolPages();
    console.log(`Generated slugs.json catalog with ${count} tools.`);
}

