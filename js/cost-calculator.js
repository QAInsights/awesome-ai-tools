/**
 * Client-side controller & caching layer for the Monthly AI Coding Cost Calculator.
 *
 * Implements the browser-side tier of the 3-layer models.dev caching strategy:
 *   1. Browser localStorage cache (`aat_models_pricing_v1`, 6h TTL)
 *   2. Edge API endpoint `/api/v1/models.json` (6h Cloudflare edge + isolate cache)
 *   3. Stale localStorage or built-in `FALLBACK_MODEL_PRICING` when offline
 */

import {
  MAX_TEAM_SIZE,
  WORKLOAD_PRESETS,
  calculateModelMonthlyCost,
  calculateStackCost,
} from '../src/lib/cost-calculator';
import {
  FALLBACK_MODEL_PRICING,
  MODELS_CACHE_TTL_MS,
} from '../src/lib/models-pricing';

export {
  MAX_TEAM_SIZE,
  WORKLOAD_PRESETS,
  FALLBACK_MODEL_PRICING,
  MODELS_CACHE_TTL_MS,
  calculateModelMonthlyCost,
  calculateStackCost,
};

export const CLIENT_MODELS_CACHE_KEY = 'aat_models_pricing_v1';
export const MODELS_ENDPOINT = '/api/v1/models.json';

/**
 * Loads normalized LLM token pricing using localStorage -> /api/v1/models.json -> fallback.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh]
 * @param {Storage} [options.storage]
 * @param {typeof fetch} [options.fetcher]
 * @param {number} [options.now]
 */
export async function loadModelsPricing(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const storage =
    options.storage !== undefined
      ? options.storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : null;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();

  let staleEntry = null;
  if (storage) {
    try {
      const raw = storage.getItem(CLIENT_MODELS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
          staleEntry = parsed;
          if (!forceRefresh && typeof parsed.cachedAt === 'number' && now - parsed.cachedAt < MODELS_CACHE_TTL_MS) {
            return {
              ...parsed.catalog,
              models: parsed.models,
              source: 'client-cache',
            };
          }
        }
      }
    } catch {
      // Ignore storage read/parse errors
    }
  }

  try {
    const url = forceRefresh ? `${MODELS_ENDPOINT}?refresh=1` : MODELS_ENDPOINT;
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const catalog = await response.json();
    if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) {
      throw new Error('Empty models payload');
    }

    if (storage) {
      try {
        storage.setItem(
          CLIENT_MODELS_CACHE_KEY,
          JSON.stringify({
            cachedAt: now,
            models: catalog.models,
            catalog,
          }),
        );
      } catch {
        // Ignore quota errors
      }
    }

    return catalog;
  } catch {
    if (staleEntry) {
      return {
        ...staleEntry.catalog,
        models: staleEntry.models,
        source: 'stale-cache',
      };
    }
    const providers = [...new Set(FALLBACK_MODEL_PRICING.map(m => m.provider))].sort();
    return {
      source: 'fallback',
      fetchedAt: new Date(now).toISOString(),
      count: FALLBACK_MODEL_PRICING.length,
      providers,
      models: FALLBACK_MODEL_PRICING,
    };
  }
}

const SLIDER_STOPS = [
  { pos: 0, devs: 1, step: 1 },
  { pos: 250, devs: 50, step: 5 },
  { pos: 500, devs: 500, step: 25 },
  { pos: 750, devs: 5_000, step: 100 },
  { pos: 1000, devs: 25_000, step: 500 },
];

export function sliderToTeamSize(rawPos) {
  const pos = Math.max(0, Math.min(1000, Number(rawPos) || 0));
  for (let i = 0; i < SLIDER_STOPS.length - 1; i++) {
    const a = SLIDER_STOPS[i];
    const b = SLIDER_STOPS[i + 1];
    if (pos <= b.pos) {
      const t = (pos - a.pos) / (b.pos - a.pos);
      const rawDevs = a.devs + t * (b.devs - a.devs);
      const step = pos < 250 ? 1 : a.step;
      return Math.max(1, Math.round(rawDevs / step) * step);
    }
  }
  return 25_000;
}

export function teamSizeToSlider(rawDevs) {
  const devs = Math.max(1, Math.min(25_000, Number(rawDevs) || 1));
  for (let i = 0; i < SLIDER_STOPS.length - 1; i++) {
    const a = SLIDER_STOPS[i];
    const b = SLIDER_STOPS[i + 1];
    if (devs <= b.devs) {
      const t = (devs - a.devs) / (b.devs - a.devs);
      return Math.round(a.pos + t * (b.pos - a.pos));
    }
  }
  return 1000;
}

/**
 * Parses calculator configuration from URL query parameters.
 *
 * @param {string} search
 */
