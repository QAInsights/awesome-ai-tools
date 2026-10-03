import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import {
    canonicalPair,
    coFavoriteCounts,
    generateCandidates,
    groupLabels,
    normalizeTag,
    pairKey,
    parseGscPagesCsv,
    serializeComparisons,
} from './compare-candidates';
import { comparisonMarkdown, comparisonQuickAnswer, getComparisons, getResolvedComparisons, getTopComparedTools } from './compare';
import type { Comparison } from './compare';
import { getToolBySlug, type Tool } from './tools';

const CATEGORY = 'Terminal & CLI Agents';

function tool(slug: string, tags: string[], category = CATEGORY, complete = true): Tool {
    return {
        slug, name: slug, company: 'Acme', category, categoryClean: category, categoryShort: 'CLI Agents', notes: '', url: 'https://example.com',
        enriched: complete
            ? { slug, tags, description: 'd', keyFeatures: ['k'], bestFor: 'b', verdict: 'v', pricing: 'free', lastUpdated: '2026-09-01' }
            : { slug, tags, description: 'd' },
    };
}

/** Filler tools so the shared test tags stay under the generic-tag share. */
const filler = Array.from({ length: 80 }, (_, i) => tool(`filler-${i}`, [`unique-${i}`, 'ai'], 'Other'));

