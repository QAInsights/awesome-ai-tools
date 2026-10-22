/**
 * AI Coding Stack Matcher — pure recommendation engine (zero DOM).
 * Every catalog tool in a matcher-relevant category is a candidate via
 * CATEGORY_SLOT_DEFAULTS inference; CURATED_PROFILES overrides capability
 * signals. Pricing/free-tier/enterprise signals come from the catalog.
 */

import { CATEGORY_SLOT_DEFAULTS, CURATED_PROFILES, DEFAULT_ANSWERS, PERSONA_PRESETS, QUIZ_DIMENSIONS, SLOT_DEFS } from './stack-matcher-data.js';

export * from './stack-matcher-data.js';

const SLOT_ORDER = SLOT_DEFS.map(s => s.id);
const SLOT_URL_PARAMS = { primary: 's1', companion: 's2', quality: 's3' };
const URL_SLOT_PARAMS = { s1: 'primary', s2: 'companion', s3: 'quality' };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTERPRISE_PLAN_RE = /business|team|enterprise|org/i;

const WORKFLOW_TITLE = { fullstack: 'Full-Stack', agentic: 'Agentic', review: 'Review-First', greenfield: 'Greenfield' };
const EDITOR_TITLE = { vscode: 'Editor', terminal: 'Terminal', jetbrains: 'JetBrains', browser: 'Browser' };

const CURATED_BY_SLUG = new Map(CURATED_PROFILES.map(p => [p.slug, p]));

/** Fills missing answers from DEFAULT_ANSWERS and drops invalid values. */
export function normalizeAnswers(partial = {}) {
  const answers = { ...DEFAULT_ANSWERS };
  if (!partial || typeof partial !== 'object') return answers;
  for (const dim of QUIZ_DIMENSIONS) {
    const value = partial[dim.id];
    if (dim.options.some(o => o.id === value)) answers[dim.id] = value;
  }
  return answers;
}

/** Infers a profile for a catalog entry from category defaults + signals. */
export function inferProfile(entry) {
  const defaults = CATEGORY_SLOT_DEFAULTS[entry.categoryShort] ?? {
    slots: [],
    env: [],
    workflows: [],
  };
  return {
    slug: entry.slug,
    categoryShort: entry.categoryShort,
    slots: defaults.slots,
    env: defaults.env,
    workflows: defaults.workflows,
    privacy: [
      'cloud',
      ...(entry.byokFriendly ? ['byok'] : []),
      ...(entry.localHint && entry.openSource ? ['local'] : []),
    ],
    base: 3,
    nativeTo: [],
    rules: null,
    why: entry.description || `${entry.name} — ${entry.categoryShort}`,
  };
}

/**
 * Derives freeOk / openSource / enterprise / seat from catalog pricing.
 * Seat picks: indie = priciest plan <= $25 else cheapest; power = cheapest
 * plan >= $50 else priciest; enterprise = first business-named plan else power.
 */
export function derivePricing(entry) {
  const plans = [...(entry.plans ?? [])].sort((a, b) => a.monthlyAmount - b.monthlyAmount);
  let seat = null;
  if (plans.length > 0) {
    const under25 = plans.filter(p => p.monthlyAmount <= 25);
    const indie = under25.length > 0 ? under25[under25.length - 1] : plans[0];
    const power = plans.find(p => p.monthlyAmount >= 50) ?? plans[plans.length - 1];
    const enterprise = plans.find(p => ENTERPRISE_PLAN_RE.test(p.name)) ?? power;
    const pick = p => ({ name: p.name, amount: p.monthlyAmount });
    seat = { indie: pick(indie), power: pick(power), enterprise: pick(enterprise) };
  }
  return {
    freeOk: Boolean(entry.freeTier || entry.openSource),
    openSource: Boolean(entry.openSource),
    enterprise: Boolean(entry.enterprisePlan),
    seat,
  };
}

