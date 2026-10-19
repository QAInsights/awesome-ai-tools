import { describe, expect, test } from 'bun:test';
import { buildStackMatcherCatalog } from './stack-matcher-catalog';
import { getAllTools } from './tools';
import { CURATED_SLUGS } from '../../js/stack-matcher-data.js';

const catalog = buildStackMatcherCatalog(getAllTools());

describe('stack-matcher catalog', () => {
  test('includes every category-mapped and curated tool', () => {
    expect(Object.keys(catalog).length).toBeGreaterThan(100);
  });

  test('cursor is present with real seat plans', () => {
    const cursor = catalog['cursor']!;
    expect(cursor).toBeDefined();
    expect(cursor.plans.length).toBeGreaterThan(0);
    expect(cursor.plans.every(p => p.monthlyAmount >= 1)).toBe(true);
  });

  test('non-curated Code Review tools become candidates', () => {
    const curated = new Set(CURATED_SLUGS);
    const nonCurated = Object.values(catalog).filter(
      e => e.categoryShort === 'Code Review' && !curated.has(e.slug),
    );
    expect(nonCurated.length).toBeGreaterThan(0);
    expect(catalog['open-code-review']!).toBeDefined();
  });

  test('drops junk sub-$1 plans', () => {
    const qodo = catalog['qodo-qodo']!;
    expect(qodo).toBeDefined();
    expect(qodo.plans.every(p => p.monthlyAmount >= 1)).toBe(true);
    expect(qodo.plans.length).toBe(0);
  });

  test('localHint detects self-hosted / local-first tools', () => {
    expect(catalog['aider']!.localHint).toBe(true);
  });

  test('excludes discontinued tools', () => {
    expect(catalog['continue']).toBeUndefined();
  });
});
