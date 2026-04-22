/**
 * Build-time generator for per-tool detail pages.
 *
 * Reads README.md, parses the tool tables via js/parser.js, and for every tool
 * writes:
 *   - tools/<slug>.html      (SEO-complete shell with embedded seed data)
 *   - data/slugs.json        (authoritative slug list, also emitted at repo root
 *                             for the backend scheduler to consume)
 *
 * Regenerates sitemap.xml in-place: preserves hand-written entries at the top
 * and appends one <url> per tool below an AUTO-GENERATED marker.
 *
 * Safe to re-run; output is deterministic w.r.t. README content.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdown, getShortCategory } from '../js/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TEMPLATE_PATH   = join(ROOT, 'src', 'tool-template.html');
const README_PATH     = join(ROOT, 'README.md');
const TOOLS_DIR       = join(ROOT, 'tools');
const DATA_DIR        = join(ROOT, 'data');
const SITEMAP_PATH    = join(ROOT, 'sitemap.xml');
const ENRICHED_PATH   = join(ROOT, 'public', 'data', 'enriched-tools.json');

// Tool pages that are hand-authored — do NOT delete them on regeneration.
const PROTECTED_TOOL_FILES = new Set(['token-counter.html', 'hallucination-scorer.html']);

const AUTO_MARKER_START = '<!-- AUTO-GENERATED TOOL PAGES — DO NOT EDIT MANUALLY -->';
const AUTO_MARKER_END   = '<!-- END AUTO-GENERATED TOOL PAGES -->';

/* ---------- helpers ---------- */

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function escapeJsonForScript(obj) {
    // Embedding JSON inside <script type="application/json">. Escape </script
    // sequences to prevent premature tag close. No HTML escape needed inside
    // the raw JSON node.
    return JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
}

function truncate(str, max) {
    const s = String(str ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
}

function stripEmoji(s) {
    return String(s ?? '')
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
        .trim();
}

/* ---------- core ---------- */

function buildJsonLd(tool, categoryClean, descFull) {
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'SoftwareApplication',
                '@id': `https://ai.dosa.dev/tools/${tool.slug}#app`,
                name: tool.name,
                url: tool.url || `https://ai.dosa.dev/tools/${tool.slug}`,
                description: descFull || tool.notes || '',
                applicationCategory: 'DeveloperApplication',
                operatingSystem: 'Any',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                isPartOf: { '@type': 'WebSite', '@id': 'https://ai.dosa.dev/#website' },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai.dosa.dev' },
                    { '@type': 'ListItem', position: 2, name: categoryClean, item: `https://ai.dosa.dev/#${tool.slug}` },
                    { '@type': 'ListItem', position: 3, name: tool.name, item: `https://ai.dosa.dev/tools/${tool.slug}` },
                ],
            },
        ],
    };
}

function loadEnrichedData() {
    try {
        const raw = readFileSync(ENRICHED_PATH, 'utf-8');
        const data = JSON.parse(raw);
        const map = new Map();
        for (const tool of data) {
            if (tool.slug) map.set(tool.slug, tool);
        }
        return map;
    } catch (err) {
        console.warn('[generate-tool-pages] Could not load enriched data:', err.message);
        return new Map();
    }
}

function renderTemplate(template, tool, enrichedMap) {
    const categoryClean = stripEmoji(tool.category);
    const categoryShort = getShortCategory(tool.category);
    const enriched = enrichedMap.get(tool.slug);
    
    // Full description for JSON-LD (structured data)
    const descFull = enriched?.description || tool.notes || '';
    
    // Truncated description for meta tags (SEO length limits)
    const descMeta = enriched?.description 
        ? truncate(enriched.description, 155)
        : truncate(tool.notes || '', 155);
    
    const keywords = [
        tool.name,
        tool.company,
        categoryClean,
        categoryShort,
        'AI coding',
        'developer tools',
    ].filter(Boolean).join(', ');

    // Seed contains basic info + enriched data if available
    const seed = {
        slug: tool.slug,
        name: tool.name,
        company: tool.company,
        category: tool.category,
        categoryClean,
        categoryShort,
        notes: tool.notes || '',
        url: tool.url || '#',
    };

    // Full enriched data embedded separately for hydration
    const enrichedData = enriched || null;

    const jsonLd = buildJsonLd(tool, categoryClean, descFull);

    return template
        .replaceAll('{{SLUG}}', escapeAttr(tool.slug))
        .replaceAll('{{NAME}}', escapeHtml(tool.name))
        .replaceAll('{{COMPANY}}', escapeHtml(tool.company))
        .replaceAll('{{CATEGORY}}', escapeHtml(tool.category))
        .replaceAll('{{CATEGORY_CLEAN}}', escapeHtml(categoryClean))
        .replaceAll('{{URL}}', escapeAttr(tool.url || '#'))
        .replaceAll('{{NOTES}}', escapeHtml(tool.notes || ''))
        .replaceAll('{{DESCRIPTION_META}}', escapeAttr(descMeta))
        .replaceAll('{{KEYWORDS}}', escapeAttr(keywords))
        .replaceAll('{{JSON_LD}}', escapeJsonForScript(jsonLd))
        .replaceAll('{{SEED_JSON}}', escapeJsonForScript(seed))
        .replaceAll('{{ENRICHED_JSON}}', escapeJsonForScript(enrichedData));
}

