import { describe, expect, test } from 'bun:test';
import { RULE_FORMATS } from '../../js/rules-converter.js';
import {
    TOOL_RULES_PROFILE,
    buildMigrationSteps,
    buildSwitchFaqs,
    computeCostDelta,
    getResolvedSwitchGuides,
    getReverseGuide,
    getSwitchGuides,
    getSwitchGuidesBetween,
    resolveSwitchGuide,
    switchGuideMarkdown,
} from './switch-guides';
import { getToolBySlug } from './tools';
import { getIndexingDecisions, robotsFor } from './indexing';

const FORMAT_IDS = new Set(RULE_FORMATS.map((f: { id: string }) => f.id));

describe('switch guides data', () => {
    const guides = getSwitchGuides();
    const resolved = getResolvedSwitchGuides();

    test('every entry resolves against the tool catalog and there are 22', () => {
        expect(guides.length).toBe(22);
        expect(resolved.length).toBe(22);
        for (const g of resolved) {
            expect(g.fromTool).toBeTruthy();
            expect(g.toTool).toBeTruthy();
        }
        for (const g of guides) expect(resolveSwitchGuide(g)).not.toBeNull();
    });

    test('slugs are unique, equal "<from>-to-<to>", and from !== to', () => {
        const slugs = guides.map(g => g.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const g of guides) {
            expect(g.slug).toBe(`${g.from}-to-${g.to}`);
            expect(g.from).not.toBe(g.to);
        }
    });

    test('every rules profile maps to a real converter format', () => {
        for (const [slug, profile] of Object.entries(TOOL_RULES_PROFILE)) {
            expect(FORMAT_IDS.has(profile.format)).toBe(true);
            expect(profile.path.length).toBeGreaterThan(0);
        }
    });

    test('converter hrefs use valid, differing format ids', () => {
        for (const g of resolved) {
            if (!g.converterHref) continue;
            const params = new URLSearchParams(g.converterHref.split('?')[1]);
            const from = params.get('from');
            const to = params.get('to');
            expect(FORMAT_IDS.has(from!)).toBe(true);
            expect(FORMAT_IDS.has(to!)).toBe(true);
            expect(from).not.toBe(to);
            expect(g.converterHref.startsWith('/tools/rules-converter?')).toBe(true);
        }
        // a converter link exists exactly when both profiles differ
        for (const g of resolved) {
            const shouldExist = Boolean(g.fromProfile && g.toProfile && g.fromProfile.format !== g.toProfile.format);
            expect(Boolean(g.converterHref)).toBe(shouldExist);
        }
    });
});

describe('cost delta', () => {
    test('cursor to claude-code yields finite numbers and a non-empty summary', () => {
        const cursor = getToolBySlug('cursor')!;
        const claude = getToolBySlug('claude-code')!;
        const delta = computeCostDelta(cursor, claude);
        expect(Number.isFinite(delta.fromMonthlyPerSeat)).toBe(true);
        expect(Number.isFinite(delta.toMonthlyPerSeat)).toBe(true);
        expect(Number.isFinite(delta.monthlyDeltaPerSeat)).toBe(true);
        expect(delta.annualDeltaTeam10).toBe(delta.monthlyDeltaPerSeat * 120);
        expect(delta.summary.length).toBeGreaterThan(0);
        expect(delta.calculatorHref).toContain('/tools/cost-calculator?team=10&seats=claude-code');
    });

    test('BYOK, unlisted and same-price kinds follow the parsed pricing data', () => {
        const bySlug = new Map(getResolvedSwitchGuides().map(g => [g.slug, g]));
        expect(bySlug.get('cursor-to-cline')?.costDelta.kind).toBe('byok');
        expect(bySlug.get('claude-code-to-aider')?.costDelta.kind).toBe('byok');
        const codex = bySlug.get('cursor-to-codex-cli')?.costDelta;
        expect(codex?.kind).toBe('unlisted');
        expect(codex?.summary).toContain('no fixed per-seat price');
        expect(codex?.summary).toContain('Included in ChatGPT plans');
        expect(bySlug.get('cursor-to-antigravity')?.costDelta.kind).toBe('unlisted');
        expect(bySlug.get('github-copilot-to-supermaven')?.costDelta.kind).toBe('same');
    });
});

describe('migration steps and FAQs', () => {
    const resolved = getResolvedSwitchGuides();

    test('every guide produces exactly 4 non-empty steps', () => {
        for (const g of resolved) {
            const steps = buildMigrationSteps(g);
            expect(steps.length).toBe(4);
            for (const s of steps) {
                expect(s.name.length).toBeGreaterThan(0);
                expect(s.text.length).toBeGreaterThan(0);
            }
        }
    });

    test('step 1 links the rules converter when a converter href exists', () => {
        for (const g of resolved) {
            const steps = buildMigrationSteps(g);
            if (g.converterHref) expect(steps[0]!.url).toBe(g.converterHref);
        }
    });

    test('every guide produces exactly 4 FAQs', () => {
        for (const g of resolved) {
            const faqs = buildSwitchFaqs(g);
            expect(faqs.length).toBe(4);
            for (const f of faqs) {
                expect(f.q.length).toBeGreaterThan(0);
                expect(f.a.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('markdown mirror', () => {
    test('cursor-to-claude-code contains the H1 and the converter URL', () => {
        const g = getResolvedSwitchGuides().find(x => x.slug === 'cursor-to-claude-code')!;
        const md = switchGuideMarkdown(g);
        expect(md).toContain('# Switch from Cursor to Claude Code');
        expect(md).toContain('https://ai.dosa.dev/tools/rules-converter?from=cursor-mdc&to=claude-md');
        expect(md).toContain('https://ai.dosa.dev/switch/claude-code-to-cursor');
    });
});

describe('direction and lookups', () => {
    test('getSwitchGuidesBetween finds both directions of a pair', () => {
        const between = getSwitchGuidesBetween('cursor', 'devin');
        expect(between.length).toBe(2);
        const guide = between.find(g => g.from === 'cursor')!;
        const reverse = getReverseGuide(guide);
        expect(reverse?.slug).toBe('devin-to-cursor');
    });
});

describe('indexing', () => {
    test('every /switch page has an indexing decision and most are indexable', () => {
        const resolved = getResolvedSwitchGuides();
        const decisions = getIndexingDecisions();
        const noindexed: string[] = [];
        for (const g of resolved) {
            const path = `/switch/${g.slug}`;
            expect(() => robotsFor(path)).not.toThrow();
            const decision = decisions.get(path);
            if (!decision?.indexable) noindexed.push(`${path}: ${decision?.reasons.join('; ') ?? 'no decision'}`);
        }
        const indexable = resolved.length - noindexed.length;
        expect(indexable, `noindexed switch guides:\n${noindexed.join('\n')}`).toBeGreaterThanOrEqual(18);
    });
});
