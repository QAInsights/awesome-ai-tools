/**
 * Verifies that data/slugs.json matches the catalog generated from README.md.
 *
 * Exit codes:
 *   0 — slugs.json is in sync
 *   1 — slugs.json is stale or inconsistent
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdown } from '../js/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const README_PATH = join(ROOT, 'README.md');
const SLUGS_PATH = join(ROOT, 'data', 'slugs.json');

function stripEmoji(value) {
  return String(value ?? '')
    .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
    .trim();
}

function buildCatalog() {
  const markdown = readFileSync(README_PATH, 'utf-8');
  const tools = parseMarkdown(markdown);
  const seen = new Set();
  const catalog = [];

  for (const tool of tools) {
    if (!tool.slug || seen.has(tool.slug)) continue;
    seen.add(tool.slug);
    catalog.push({
      slug: tool.slug,
      name: tool.name,
      company: tool.company,
      category: stripEmoji(tool.category),
    });
  }

  return catalog;
}

const expected = buildCatalog();
const actual = JSON.parse(readFileSync(SLUGS_PATH, 'utf-8'));

if (JSON.stringify(actual) === JSON.stringify(expected)) {
  console.log(`slugs.json is in sync with README.md (${actual.length} tools).`);
  process.exit(0);
}

const actualBySlug = new Map(actual.map((tool) => [tool.slug, tool]));
const expectedBySlug = new Map(expected.map((tool) => [tool.slug, tool]));

const missing = expected.filter((tool) => !actualBySlug.has(tool.slug));
const extra = actual.filter((tool) => !expectedBySlug.has(tool.slug));
const changed = expected.filter((tool) => {
  const current = actualBySlug.get(tool.slug);
  return current && JSON.stringify(current) !== JSON.stringify(tool);
});

console.error('data/slugs.json is out of sync with README.md.');

if (missing.length) {
  console.error('\nMissing slugs:');
  for (const tool of missing) {
    console.error(`- ${tool.slug} (${tool.name})`);
  }
}

if (extra.length) {
  console.error('\nUnexpected slugs:');
  for (const tool of extra) {
    console.error(`- ${tool.slug} (${tool.name})`);
  }
}

if (changed.length) {
  console.error('\nChanged slug entries:');
  for (const tool of changed) {
    console.error(`- ${tool.slug}`);
  }
}

console.error('\nRun `node scripts/generate-tool-pages.js` and commit the updated data/slugs.json.');
process.exit(1);
