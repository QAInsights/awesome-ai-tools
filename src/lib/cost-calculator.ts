/**
 * Monthly AI Coding Cost Calculator engine.
 *
 * Combines:
 *   1. Tool seat/subscription pricing extracted via `pricing-breakdown.ts`
 *   2. Live LLM token pricing normalized from `models.dev` (`models-pricing.ts`)
 *
 * Pure and dependency-free so it can run at Astro build time, in unit tests,
 * and inside the browser bundle (`/dist/cost-calculator.js`).
 */

import { buildPricingBreakdown, pricingSignals, type PricingPlan } from './pricing-breakdown';
import type { NormalizedModelPricing } from './models-pricing';

export type WorkloadPresetId = 'light' | 'daily' | 'agentic' | 'custom';
export type BillingCycle = 'monthly' | 'annual';

export interface TokenUsageProfile {
  inputMillionsPerDevDay: number;
  outputMillionsPerDevDay: number;
  cacheHitRatio: number;
  workdaysPerMonth: number;
}

export interface WorkloadPreset extends TokenUsageProfile {
  id: Exclude<WorkloadPresetId, 'custom'>;
  label: string;
  tagline: string;
}

export const WORKLOAD_PRESETS: Record<Exclude<WorkloadPresetId, 'custom'>, WorkloadPreset> = {
  light: {
    id: 'light',
    label: 'Light Assist',
    tagline: '~0.25M in / 0.05M out per dev/day (autocomplete + quick chat)',
    inputMillionsPerDevDay: 0.25,
    outputMillionsPerDevDay: 0.05,
    cacheHitRatio: 0.5,
    workdaysPerMonth: 22,
  },
  daily: {
    id: 'daily',
    label: 'Daily Driver',
    tagline: '~1.0M in / 0.20M out per dev/day (multi-file edits + Composer)',
    inputMillionsPerDevDay: 1.0,
    outputMillionsPerDevDay: 0.2,
    cacheHitRatio: 0.65,
    workdaysPerMonth: 22,
  },
  agentic: {
    id: 'agentic',
    label: 'Heavy Agentic',
    tagline: '~3.5M in / 0.60M out per dev/day (autonomous CLI loops + subagents)',
    inputMillionsPerDevDay: 3.5,
    outputMillionsPerDevDay: 0.6,
    cacheHitRatio: 0.75,
    workdaysPerMonth: 22,
  },
};

export interface CalculatorPlanOption {
  name: string;
  price: string;
  unit: string;
  monthlyAmount: number;
  perSeat: boolean;
  note: string;
}

export interface CalculatorToolItem {
  slug: string;
  name: string;
  company: string;
  category: string;
  categoryShort: string;
  pricingModel: string;
  freeTier: boolean;
  openSource: boolean;
  byokFriendly: boolean;
  plans: CalculatorPlanOption[];
  entryMonthly: number;
  url: string;
}

export interface ToolSeedLike {
  slug: string;
  name: string;
  company: string;
  category: string;
  categoryShort: string;
  url: string;
  enriched?: {
    pricing?: string;
    pricingDetail?: string;
  } | null;
}

export interface SelectedSeatTool {
  slug: string;
  planName?: string;
}

export interface SelectedApiModel {
  id: string;
  /** Weight of token workload routed to this model (defaults to equal split). */
  share?: number;
}

export interface StackCostLineItem {
  kind: 'seat' | 'api';
  id: string;
  name: string;
  subtitle: string;
  category: string;
  perDevMonthly: number;
  teamMonthly: number;
  teamAnnual: number;
}

export interface SavingsAlternative {
  kind: 'tool-swap' | 'byok-swap' | 'model-swap';
  title: string;
  description: string;
  fromId: string;
  toSlugOrId: string;
  toName: string;
  monthlySavings: number;
  annualSavings: number;
  href?: string;
}

