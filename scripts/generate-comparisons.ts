/**
 * Grow data/comparisons.json with niche same-category pairs.
 *
 * Usage:
 *   bun scripts/generate-comparisons.ts [--limit 25] [--max-per-tool 3]
 *     [--gsc pages.csv] [--favorites favorites.json] [--dry-run]
 *
 * --gsc        Search Console "Pages" export (CSV with page URL + Impressions).
 * --favorites  `wrangler d1 execute DB --remote --json --command
 *              "SELECT user_id, tool_slug FROM favorites"` output.
 *
 * New pairs use alphabetical slug order; the reverse order is added to
 * public/_redirects as a 301 so a-vs-b and b-vs-a never both resolve to a page.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';
import { getAllTools } from '../src/lib/tools';
import type { Comparison } from '../src/lib/compare';
import { coFavoriteCounts, generateCandidates, parseGscPagesCsv, serializeComparisons } from '../src/lib/compare-candidates';

const PRIORITY_PAIRS: [string, string][] = [['roo-code', 'kilo-code']];
const PRIORITY_TOOLS = ['opencode', 'zed', 'codebuff', 'openchamber'];

const ROOT = process.cwd();
const COMPARISONS = join(ROOT, 'data', 'comparisons.json');
const REDIRECTS = join(ROOT, 'public', '_redirects');

const { values } = parseArgs({
    options: {
        limit: { type: 'string', default: '25' },
        'max-per-tool': { type: 'string', default: '3' },
        gsc: { type: 'string' },
        favorites: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
    },
});

const tools = getAllTools();
const existing: Comparison[] = JSON.parse(readFileSync(COMPARISONS, 'utf-8'));
const redirects = readFileSync(REDIRECTS, 'utf-8');
const redirectSources = redirects.split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
const reservedSlugs = new Set(redirectSources.flatMap(src => src?.match(/^\/tools\/([^/]+)$/)?.[1] ?? []));

const impressions = values.gsc
    ? parseGscPagesCsv(readFileSync(values.gsc, 'utf-8'), new Set(tools.map(t => t.slug)))
    : undefined;
const favoritesJson = values.favorites ? JSON.parse(readFileSync(values.favorites, 'utf-8')) : null;
const favoriteRows = Array.isArray(favoritesJson?.[0]?.results) ? favoritesJson[0].results : favoritesJson;
const coFavorites = Array.isArray(favoriteRows) ? coFavoriteCounts(favoriteRows) : undefined;

const picked = generateCandidates(tools, existing, { impressions, coFavorites }, {
    priorityPairs: PRIORITY_PAIRS,
    priorityTools: PRIORITY_TOOLS,
    reservedSlugs,
    maxPerTool: Number(values['max-per-tool']),
    limit: Number(values.limit),
}).filter(c => !redirectSources.includes(`/compare/${c.slug}`) && !redirectSources.includes(`/compare/${c.b}-vs-${c.a}`));

console.log(`Signals: ${impressions ? `${impressions.size} tools with GSC impressions` : 'no GSC export'}, ${coFavorites ? `${coFavorites.size} co-favorited pairs` : 'no favorites export'}`);
console.log(`${picked.length} new pairs (${existing.length} -> ${existing.length + picked.length}):`);
for (const c of picked) {
    console.log(`  ${c.slug.padEnd(48)} ${c.group.padEnd(26)} tags: ${c.sharedTags.join(', ')} | imp ${c.impressions} | cofav ${c.coFavorites}`);
}

if (!values['dry-run'] && picked.length) {
    const added: Comparison[] = picked.map(({ slug, a, b, group }) => ({ slug, a, b, group, source: 'generated' }));
    writeFileSync(COMPARISONS, serializeComparisons([...existing, ...added]));
    const lines = added.map(c => `/compare/${c.b}-vs-${c.a} /compare/${c.slug} 301`);
    writeFileSync(REDIRECTS, `${redirects.replace(/\n*$/, '\n')}${lines.join('\n')}\n`);
    console.log(`Wrote ${COMPARISONS} and ${REDIRECTS}`);
}