function cleanStaleToolPages(keepSlugs) {
    try {
        const entries = readdirSync(TOOLS_DIR);
        for (const entry of entries) {
            if (!entry.endsWith('.html')) continue;
            if (PROTECTED_TOOL_FILES.has(entry)) continue;
            const slug = entry.replace(/\.html$/, '');
            if (!keepSlugs.has(slug)) {
                rmSync(join(TOOLS_DIR, entry), { force: true });
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

function regenerateSitemap(tools) {
    const today = new Date().toISOString().slice(0, 10);

    let existing = '';
    try { existing = readFileSync(SITEMAP_PATH, 'utf-8'); } catch {}

    // Strip any previous auto-generated block
    const startIdx = existing.indexOf(AUTO_MARKER_START);
    if (startIdx !== -1) {
        const endIdx = existing.indexOf(AUTO_MARKER_END, startIdx);
        if (endIdx !== -1) {
            existing = existing.slice(0, startIdx) + existing.slice(endIdx + AUTO_MARKER_END.length);
        }
    }

    const block = tools.map(t => `  <url>
    <loc>https://ai.dosa.dev/tools/${t.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

    const auto = `\n  ${AUTO_MARKER_START}\n${block}\n  ${AUTO_MARKER_END}\n`;

    // Inject before the closing </urlset>
    const closeTag = '</urlset>';
    const closeIdx = existing.lastIndexOf(closeTag);
    let next;
    if (closeIdx === -1) {
        // Sitemap is missing / malformed — emit a fresh one
        next = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${auto}${closeTag}\n`;
    } else {
        next = existing.slice(0, closeIdx).replace(/\s+$/, '') + auto + closeTag + '\n';
    }

    writeFileSync(SITEMAP_PATH, next, 'utf-8');
}

export async function generateToolPages() {
    const template = readFileSync(TEMPLATE_PATH, 'utf-8');
    const md       = readFileSync(README_PATH, 'utf-8');
    const tools    = parseMarkdown(md);
    const enrichedMap = loadEnrichedData();
    const enrichedCount = enrichedMap.size;
    if (enrichedCount > 0) {
        console.log(`[generate-tool-pages] Loaded enriched data for ${enrichedCount} tools`);
    }

    mkdirSync(TOOLS_DIR, { recursive: true });
    mkdirSync(DATA_DIR, { recursive: true });

    const slugs = new Set();
    for (const tool of tools) {
        if (!tool.slug) continue;
        if (slugs.has(tool.slug)) {
            console.warn(`[generate-tool-pages] Duplicate slug after collision pass: ${tool.slug}`);
            continue;
        }
        slugs.add(tool.slug);
        const html = renderTemplate(template, tool, enrichedMap);
        writeFileSync(join(TOOLS_DIR, `${tool.slug}.html`), html, 'utf-8');
    }

    // Emit slug catalog for the backend scheduler
    const catalog = tools.map(t => ({
        slug: t.slug,
        name: t.name,
        company: t.company,
        category: stripEmoji(t.category),
    }));
    writeFileSync(join(DATA_DIR, 'slugs.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    cleanStaleToolPages(slugs);
    regenerateSitemap(tools);

    return { count: slugs.size };
}

// Allow direct invocation for quick dev: `bun run scripts/generate-tool-pages.js`
if (import.meta.main) {
    const { count } = await generateToolPages();
    console.log(`Generated ${count} tool detail pages.`);
}