export interface StackCostBreakdown {
  teamSize: number;
  billingCycle: BillingCycle;
  discountPercent: number;
  listMonthlyTotal: number;
  discountMonthlySavings: number;
  seatMonthlyTotal: number;
  apiMonthlyTotal: number;
  monthlyTotal: number;
  annualTotal: number;
  perDevMonthly: number;
  lineItems: StackCostLineItem[];
  alternatives: SavingsAlternative[];
}

export function planMonthlyAmount(plan: Pick<PricingPlan, 'price' | 'unit'>): number {
  const raw = Number((plan.price.split(/[-\u2013]/)[0] ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(raw) || raw < 0) return NaN;
  return /\/yr\b/i.test(plan.unit) ? raw / 12 : raw;
}

export function isPerSeatPlan(plan: Pick<PricingPlan, 'unit' | 'note'>): boolean {
  if (/\/(org|team|company|workspace)\b/i.test(plan.unit)) return false;
  if (/\b(flat rate|per organization|per team)\b/i.test(plan.note)) return false;
  return true;
}

export function buildCalculatorToolCatalog(tools: ReadonlyArray<ToolSeedLike>): CalculatorToolItem[] {
  const catalog: CalculatorToolItem[] = [];

  for (const tool of tools) {
    const pricing = tool.enriched?.pricing ?? '';
    const detail = tool.enriched?.pricingDetail ?? '';
    const breakdown = buildPricingBreakdown(pricing, detail);
    const signals = pricingSignals(detail);

    const paidPlans: CalculatorPlanOption[] = breakdown.plans
      .map(p => ({
        name: p.name,
        price: p.price,
        unit: p.unit || '/mo',
        monthlyAmount: roundCurrency(planMonthlyAmount(p)),
        perSeat: isPerSeatPlan(p),
        note: p.note,
      }))
      .filter(p => Number.isFinite(p.monthlyAmount) && p.monthlyAmount > 0)
      .sort((a, b) => a.monthlyAmount - b.monthlyAmount);

    const openSource =
      /open[- ]source/i.test(pricing) || signals.some(s => s.startsWith('Open source'));
    const freeTier =
      openSource ||
      /free|freemium/i.test(pricing) ||
      signals.includes('Free tier') ||
      breakdown.plans.some(p => planMonthlyAmount(p) === 0);
    const byokFriendly =
      openSource ||
      signals.includes('Usage-based costs') ||
      /\b(BYOK|API key|own API|pay-as-you-go)\b/i.test(detail);

    if (paidPlans.length === 0 && !openSource && !freeTier) continue;

    catalog.push({
      slug: tool.slug,
      name: tool.name,
      company: tool.company,
      category: tool.category,
      categoryShort: tool.categoryShort || tool.category,
      pricingModel: (pricing || (openSource ? 'open-source' : 'unlisted')).toLowerCase(),
      freeTier,
      openSource,
      byokFriendly,
      plans: paidPlans,
      entryMonthly: paidPlans[0]?.monthlyAmount ?? 0,
      url: tool.url,
    });
  }

  return catalog.sort((a, b) => a.name.localeCompare(b.name));
}

export function calculateModelMonthlyCost(
  model: NormalizedModelPricing,
  usage: TokenUsageProfile,
  teamSize = 1,
): {
  perDevMonthly: number;
  teamMonthly: number;
  uncachedInputCost: number;
  cachedInputCost: number;
  outputCost: number;
} {
  const safeTeam = Math.max(1, Math.round(teamSize));
  const days = Math.max(1, usage.workdaysPerMonth);
  const cacheRatio = Math.min(0.95, Math.max(0, usage.cacheHitRatio));
  const inputMPerDevMonth = Math.max(0, usage.inputMillionsPerDevDay) * days;
  const outputMPerDevMonth = Math.max(0, usage.outputMillionsPerDevDay) * days;

  const cachedInputM = inputMPerDevMonth * cacheRatio;
  const uncachedInputM = inputMPerDevMonth * (1 - cacheRatio);
  const cacheRate = model.cost.cacheRead ?? model.cost.input;

  const uncachedInputCost = uncachedInputM * model.cost.input;
  const cachedInputCost = cachedInputM * cacheRate;
  const outputCost = outputMPerDevMonth * model.cost.output;
  const perDevMonthly = uncachedInputCost + cachedInputCost + outputCost;

  return {
    perDevMonthly: roundCurrency(perDevMonthly),
    teamMonthly: roundCurrency(perDevMonthly * safeTeam),
    uncachedInputCost: roundCurrency(uncachedInputCost * safeTeam),
    cachedInputCost: roundCurrency(cachedInputCost * safeTeam),
    outputCost: roundCurrency(outputCost * safeTeam),
  };
}

export const MAX_TEAM_SIZE = 100_000;

export function calculateStackCost(params: {
  catalog: ReadonlyArray<CalculatorToolItem>;
  models: ReadonlyArray<NormalizedModelPricing>;
  selectedSeats: ReadonlyArray<SelectedSeatTool>;
  selectedModels: ReadonlyArray<SelectedApiModel>;
  teamSize: number;
  billingCycle?: BillingCycle;
  discountPercent?: number;
  usage?: TokenUsageProfile;
}): StackCostBreakdown {
  const teamSize = Math.max(1, Math.min(MAX_TEAM_SIZE, Math.round(params.teamSize || 1)));
  const billingCycle: BillingCycle = params.billingCycle ?? 'monthly';
  const discountPercent = Math.max(0, Math.min(50, Math.round(params.discountPercent || 0)));
  const netFactor = 1 - discountPercent / 100;
  const usage = params.usage ?? WORKLOAD_PRESETS.daily;
  const toolBySlug = new Map(params.catalog.map(t => [t.slug, t]));
  const modelById = new Map<string, NormalizedModelPricing>();
  for (const m of params.models) {
    modelById.set(m.id, m);
    if (m.canonicalId) modelById.set(m.canonicalId, m);
  }

  const lineItems: StackCostLineItem[] = [];
  let listSeatMonthlyTotal = 0;
  let seatMonthlyTotal = 0;

  for (const sel of params.selectedSeats) {
    const tool = toolBySlug.get(sel.slug);
    if (!tool || tool.plans.length === 0) continue;
    const plan =
      (sel.planName ? tool.plans.find(p => p.name.toLowerCase() === sel.planName!.toLowerCase()) : undefined) ??
      tool.plans[0]!;
    const rawTeamMonthly = plan.perSeat ? plan.monthlyAmount * teamSize : plan.monthlyAmount;
    const teamMonthly = roundCurrency(rawTeamMonthly * netFactor);
    const perDevMonthly = roundCurrency(teamMonthly / teamSize);
    listSeatMonthlyTotal = roundCurrency(listSeatMonthlyTotal + rawTeamMonthly);
    seatMonthlyTotal = roundCurrency(seatMonthlyTotal + teamMonthly);

    lineItems.push({
      kind: 'seat',
      id: `${tool.slug}:${plan.name}`,
      name: tool.name,
      subtitle: `${plan.name} (${plan.price}${plan.unit}${discountPercent > 0 ? ` · -${discountPercent}%` : ''})`,
      category: tool.categoryShort,
      perDevMonthly,
      teamMonthly,
      teamAnnual: roundCurrency(teamMonthly * 12),
    });
  }

  let listApiMonthlyTotal = 0;
  let apiMonthlyTotal = 0;
  const validModels = params.selectedModels
    .map(s => ({ sel: s, model: modelById.get(s.id) }))
    .filter((entry): entry is { sel: SelectedApiModel; model: NormalizedModelPricing } => Boolean(entry.model));

  const totalShare = validModels.reduce((acc, m) => acc + (m.sel.share && m.sel.share > 0 ? m.sel.share : 1), 0);

  for (const { sel, model } of validModels) {
    const weight = totalShare > 0 ? (sel.share && sel.share > 0 ? sel.share : 1) / totalShare : 1 / validModels.length;
    const scaledUsage: TokenUsageProfile = {
      ...usage,
      inputMillionsPerDevDay: usage.inputMillionsPerDevDay * weight,
      outputMillionsPerDevDay: usage.outputMillionsPerDevDay * weight,
    };
    const cost = calculateModelMonthlyCost(model, scaledUsage, teamSize);
    const netTeamMonthly = roundCurrency(cost.teamMonthly * netFactor);
    const netPerDevMonthly = roundCurrency(netTeamMonthly / teamSize);
    listApiMonthlyTotal = roundCurrency(listApiMonthlyTotal + cost.teamMonthly);
    apiMonthlyTotal = roundCurrency(apiMonthlyTotal + netTeamMonthly);

    lineItems.push({
      kind: 'api',
      id: model.id,
      name: model.name,
      subtitle: `${model.provider} · $${model.cost.input}/$${model.cost.output} per 1M (${Math.round(weight * 100)}% load${discountPercent > 0 ? ` · -${discountPercent}%` : ''})`,
      category: 'LLM API (BYOK)',
      perDevMonthly: netPerDevMonthly,
      teamMonthly: netTeamMonthly,
      teamAnnual: roundCurrency(netTeamMonthly * 12),
    });
  }

  const listMonthlyTotal = roundCurrency(listSeatMonthlyTotal + listApiMonthlyTotal);
  const monthlyTotal = roundCurrency(seatMonthlyTotal + apiMonthlyTotal);
  const discountMonthlySavings = roundCurrency(listMonthlyTotal - monthlyTotal);
  const annualTotal = roundCurrency(monthlyTotal * 12);
  const perDevMonthly = roundCurrency(monthlyTotal / teamSize);

  const alternatives = buildSavingsAlternatives({
    catalog: params.catalog,
    models: params.models,
    selectedSeats: params.selectedSeats,
    validModels,
    teamSize,
    usage,
  });

  return {
    teamSize,
    billingCycle,
    discountPercent,
    listMonthlyTotal,
    discountMonthlySavings,
    seatMonthlyTotal,
    apiMonthlyTotal,
    monthlyTotal,
    annualTotal,
    perDevMonthly,
    lineItems,
    alternatives,
  };
}

function buildSavingsAlternatives(ctx: {
  catalog: ReadonlyArray<CalculatorToolItem>;
  models: ReadonlyArray<NormalizedModelPricing>;
  selectedSeats: ReadonlyArray<SelectedSeatTool>;
  validModels: ReadonlyArray<{ sel: SelectedApiModel; model: NormalizedModelPricing }>;
  teamSize: number;
  usage: TokenUsageProfile;
}): SavingsAlternative[] {
  const suggestions: SavingsAlternative[] = [];
  const selectedSlugs = new Set(ctx.selectedSeats.map(s => s.slug));
  const toolBySlug = new Map(ctx.catalog.map(t => [t.slug, t]));

  for (const sel of ctx.selectedSeats) {
    const tool = toolBySlug.get(sel.slug);
    if (!tool || tool.plans.length === 0) continue;
    const plan =
      (sel.planName ? tool.plans.find(p => p.name.toLowerCase() === sel.planName!.toLowerCase()) : undefined) ??
      tool.plans[0]!;
    const currentTeamMonthly = plan.perSeat ? plan.monthlyAmount * ctx.teamSize : plan.monthlyAmount;

    // 1. Cheaper paid peer in same category
    const cheaperPeer = ctx.catalog
      .filter(
        c =>
          c.categoryShort === tool.categoryShort &&
          !selectedSlugs.has(c.slug) &&
          c.plans.length > 0 &&
          c.entryMonthly < plan.monthlyAmount,
      )
      .sort((a, b) => a.entryMonthly - b.entryMonthly)[0];

    if (cheaperPeer) {
      const peerPlan = cheaperPeer.plans[0]!;
      const peerTeamMonthly = peerPlan.perSeat ? peerPlan.monthlyAmount * ctx.teamSize : peerPlan.monthlyAmount;
      const savings = roundCurrency(currentTeamMonthly - peerTeamMonthly);
      if (savings >= 5) {
        suggestions.push({
          kind: 'tool-swap',
          title: `Switch ${tool.name} (${plan.name}) → ${cheaperPeer.name}`,
          description: `Same ${tool.categoryShort} category at ${peerPlan.price}${peerPlan.unit} instead of ${plan.price}${plan.unit}.`,
          fromId: tool.slug,
          toSlugOrId: cheaperPeer.slug,
          toName: cheaperPeer.name,
          monthlySavings: savings,
          annualSavings: roundCurrency(savings * 12),
          href: `/tools/${cheaperPeer.slug}`,
        });
      }
    }

    // 2. Open-source / Free BYOK alternative in same category
    const ossPeer = ctx.catalog.find(
      c => c.categoryShort === tool.categoryShort && !selectedSlugs.has(c.slug) && c.openSource,
    );
    if (ossPeer && currentTeamMonthly >= 15) {
      suggestions.push({
        kind: 'byok-swap',
        title: `Replace ${tool.name} seats with ${ossPeer.name} (Open Source)`,
        description: `Eliminate $${roundCurrency(currentTeamMonthly)}/mo in fixed seat licenses by pairing ${ossPeer.name} with BYOK API keys.`,
        fromId: tool.slug,
        toSlugOrId: ossPeer.slug,
        toName: ossPeer.name,
        monthlySavings: roundCurrency(currentTeamMonthly),
        annualSavings: roundCurrency(currentTeamMonthly * 12),
        href: `/tools/${ossPeer.slug}`,
      });
    }
  }

  // 3. Model-tier optimization for API token spend
  const totalShare = ctx.validModels.reduce((acc, m) => acc + (m.sel.share && m.sel.share > 0 ? m.sel.share : 1), 0);
  for (const { sel, model } of ctx.validModels) {
    const weight = totalShare > 0 ? (sel.share && sel.share > 0 ? sel.share : 1) / totalShare : 1;
    const scaledUsage: TokenUsageProfile = {
      ...ctx.usage,
      inputMillionsPerDevDay: ctx.usage.inputMillionsPerDevDay * weight,
      outputMillionsPerDevDay: ctx.usage.outputMillionsPerDevDay * weight,
    };
    const currentCost = calculateModelMonthlyCost(model, scaledUsage, ctx.teamSize).teamMonthly;

    const candidates = ctx.models
      .filter(m => m.id !== model.id && m.context >= 128_000 && m.cost.output < model.cost.output * 0.65)
      .map(candidate => ({
        candidate,
        teamMonthly: calculateModelMonthlyCost(candidate, scaledUsage, ctx.teamSize).teamMonthly,
      }))
      .sort((a, b) => a.teamMonthly - b.teamMonthly);

    const best = candidates[0];
    if (best) {
      const savings = roundCurrency(currentCost - best.teamMonthly);
      if (savings >= 10) {
        suggestions.push({
          kind: 'model-swap',
          title: `Route ${model.name} workload → ${best.candidate.name}`,
          description: `Cut API token spend from $${currentCost}/mo to $${best.teamMonthly}/mo ($${best.candidate.cost.input}/$${best.candidate.cost.output} per 1M tokens).`,
          fromId: model.id,
          toSlugOrId: best.candidate.id,
          toName: best.candidate.name,
          monthlySavings: savings,
          annualSavings: roundCurrency(savings * 12),
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.monthlySavings - a.monthlySavings).slice(0, 4);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
