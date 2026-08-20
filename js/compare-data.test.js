/**
 * Tests for data/comparisons.json - the curated comparison page registry.
 *
 * Guards against broken static paths: unknown tool slugs, duplicate pairs,
 * slug drift, and tools without enriched data (comparison pages are built
 * entirely from enriched fields).
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const comparisons = JSON.parse(readFileSync(join(ROOT, 'data', 'comparisons.json'), 'utf-8'));
const slugs = new Set(JSON.parse(readFileSync(join(ROOT, 'data', 'slugs.json'), 'utf-8')).map(t => t.slug));
const enriched = new Set(JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'enriched-tools.json'), 'utf-8')).map(t => t.slug));
const cloudflareRedirects = new Set(
    readFileSync(join(ROOT, 'public', '_redirects'), 'utf-8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.split(/\s+/)[0])
);

describe('comparisons data', () => {
    test('has a non-trivial curated set', () => {
        expect(comparisons.length).toBeGreaterThanOrEqual(30);
    });

    test('slugs are unique', () => {
        const seen = new Set(comparisons.map(c => c.slug));
        expect(seen.size).toBe(comparisons.length);
    });

    test('slug matches canonical a-vs-b form', () => {
        for (const c of comparisons) {
            expect(c.slug).toBe(`${c.a}-vs-${c.b}`);
        }
    });

    test('no self-comparisons or duplicate unordered pairs', () => {
        const pairs = new Set();
        for (const c of comparisons) {
            expect(c.a).not.toBe(c.b);
            const key = [c.a, c.b].sort().join('~');
            expect(pairs.has(key)).toBe(false);
            pairs.add(key);
        }
    });

    test('every referenced tool exists in the directory', () => {
        for (const c of comparisons) {
            expect(slugs.has(c.a)).toBe(true);
            expect(slugs.has(c.b)).toBe(true);
        }
    });

    test('every referenced tool has enriched data', () => {
        for (const c of comparisons) {
            expect(enriched.has(c.a)).toBe(true);
            expect(enriched.has(c.b)).toBe(true);
        }
    });

    test('every comparison has a group label', () => {
        for (const c of comparisons) {
            expect(typeof c.group).toBe('string');
            expect(c.group.length).toBeGreaterThan(0);
        }
    });

    test('every pair has a reverse-order redirect in public/_redirects', () => {
        for (const c of comparisons) {
            expect(cloudflareRedirects.has(`/compare/${c.b}-vs-${c.a}`)).toBe(true);
        }
    });
});
