import { describe, expect, test } from 'bun:test';
import {
  WORKLOAD_PRESETS,
  buildCalculatorToolCatalog,
  calculateModelMonthlyCost,
  calculateStackCost,
  isPerSeatPlan,
  planMonthlyAmount,
  type ToolSeedLike,
} from './cost-calculator';
import { FALLBACK_MODEL_PRICING } from './models-pricing';

const SAMPLE_TOOLS: ToolSeedLike[] = [
  {
    slug: 'cursor',
    name: 'Cursor',
    company: 'Anysphere',
    category: 'AI-Native IDEs & Editors',
    categoryShort: 'AI IDEs',
    url: 'https://cursor.com',
    enriched: {
      pricing: 'freemium',
      pricingDetail: 'Hobby (Free), Pro ($20/mo), Business ($40/user/mo).',
    },
  },
  {
    slug: 'windsurf',
    name: 'Windsurf',
    company: 'Codeium',
    category: 'AI-Native IDEs & Editors',
    categoryShort: 'AI IDEs',
    url: 'https://windsurf.com',
    enriched: {
      pricing: 'freemium',
      pricingDetail: 'Free tier available. Pro ($15/mo), Teams ($30/user/mo).',
    },
  },
  {
    slug: 'void',
    name: 'Void',
    company: 'Void Editor',
    category: 'AI-Native IDEs & Editors',
    categoryShort: 'AI IDEs',
    url: 'https://voideditor.com',
    enriched: {
      pricing: 'open-source',
      pricingDetail: 'Open source (Apache 2.0). Free to download, bring your own API keys (BYOK).',
    },
  },
  {
    slug: 'github-copilot',
    name: 'GitHub Copilot',
    company: 'GitHub',
    category: 'IDE Extensions & Plugins',
    categoryShort: 'IDE Plugins',
    url: 'https://github.com/features/copilot',
    enriched: {
      pricing: 'freemium',
      pricingDetail: 'Free tier. Pro ($10/mo or $100/yr), Business ($19/user/mo), Enterprise ($39/user/mo).',
    },
  },
];

describe('cost-calculator engine', () => {
  test('normalizes monthly and annual plan amounts and per-seat detection', () => {
    expect(planMonthlyAmount({ price: '$20', unit: '/mo' })).toBe(20);
    expect(planMonthlyAmount({ price: '$120', unit: '/yr' })).toBe(10);
    expect(isPerSeatPlan({ unit: '/user/mo', note: '' })).toBe(true);
    expect(isPerSeatPlan({ unit: '/team/mo', note: '' })).toBe(false);
    expect(isPerSeatPlan({ unit: '/mo', note: 'flat rate per organization' })).toBe(false);
  });

  test('builds calculator catalog with extracted paid plans and open-source flags', () => {
    const catalog = buildCalculatorToolCatalog(SAMPLE_TOOLS);
    expect(catalog.length).toBe(4);

    const cursor = catalog.find(t => t.slug === 'cursor');
    expect(cursor).toBeDefined();
    expect(cursor?.plans.map(p => `${p.name}:${p.monthlyAmount}`)).toEqual(['Pro:20', 'Business:40']);
    expect(cursor?.entryMonthly).toBe(20);

    const voidTool = catalog.find(t => t.slug === 'void');
    expect(voidTool?.openSource).toBe(true);
    expect(voidTool?.byokFriendly).toBe(true);
    expect(voidTool?.entryMonthly).toBe(0);
  });

  test('calculates monthly LLM token costs accounting for prompt cache hits', () => {
    const sonnet = FALLBACK_MODEL_PRICING.find(m => m.id === 'claude-sonnet-4-5')!;
    const cost = calculateModelMonthlyCost(
      sonnet,
      {
        inputMillionsPerDevDay: 1.0,
        outputMillionsPerDevDay: 0.2,
        cacheHitRatio: 0.5,
        workdaysPerMonth: 20,
      },
      5,
    );

    // Per dev/month: 20M input (10M uncached @ $3 = $30, 10M cached @ $0.30 = $3) + 4M output @ $15 = $60 => $93/dev/mo
    expect(cost.perDevMonthly).toBe(93);
    expect(cost.teamMonthly).toBe(465);
    expect(cost.uncachedInputCost).toBe(150);
    expect(cost.cachedInputCost).toBe(15);
    expect(cost.outputCost).toBe(300);
  });

  test('computes combined seat + BYOK stack burn and generates ranked savings alternatives', () => {
    const catalog = buildCalculatorToolCatalog(SAMPLE_TOOLS);
    const breakdown = calculateStackCost({
      catalog,
      models: FALLBACK_MODEL_PRICING,
      selectedSeats: [
        { slug: 'cursor', planName: 'Business' },
        { slug: 'github-copilot', planName: 'Business' },
      ],
      selectedModels: [{ id: 'claude-opus-4-5', share: 1 }],
      teamSize: 10,
      billingCycle: 'monthly',
      usage: WORKLOAD_PRESETS.daily,
    });

    // Seats: Cursor Business ($40 * 10 = $400) + Copilot Business ($19 * 10 = $190) = $590/mo
    expect(breakdown.seatMonthlyTotal).toBe(590);
    expect(breakdown.apiMonthlyTotal).toBeGreaterThan(0);
    expect(breakdown.monthlyTotal).toBeCloseTo(breakdown.seatMonthlyTotal + breakdown.apiMonthlyTotal, 2);
    expect(breakdown.annualTotal).toBeCloseTo(breakdown.monthlyTotal * 12, 2);
    expect(breakdown.perDevMonthly).toBeCloseTo(breakdown.monthlyTotal / 10, 2);

    // Should suggest cheaper peer (Windsurf), OSS BYOK (Void), and lower-cost coding LLM
    const kinds = new Set(breakdown.alternatives.map(a => a.kind));
    expect(kinds.has('tool-swap')).toBe(true);
    expect(kinds.has('byok-swap')).toBe(true);
    expect(kinds.has('model-swap')).toBe(true);
    expect(breakdown.alternatives[0]!.monthlySavings).toBeGreaterThanOrEqual(
      breakdown.alternatives[breakdown.alternatives.length - 1]!.monthlySavings,
    );
    for (const alt of breakdown.alternatives) {
      if (alt.href) {
        expect(alt.href.startsWith('/tools/')).toBe(true);
      }
    }
  });
});
