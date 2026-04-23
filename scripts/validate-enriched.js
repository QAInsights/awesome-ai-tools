/**
 * validate-enriched.js
 *
 * Cross-references data/slugs.json against public/data/enriched-tools.json
 * and reports which tool pages are missing enriched data.
 *
 * Usage:
 *   bun run scripts/validate-enriched.js
 *   node scripts/validate-enriched.js
 *
 * Exit codes:
 *   0  — all tools have enriched data
 *   1  — one or more tools are missing enriched data
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const slugs    = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs.json'), 'utf-8'));
const enriched = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'enriched-tools.json'), 'utf-8'));

// Build a fast lookup: slug → enriched entry
const enrichedMap = new Map(enriched.map(e => [e.slug, e]));

const missing = [];
const present = [];

for (const tool of slugs) {
  if (enrichedMap.has(tool.slug)) {
    present.push(tool.slug);
  } else {
    missing.push(tool);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n✅ Enriched:  ${present.length} / ${slugs.length} tools`);
console.log(`❌ Missing:   ${missing.length} / ${slugs.length} tools\n`);

if (missing.length > 0) {
  console.log('Tools missing enriched data:');
  console.log('─'.repeat(72));
  const colW = [30, 28, 14];
  console.log(
    'Slug'.padEnd(colW[0]) +
    'Tool Name'.padEnd(colW[1]) +
    'Company'
  );
  console.log('─'.repeat(72));
  for (const t of missing) {
    console.log(
      t.slug.padEnd(colW[0]) +
      (t.name ?? '').padEnd(colW[1]) +
      (t.company ?? '')
    );
  }
  console.log('─'.repeat(72));
  console.log(`\n💡 Tip: enriched-tools.json uses the slug as the primary key.`);
  console.log(`   Check that each missing tool has a matching "slug" field in`);
  console.log(`   public/data/enriched-tools.json.\n`);
  process.exit(1);
} else {
  console.log('🎉 All tool pages have enriched data.\n');
  process.exit(0);
}
