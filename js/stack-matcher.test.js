import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { getAllTools } from '../src/lib/tools.ts';
import { buildStackMatcherCatalog } from '../src/lib/stack-matcher-catalog.ts';
import {
  CURATED_PROFILES,
  CURATED_SLUGS,
  DEFAULT_ANSWERS,
  PERSONA_PRESETS,
  QUIZ_DIMENSIONS,
  buildMatcherUrlSearch,
  buildProfiles,
  formatRecommendedStackMarkdown,
  parseMatcherUrlState,
  rankSlot,
  recommendStack,
} from './stack-matcher.js';

const catalog = buildStackMatcherCatalog(getAllTools());
const profiles = buildProfiles(catalog);
const PROFILE_BY_SLUG = new Map(profiles.map(p => [p.slug, p]));
const ctx = { catalog };

const CATALOG_SLUGS = new Set(
  JSON.parse(readFileSync(new URL('../data/slugs.json', import.meta.url), 'utf-8')).map(s => s.slug),
);

// Snapshot of engine output against the real catalog.
const PERSONA_EXPECTATIONS = {
  'agentic-pro': ['Cursor', 'Claude Code', 'CodeRabbit'],
  'indie-shipper': ['Cursor', 'Aider', 'Qodo'],
  'local-private': ['Cline', 'Aider', 'Kodus'],
  'terminal-native': ['Claude Code', 'OpenCode', 'CodeRabbit'],
};

function allAnswerCombos() {
  const combos = [];
  for (const editor of QUIZ_DIMENSIONS[0].options)
    for (const budget of QUIZ_DIMENSIONS[1].options)
      for (const privacy of QUIZ_DIMENSIONS[2].options)
        for (const workflow of QUIZ_DIMENSIONS[3].options)
          combos.push({ editor: editor.id, budget: budget.id, privacy: privacy.id, workflow: workflow.id });
  return combos;
}