describe('compare candidates', () => {
    test('normalizes tag case, punctuation and plurals', () => {
        expect(normalizeTag('AI Coding Agents')).toBe('ai coding agent');
        expect(normalizeTag('open-source')).toBe('open source');
        expect(normalizeTag('DevOps')).toBe('devops');
        expect(normalizeTag('SaaS')).toBe('saas');
    });

    test('canonical pairs are alphabetical and order-independent', () => {
        expect(canonicalPair('roo-code', 'kilo-code', 'IDE Extensions')).toEqual({ slug: 'kilo-code-vs-roo-code', a: 'kilo-code', b: 'roo-code', group: 'IDE Extensions' });
        expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
    });

    test('requires same category, two distinctive shared tags, full enrichment and no existing pair', () => {
        const tools = [
            ...filler,
            tool('alpha', ['tui', 'rust', 'ai']),
            tool('beta', ['TUI', 'Rust']),
            tool('gamma', ['tui', 'ai']),
            tool('delta', ['tui', 'rust'], 'Other'),
            tool('epsilon', ['tui', 'rust'], CATEGORY, false),
            tool('zeta', ['tui', 'rust']),
        ];
        const existing: Comparison[] = [{ slug: 'zeta-vs-alpha', a: 'zeta', b: 'alpha', group: 'CLI' }];
        const slugs = generateCandidates(tools, existing).map(c => c.slug);
        expect(slugs).toEqual(['alpha-vs-beta', 'beta-vs-zeta']);
    });

    test('pinned pairs come first and skip the tag minimum; priority tools need one distinctive tag', () => {
        const tools = [...filler, tool('kilo', ['x']), tool('roo', ['y']), tool('open', ['tui', 'ai']), tool('crush', ['tui', 'ai']), tool('p', ['tui', 'rust']), tool('q', ['tui', 'rust'])];
        const slugs = generateCandidates(tools, [], {}, { priorityPairs: [['roo', 'kilo']], priorityTools: ['open'] }).map(c => c.slug);
        expect(slugs.slice(0, 2)).toEqual(['kilo-vs-roo', 'crush-vs-open']);
        expect(slugs).toContain('p-vs-q');
    });

    test('ranks by impressions and co-favorites, then caps pairs per tool', () => {
        const tools = [...filler, tool('a', ['tui', 'rust']), tool('b', ['tui', 'rust']), tool('c', ['tui', 'rust'])];
        const signals = { impressions: new Map([['c', 500]]), coFavorites: new Map([[pairKey('a', 'b'), 3]]) };
        expect(generateCandidates(tools, [], signals).map(c => c.slug)).toEqual(['a-vs-c', 'b-vs-c', 'a-vs-b']);
        expect(generateCandidates(tools, [], signals, { maxPerTool: 1 }).map(c => c.slug)).toEqual(['a-vs-c']);
        expect(generateCandidates(tools, [], signals, { limit: 2 })).toHaveLength(2);
    });

    test('reserved slugs (redirect sources) are never paired', () => {
        const tools = [...filler, tool('windsurf', ['tui', 'rust']), tool('b', ['tui', 'rust'])];
        expect(generateCandidates(tools, [], {}, { reservedSlugs: new Set(['windsurf']) })).toEqual([]);
    });

    test('reuses the group label existing comparisons use for a category', () => {
        const tools = [tool('a', []), tool('b', [], 'Other'), tool('c', [], 'General-Purpose AI Assistants (with Strong Coding Capability)')];
        const labels = groupLabels(tools, [{ slug: 'a-vs-b', a: 'a', b: 'b', group: 'CLI Agents' }]);
        expect(labels.get(CATEGORY)).toBe('CLI Agents');
        expect(labels.get('General-Purpose AI Assistants (with Strong Coding Capability)')).toBe('General-Purpose AI Assistants');
    });

    test('parses GSC page exports into per-tool impressions', () => {
        const csv = 'Top pages,Clicks,Impressions,CTR,Position\nhttps://ai.dosa.dev/tools/roo-code,3,120,2.5%,9\nhttps://ai.dosa.dev/tools/roo-code/alternatives,1,30,3%,12\nhttps://ai.dosa.dev/compare/cline-vs-roo-code,2,50,4%,8\nhttps://ai.dosa.dev/blog/x,1,999,0%,5';
        const totals = parseGscPagesCsv(csv, new Set(['roo-code', 'cline']));
        expect(totals.get('roo-code')).toBe(200);
        expect(totals.get('cline')).toBe(50);
    });

    test('counts users who favorited both tools', () => {
        const rows = [
            { user_id: 'u1', tool_slug: 'a' }, { user_id: 'u1', tool_slug: 'b' },
            { user_id: 'u2', tool_slug: 'a' }, { user_id: 'u2', tool_slug: 'b' }, { user_id: 'u2', tool_slug: 'c' },
        ];
        const counts = coFavoriteCounts(rows);
        expect(counts.get(pairKey('a', 'b'))).toBe(2);
        expect(counts.get(pairKey('b', 'c'))).toBe(1);
    });

    test('serializer round-trips data/comparisons.json byte for byte', () => {
        const raw = readFileSync('data/comparisons.json', 'utf-8');
        expect(serializeComparisons(JSON.parse(raw))).toBe(raw);
    });

    test('generated pairs are canonical and do not drive the most-compared ranking', () => {
        const generated = getComparisons().filter(c => c.source === 'generated');
        expect(generated.length).toBeGreaterThan(0);
        for (const c of generated) expect(c.a < c.b).toBe(true);
        const topSlugs = new Set(getTopComparedTools().map(t => t.slug));
        const curatedOnly = getComparisons().filter(c => !c.source);
        const curatedTools = new Set(curatedOnly.flatMap(c => [c.a, c.b]));
        for (const slug of topSlugs) expect(curatedTools.has(slug)).toBe(true);
    });
});

describe('comparison answer surfaces', () => {
    const kilo = getToolBySlug('kilo-code')!;
    const roo = getToolBySlug('roo-code')!;

    test('quick answer names both tools with pricing and best-for', () => {
        const answer = comparisonQuickAnswer(kilo, roo);
        expect(answer).toStartWith(`${kilo.name} (`);
        expect(answer).toContain(`${roo.name} (`);
        expect(answer).toContain('is best for');
        expect(answer).not.toContain('undefined');
    });

    test('markdown mirror carries quick answer, table, FAQ and links', () => {
        const c = getResolvedComparisons().find(x => x.slug === 'kilo-code-vs-roo-code')!;
        const md = comparisonMarkdown(c);
        expect(md).toStartWith(`# ${kilo.name} vs ${roo.name}`);
        expect(md).toContain('## Quick answer');
        expect(md).toContain('|---|---|---|');
        expect(md).toContain('## FAQ');
        expect(md).toContain('https://ai.dosa.dev/tools/roo-code');
        expect(md).not.toContain('undefined');
    });
});