export function parseCalculatorStateFromUrl(search) {
  const params = new URLSearchParams(search || '');
  const teamRaw = Number(params.get('team'));
  const teamSize = Number.isFinite(teamRaw) && teamRaw >= 1 ? Math.min(MAX_TEAM_SIZE, Math.round(teamRaw)) : 5;
  const billingCycle = params.get('cycle') === 'annual' ? 'annual' : 'monthly';
  const discountRaw = Number(params.get('discount'));
  const discountPercent =
    Number.isFinite(discountRaw) && discountRaw >= 0 ? Math.min(50, Math.round(discountRaw)) : 0;
  const presetRaw = params.get('preset') || 'daily';
  const preset =
    presetRaw === 'light' || presetRaw === 'daily' || presetRaw === 'agentic' || presetRaw === 'custom'
      ? presetRaw
      : 'daily';

  const seatsParam = params.get('seats');
  const seatsExplicit = params.has('seats');
  const selectedSeats = seatsExplicit
    ? seatsParam === 'none'
      ? []
      : (seatsParam ?? '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(token => {
            const [slug, planName] = token.split(':');
            return { slug: slug.trim(), planName: planName ? planName.trim() : undefined };
          })
          .filter(s => Boolean(s.slug))
    : [
        { slug: 'cursor', planName: 'Pro' },
        { slug: 'github-copilot', planName: 'Pro' },
      ];

  const modelsParam = params.get('models');
  const selectedModels = modelsParam
    ? modelsParam === 'none'
      ? []
      : modelsParam
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(id => ({ id }))
    : [{ id: 'claude-sonnet-4-5' }];

  const basePreset = WORKLOAD_PRESETS[preset === 'custom' ? 'daily' : preset];
  const inRaw = Number(params.get('in'));
  const outRaw = Number(params.get('out'));
  const cacheRaw = Number(params.get('cache'));

  const usage = {
    inputMillionsPerDevDay:
      Number.isFinite(inRaw) && inRaw >= 0 ? Math.min(25, inRaw) : basePreset.inputMillionsPerDevDay,
    outputMillionsPerDevDay:
      Number.isFinite(outRaw) && outRaw >= 0 ? Math.min(10, outRaw) : basePreset.outputMillionsPerDevDay,
    cacheHitRatio:
      Number.isFinite(cacheRaw) && cacheRaw >= 0 && cacheRaw <= 95
        ? cacheRaw / 100
        : basePreset.cacheHitRatio,
    workdaysPerMonth: 22,
  };

  return {
    teamSize,
    billingCycle,
    discountPercent,
    preset,
    selectedSeats,
    selectedModels,
    usage,
    seatsExplicit,
  };
}

/**
 * Serializes calculator state into URL query string parameters.
 */
export function buildCalculatorUrlSearch(state) {
  const params = new URLSearchParams();
  params.set('team', String(state.teamSize || 1));
  if (state.billingCycle === 'annual') params.set('cycle', 'annual');
  if (state.discountPercent > 0) params.set('discount', String(state.discountPercent));
  params.set('preset', state.preset || 'daily');

  if (Array.isArray(state.selectedSeats) && state.selectedSeats.length > 0) {
    params.set(
      'seats',
      state.selectedSeats.map(s => (s.planName ? `${s.slug}:${s.planName}` : s.slug)).join(','),
    );
  } else if (Array.isArray(state.selectedSeats) && state.selectedSeats.length === 0) {
    params.set('seats', 'none');
  }
  if (Array.isArray(state.selectedModels) && state.selectedModels.length > 0) {
    params.set('models', state.selectedModels.map(m => m.id).join(','));
  } else if (Array.isArray(state.selectedModels) && state.selectedModels.length === 0) {
    params.set('models', 'none');
  }
  if (state.preset === 'custom' && state.usage) {
    params.set('in', String(state.usage.inputMillionsPerDevDay));
    params.set('out', String(state.usage.outputMillionsPerDevDay));
    params.set('cache', String(Math.round((state.usage.cacheHitRatio ?? 0.5) * 100)));
  }
  return `?${params.toString()}`;
}

export function formatUsd(amount) {
  if (!Number.isFinite(amount)) return '$0';
  if (amount >= 1000) {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (Number.isInteger(amount)) return `$${amount}`;
  return `$${amount.toFixed(2)}`;
}

export function formatStackSummaryText(breakdown, usage) {
  const lines = [
    `AI Coding Cost Estimate (${breakdown.teamSize} dev${breakdown.teamSize === 1 ? '' : 's'})`,
    `==================================================`,
    `Total Monthly Spend : ${formatUsd(breakdown.monthlyTotal)}/mo (${formatUsd(breakdown.perDevMonthly)}/dev/mo)`,
    `Annual Projection   : ${formatUsd(breakdown.annualTotal)}/yr`,
    ...(breakdown.discountPercent > 0
      ? [
          `Negotiated Discount : ${breakdown.discountPercent}% off list (${formatUsd(breakdown.listMonthlyTotal)}/mo list -> saves ${formatUsd(breakdown.discountMonthlySavings)}/mo)`,
        ]
      : []),
    `Seat Subscriptions  : ${formatUsd(breakdown.seatMonthlyTotal)}/mo`,
    `LLM API Token Spend : ${formatUsd(breakdown.apiMonthlyTotal)}/mo (${usage.inputMillionsPerDevDay}M in / ${usage.outputMillionsPerDevDay}M out per dev/day, ${Math.round(usage.cacheHitRatio * 100)}% cache hit)`,
    ``,
    `Stack Breakdown:`,
    ...breakdown.lineItems.map(
      item => `  - ${item.name} [${item.subtitle}]: ${formatUsd(item.teamMonthly)}/mo (${formatUsd(item.perDevMonthly)}/dev)`,
    ),
  ];

  if (breakdown.alternatives.length > 0) {
    lines.push(``, `Top Savings Opportunities:`);
    for (const alt of breakdown.alternatives) {
      lines.push(`  * ${alt.title}: Save ${formatUsd(alt.monthlySavings)}/mo (${formatUsd(alt.annualSavings)}/yr)`);
    }
  }

  lines.push(``, `Calculated via https://ai.dosa.dev/tools/cost-calculator`);
  return lines.join('\n');
}

export { initCostCalculatorUI } from './cost-calculator-ui.js';