describe('stack-matcher data', () => {
  test('every curated slug exists in the catalog and slugs.json', () => {
    for (const slug of CURATED_SLUGS) {
      expect(CATALOG_SLUGS.has(slug)).toBe(true);
      expect(catalog[slug]).toBeDefined();
    }
  });

  test('every curated profile has slots, env, privacy, workflows, and a short why', () => {
    for (const p of CURATED_PROFILES) {
      expect(p.slots.length).toBeGreaterThanOrEqual(1);
      expect(p.env.length).toBeGreaterThanOrEqual(1);
      expect(p.privacy.length).toBeGreaterThanOrEqual(1);
      expect(p.workflows.length).toBeGreaterThanOrEqual(1);
      expect(p.why.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('stack-matcher engine', () => {
  test('non-curated Code Review tools rank as quality candidates', () => {
    const curated = new Set(CURATED_SLUGS);
    const { candidates } = rankSlot('quality', DEFAULT_ANSWERS, [], profiles);
    expect(
      candidates.some(
        c => !curated.has(c.profile.slug) && c.profile.categoryShort === 'Code Review',
      ),
    ).toBe(true);
  });

  test('claude-code derives a real power-tier seat from catalog plans', () => {
    const profile = PROFILE_BY_SLUG.get('claude-code');
    expect(profile.seat.power.amount).toBeGreaterThanOrEqual(50);
    const planNames = catalog['claude-code'].plans.map(p => p.name);
    expect(planNames).toContain(profile.seat.power.name);
  });

  test('all 192 answer combinations return 3 distinct valid selections', () => {
    const combos = allAnswerCombos();
    expect(combos.length).toBe(192);
    for (const answers of combos) {
      const rec = recommendStack(answers, ctx);
      expect(rec.slots.length).toBe(3);
      const slugs = rec.slots.map(s => s.selected.slug);
      expect(new Set(slugs).size).toBe(3);
      for (const slot of rec.slots) {
        expect(PROFILE_BY_SLUG.get(slot.selected.slug).slots).toContain(slot.slotId);
      }
    }
  });

  test('budget free + privacy local yields a fully local $0 stack', () => {
    for (const editor of ['vscode', 'terminal', 'jetbrains', 'browser']) {
      for (const workflow of ['fullstack', 'agentic', 'review', 'greenfield']) {
        const rec = recommendStack({ editor, budget: 'free', privacy: 'local', workflow }, ctx);
        for (const slot of rec.slots) {
          const profile = PROFILE_BY_SLUG.get(slot.selected.slug);
          expect(slot.selected.seatMonthly).toBe(0);
          expect(profile.freeOk).toBe(true);
          expect(profile.privacy).toContain('local');
        }
      }
    }
  });

  test('budget indie never picks a non-free tool with unknown or >$25 seats', () => {
    for (const editor of ['vscode', 'terminal', 'jetbrains', 'browser']) {
      for (const privacy of ['cloud', 'byok', 'local']) {
        const rec = recommendStack({ editor, budget: 'indie', privacy, workflow: 'fullstack' }, ctx);
        for (const slot of rec.slots) {
          const profile = PROFILE_BY_SLUG.get(slot.selected.slug);
          if (!profile.freeOk) {
            expect(profile.seat).not.toBeNull();
            expect(profile.seat.indie.amount).toBeLessThanOrEqual(25);
          }
        }
      }
    }
  });

  test('overrides force a pick and surface the natural choice as alternative', () => {
    const rec = recommendStack(DEFAULT_ANSWERS, ctx, { primary: 'zed' });
    expect(rec.slots[0].selected.slug).toBe('zed');
    expect(rec.slots[0].selected.overridden).toBe(true);
    expect(rec.slots[1].selected.slug).not.toBe('zed');
    expect(rec.slots[2].selected.slug).not.toBe('zed');
    const natural = recommendStack(DEFAULT_ANSWERS, ctx);
    expect(rec.slots[0].alternatives[0].slug).toBe(natural.slots[0].selected.slug);
  });

  test.each(PERSONA_PRESETS.map(p => [p.id, p]))('persona %s yields a 3-slot stack', (id, preset) => {
    const rec = recommendStack(preset.answers, ctx);
    expect(rec.slots.length).toBe(3);
    for (const slot of rec.slots) expect(slot.selected.slug).toBeTruthy();
    expect(rec.slots.map(s => s.selected.name)).toEqual(PERSONA_EXPECTATIONS[id]);
  });

  test('costCalculatorUrl links back with team, preset, and real plan seats', () => {
    const rec = recommendStack(DEFAULT_ANSWERS, ctx);
    expect(rec.costCalculatorUrl.startsWith('/tools/cost-calculator?')).toBe(true);
    expect(rec.costCalculatorUrl).toContain('team=1');
    expect(rec.costCalculatorUrl).toContain('preset=');

    const agentic = recommendStack({ editor: 'terminal', budget: 'power', privacy: 'byok', workflow: 'agentic' }, ctx);
    expect(agentic.costCalculatorUrl).toContain('preset=agentic');

    const pro = recommendStack(PERSONA_PRESETS.find(p => p.id === 'agentic-pro').answers, ctx);
    expect(pro.costCalculatorUrl).toContain('claude-code%3A');
    const seats = new URLSearchParams(pro.costCalculatorUrl.split('?')[1]).get('seats');
    const token = seats.split(',').find(t => t.startsWith('claude-code:'));
    const planNames = catalog['claude-code'].plans.map(p => p.name);
    expect(planNames).toContain(token.split(':').slice(1).join(':'));
  });

  test('rulesConverterUrl picks two distinct rules formats', () => {
    const rec = recommendStack(DEFAULT_ANSWERS, ctx);
    expect(rec.rulesConverterUrl).toContain('from=');
    expect(rec.rulesConverterUrl).toContain('to=');
    const params = new URLSearchParams(rec.rulesConverterUrl.split('?')[1]);
    expect(params.get('from')).not.toBe(params.get('to'));
  });

  test('URL state round-trips through build and parse', () => {
    const state = {
      answers: { editor: 'terminal', budget: 'power', privacy: 'byok', workflow: 'agentic' },
      overrides: { companion: 'cline' },
    };
    const parsed = parseMatcherUrlState(buildMatcherUrlSearch(state));
    expect(parsed.answers).toEqual(state.answers);
    expect(parsed.overrides).toEqual(state.overrides);
  });

  test('unknown answers fall back to defaults; malformed slugs dropped', () => {
    const parsed = parseMatcherUrlState('?editor=nope&budget=indie&s1=Not A Slug&s2=cline');
    expect(parsed.answers.editor).toBe('vscode');
    expect(parsed.answers.budget).toBe('indie');
    expect(parsed.overrides).toEqual({ companion: 'cline' });
  });

  test('persona preset param applies then explicit params override', () => {
    const parsed = parseMatcherUrlState('?preset=terminal-native');
    expect(parsed.preset).toBe('terminal-native');
    expect(parsed.answers).toEqual({ editor: 'terminal', budget: 'power', privacy: 'byok', workflow: 'agentic' });

    const mixed = parseMatcherUrlState('?preset=terminal-native&editor=vscode');
    expect(mixed.answers.editor).toBe('vscode');
    expect(mixed.answers.workflow).toBe('agentic');
  });

  test('formatRecommendedStackMarkdown includes title, links, and share URL', () => {
    const rec = recommendStack(DEFAULT_ANSWERS, ctx);
    const md = formatRecommendedStackMarkdown(rec, 'https://ai.dosa.dev');
    expect(md).toContain(`# ${rec.title}`);
    for (const slot of rec.slots) {
      expect(md).toContain(`[${slot.selected.name}](https://ai.dosa.dev/tools/${slot.selected.slug})`);
    }
    expect(md).toContain(`https://ai.dosa.dev/tools/stack-matcher${buildMatcherUrlSearch(rec)}`);
    expect(md).toContain(`**Estimated:** ${rec.estimatedMonthlyText}`);
  });
});