function definedFieldsOf(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const PROFILES_CACHE = new WeakMap();

/** Builds + memoizes the candidate profile list for a catalog object. */
export function buildProfiles(catalog) {
  if (!catalog || typeof catalog !== 'object') return [];
  const cached = PROFILES_CACHE.get(catalog);
  if (cached) return cached;

  const profiles = [];
  for (const entry of Object.values(catalog)) {
    const merged = {
      ...inferProfile(entry),
      ...definedFieldsOf(CURATED_BY_SLUG.get(entry.slug)),
      ...derivePricing(entry),
      slug: entry.slug,
    };
    if (!Array.isArray(merged.slots) || merged.slots.length === 0) continue;
    profiles.push(merged);
  }

  PROFILES_CACHE.set(catalog, profiles);
  return profiles;
}

/** Scores a profile for a slot (-Infinity on hard-filter rejection). */
export function scoreTool(profile, slotId, answers, opts = {}) {
  if (!profile.slots.includes(slotId)) return -Infinity;

  if (!opts.ignoreBudget) {
    if (answers.budget === 'free' && !profile.freeOk) return -Infinity;
    if (
      answers.budget === 'indie' &&
      !profile.freeOk &&
      (profile.seat === null || profile.seat.indie.amount > 25)
    ) {
      return -Infinity;
    }
  }
  if (!opts.ignorePrivacy && answers.privacy === 'local' && !profile.privacy.includes('local')) {
    return -Infinity;
  }
  if (slotId === 'primary' && !profile.env.includes(answers.editor)) return -Infinity;

  let score = profile.base;

  if (profile.workflows.includes(answers.workflow)) score += 4;
  if (profile.privacy.includes(answers.privacy)) score += 3;
  if (profile.nativeTo?.includes(answers.privacy)) score += 2;
  if (profile.openSource && answers.privacy === 'local') score += 1;

  if (slotId === 'primary') {
    if (
      answers.editor === 'vscode' &&
      (profile.categoryShort === 'AI IDEs' || profile.categoryShort === 'Native Editors')
    ) {
      score += 2;
    }
    if (answers.editor === 'jetbrains' && (profile.slug === 'jetbrains-ides' || profile.slug === 'junie')) {
      score += 2;
    }
  }
  if (slotId === 'companion') {
    if (answers.editor === 'terminal') {
      if (profile.env.includes('terminal')) score += 3;
    } else {
      if (profile.env.includes('terminal')) score += 3;
      if (profile.env.includes(answers.editor)) score += 1;
    }
  }

  if (answers.budget === 'indie') {
    if (profile.seat === null && profile.freeOk) score += 2;
    else if (profile.seat && profile.seat.indie.amount <= 25) score += 2;
  } else if (answers.budget === 'power') {
    if (profile.seat && profile.seat.power.amount >= 50) score += 2;
    else if (profile.seat) score += 1;
  } else if (answers.budget === 'enterprise') {
    if (profile.enterprise) score += 3;
  }

  return score;
}

/** Monthly seat cost in USD for a budget tier. */
export function seatMonthly(profile, budget) {
  if (budget === 'free' || !profile.seat) return 0;
  return profile.seat[budget]?.amount ?? 0;
}

/** The chosen catalog plan `{ name, amount }` for a budget tier, or null. */
export function seatPlan(profile, budget) {
  if (budget === 'free' || !profile.seat) return null;
  return profile.seat[budget] ?? null;
}

function compareCandidates(a, b, budget) {
  if (b.score !== a.score) return b.score - a.score;
  if (budget === 'free' || budget === 'indie') {
    const diff = seatMonthly(a.profile, budget) - seatMonthly(b.profile, budget);
    if (diff !== 0) return diff;
  }
  if (b.profile.base !== a.profile.base) return b.profile.base - a.profile.base;
  return a.profile.slug.localeCompare(b.profile.slug);
}

/** Ranks slot candidates, relaxing privacy then budget filters when empty. */
export function rankSlot(slotId, answers, excludeSlugs = [], profiles = []) {
  const excluded = new Set(excludeSlugs);
  const rank = opts =>
    profiles
      .filter(p => !excluded.has(p.slug))
      .map(p => ({ profile: p, score: scoreTool(p, slotId, answers, opts) }))
      .filter(c => c.score !== -Infinity)
      .sort((a, b) => compareCandidates(a, b, answers.budget));

  let candidates = rank({});
  if (candidates.length > 0) return { candidates, relaxed: null };
  candidates = rank({ ignorePrivacy: true });
  if (candidates.length > 0) return { candidates, relaxed: 'privacy' };
  candidates = rank({ ignorePrivacy: true, ignoreBudget: true });
  return { candidates, relaxed: 'budget' };
}

function titleCase(slug) {
  return slug
    .split('-')
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function catalogEntry(context, slug) {
  return context?.catalog?.[slug] ?? null;
}

function displayName(context, slug) {
  return catalogEntry(context, slug)?.name ?? titleCase(slug);
}

function seatLabelFor(profile, monthly, budget, answersPrivacy) {
  if (monthly > 0) {
    const plan = seatPlan(profile, budget);
    return `$${monthly}/mo · ${plan.name}`;
  }
  if (profile.freeOk && profile.privacy.includes('byok') && answersPrivacy !== 'cloud') {
    return '$0 seat + API usage';
  }
  if (profile.openSource) return 'Free / OSS';
  if (profile.freeOk) return 'Free tier';
  return 'See pricing';
}

function optionLabel(dimId, optionId) {
  const dim = QUIZ_DIMENSIONS.find(d => d.id === dimId);
  return dim?.options.find(o => o.id === optionId)?.label ?? optionId;
}

function answerLabels(answers) {
  return QUIZ_DIMENSIONS.map(dim => optionLabel(dim.id, answers[dim.id]));
}

/** Builds a 3-slot recommendation: primary → companion → quality. */
export function recommendStack(rawAnswers, context = {}, overrides = {}) {
  const answers = normalizeAnswers(rawAnswers);
  const profiles = buildProfiles(context.catalog);
  const profileBySlug = new Map(profiles.map(p => [p.slug, p]));

  const validOverrides = new Map();
  for (const def of SLOT_DEFS) {
    const slug = overrides?.[def.id];
    const profile = slug ? profileBySlug.get(slug) : null;
    if (profile && profile.slots.includes(def.id)) validOverrides.set(def.id, profile);
  }

  const selectedSlugs = [];
  const slots = [];
  const appliedOverrides = {};

  for (const def of SLOT_DEFS) {
    const forced = validOverrides.get(def.id) ?? null;
    const excluded = new Set(selectedSlugs);
    for (const [slotId, profile] of validOverrides) {
      if (slotId !== def.id) excluded.add(profile.slug);
    }

    const ranked = rankSlot(def.id, answers, [...excluded], profiles);
    let profile;
    let overridden = false;
    if (forced && ranked.candidates.some(c => c.profile.slug === forced.slug)) {
      profile = forced;
      overridden = true;
      appliedOverrides[def.id] = forced.slug;
    } else {
      profile = ranked.candidates[0]?.profile ?? null;
    }
    if (!profile) continue;
    selectedSlugs.push(profile.slug);

    const entry = catalogEntry(context, profile.slug);
    const monthly = seatMonthly(profile, answers.budget);
    const selected = {
      slug: profile.slug,
      name: displayName(context, profile.slug),
      company: entry?.company ?? '',
      categoryShort: entry?.categoryShort ?? '',
      url: `/tools/${profile.slug}`,
      whyItFits: profile.why,
      seatMonthly: monthly,
      seatLabel: seatLabelFor(profile, monthly, answers.budget, answers.privacy),
      rules: profile.rules ?? null,
      overridden,
      relaxed: overridden ? null : ranked.relaxed,
    };

    const alternatives = ranked.candidates
      .map(c => c.profile)
      .filter(p => p.slug !== profile.slug && !selectedSlugs.includes(p.slug))
      .slice(0, 5)
      .map(p => ({
        slug: p.slug,
        name: displayName(context, p.slug),
        seatLabel: seatLabelFor(p, seatMonthly(p, answers.budget), answers.budget, answers.privacy),
      }));

    slots.push({
      slotId: def.id,
      slotLabel: def.label,
      step: def.step,
      blurb: def.blurb,
      selected,
      alternatives,
    });
  }

  const [primary, companion, quality] = slots;
  const selectedProfiles = slots.map(s => profileBySlug.get(s.selected.slug));

  const estimatedMonthly = slots.reduce((sum, s) => sum + s.selected.seatMonthly, 0);
  let estimatedMonthlyText;
  if (estimatedMonthly === 0 && answers.privacy === 'local') {
    estimatedMonthlyText = '$0/mo · runs on your hardware';
  } else if (
    estimatedMonthly === 0 &&
    answers.privacy === 'byok' &&
    selectedProfiles.some(p => p.seat === null)
  ) {
    estimatedMonthlyText = '$0/mo seats + metered API';
  } else if (estimatedMonthly === 0) {
    estimatedMonthlyText = '$0/mo';
  } else {
    estimatedMonthlyText = `~$${estimatedMonthly}/mo per dev`;
    if (
      answers.privacy === 'byok' &&
      selectedProfiles.some(p => p.privacy.includes('byok'))
    ) {
      estimatedMonthlyText += ' + metered API';
    }
  }

  const title = `${WORKFLOW_TITLE[answers.workflow]} ${EDITOR_TITLE[answers.editor]} Stack`;
  const summary = `${primary.selected.name} + ${companion.selected.name} + ${quality.selected.name} — matched for ${optionLabel('budget', answers.budget)} budget, ${optionLabel('privacy', answers.privacy)}, ${optionLabel('workflow', answers.workflow).toLowerCase()}. Built with the ai.dosa.dev Stack Matcher.`;

  const preset = answers.workflow === 'agentic' ? 'agentic' : answers.workflow === 'review' ? 'light' : 'daily';
  const seatTokens = slots
    .map(s => {
      if (s.selected.seatMonthly <= 0) return null;
      const plan = seatPlan(profileBySlug.get(s.selected.slug), answers.budget);
      return plan ? `${s.selected.slug}:${plan.name}` : null;
    })
    .filter(Boolean);
  const costParams = new URLSearchParams();
  costParams.set('team', '1');
  costParams.set('preset', preset);
  costParams.set('seats', seatTokens.length > 0 ? seatTokens.join(',') : 'none');
  if (answers.privacy === 'local') costParams.set('models', 'none');
  const costCalculatorUrl = `/tools/cost-calculator?${costParams.toString()}`;

  const rulesFormats = slots.map(s => s.selected.rules);
  let from = rulesFormats[0] ?? rulesFormats[1] ?? rulesFormats[2];
  let to = rulesFormats[1];
  let rulesConverterUrl = '/tools/rules-converter';
  if (from !== null) {
    if (to === null || to === from) to = from === 'agents-md' ? 'claude-md' : 'agents-md';
    const rcParams = new URLSearchParams();
    rcParams.set('from', from);
    rcParams.set('to', to);
    rulesConverterUrl = `/tools/rules-converter?${rcParams.toString()}`;
  }

  const selectedSet = new Set(selectedSlugs);
  const switchLinks = (context.switchPairs ?? [])
    .filter(pair => selectedSet.has(pair.to) && !selectedSet.has(pair.from))
    .slice(0, 4)
    .map(pair => ({
      slug: pair.slug,
      from: pair.from,
      to: pair.to,
      fromName: displayName(context, pair.from),
      toName: displayName(context, pair.to),
      href: `/switch/${pair.slug}`,
    }));

  const stackPayload = {
    title,
    description: summary,
    items: slots.map((s, i) => ({
      slug: s.selected.slug,
      purpose: s.slotLabel.slice(0, 60),
      usageNotes: s.selected.whyItFits.slice(0, 500),
      enabled: true,
      position: i,
    })),
  };

  return {
    answers,
    overrides: appliedOverrides,
    title,
    summary,
    estimatedMonthly,
    estimatedMonthlyText,
    slots,
    costCalculatorUrl,
    rulesConverterUrl,
    switchLinks,
    stackPayload,
  };
}

/** Parses matcher state from URL params; preset applies first, params win. */
export function parseMatcherUrlState(search) {
  const params = new URLSearchParams(search || '');

  let answers = {};
  const presetId = params.get('preset');
  const preset = PERSONA_PRESETS.find(p => p.id === presetId) ?? null;
  if (preset) answers = { ...preset.answers };
  for (const dim of QUIZ_DIMENSIONS) {
    const value = params.get(dim.id);
    if (value !== null) answers[dim.id] = value;
  }

  const overrides = {};
  for (const [param, slotId] of Object.entries(URL_SLOT_PARAMS)) {
    const slug = params.get(param);
    if (slug && SLUG_RE.test(slug)) overrides[slotId] = slug;
  }

  return { answers: normalizeAnswers(answers), overrides, preset: preset?.id ?? null };
}

/** Serializes matcher state into a `?`-prefixed query string. */
export function buildMatcherUrlSearch({ answers, overrides } = {}) {
  const normalized = normalizeAnswers(answers);
  const params = new URLSearchParams();
  for (const dim of QUIZ_DIMENSIONS) params.set(dim.id, normalized[dim.id]);
  for (const slotId of SLOT_ORDER) {
    const slug = overrides?.[slotId];
    if (slug && SLUG_RE.test(slug)) params.set(SLOT_URL_PARAMS[slotId], slug);
  }
  return `?${params.toString()}`;
}

/** Formats a recommendation as shareable Markdown with tool links. */
export function formatRecommendedStackMarkdown(rec, origin = 'https://ai.dosa.dev') {
  const lines = [
    `# ${rec.title}`,
    '',
    `_${answerLabels(rec.answers).join(' · ')}_`,
    '',
    '| Slot | Tool | Why it fits |',
    '| --- | --- | --- |',
    ...rec.slots.map(
      s =>
        `| ${s.slotLabel} | [${s.selected.name}](${origin}/tools/${s.selected.slug}) | ${s.selected.whyItFits} |`,
    ),
    '',
    `**Estimated:** ${rec.estimatedMonthlyText}`,
    '',
    `- [Simulate cost](${origin}${rec.costCalculatorUrl})`,
    `- [Rules config](${origin}${rec.rulesConverterUrl})`,
    `- [Share](${origin}/tools/stack-matcher${buildMatcherUrlSearch({ answers: rec.answers, overrides: rec.overrides })})`,
    '',
    `Matched via ${origin}/tools/stack-matcher`,
  ];
  return lines.join('\n');
}

export { initStackMatcherUI } from './stack-matcher-ui.js';
