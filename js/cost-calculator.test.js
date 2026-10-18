import { describe, expect, test } from 'bun:test';
import {
  CLIENT_MODELS_CACHE_KEY,
  MODELS_CACHE_TTL_MS,
  buildCalculatorUrlSearch,
  formatStackSummaryText,
  formatUsd,
  loadModelsPricing,
  parseCalculatorStateFromUrl,
} from './cost-calculator.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
  };
}

describe('js/cost-calculator client controller', () => {
  test('loads models from /api/v1/models.json, caches in localStorage, and serves client-cache within 6h TTL', async () => {
    const storage = createMemoryStorage();
    let fetchCalls = 0;

    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          source: 'live',
          fetchedAt: '2026-04-17T00:00:00.000Z',
          count: 1,
          providers: ['Anthropic'],
          models: [
            {
              id: 'anthropic/claude-sonnet-4-6',
              modelId: 'claude-sonnet-4-6',
              name: 'Claude Sonnet 4.6',
              providerId: 'anthropic',
              providerName: 'Anthropic',
              cost: { input: 3, output: 15, cacheRead: 0.3 },
              context: 200000,
              outputLimit: 64000,
              reasoning: true,
              openWeights: false,
            },
          ],
        }),
        { status: 200 },
      );
    };

    const t0 = 1_700_000_000_000;
    const first = await loadModelsPricing({ storage, fetcher, now: t0 });
    expect(first.source).toBe('live');
    expect(fetchCalls).toBe(1);

    // Within 6h TTL -> served from client-cache without network call
    const second = await loadModelsPricing({ storage, fetcher, now: t0 + 120_000 });
    expect(second.source).toBe('client-cache');
    expect(fetchCalls).toBe(1);

    // Force refresh -> bypasses client-cache
    const forced = await loadModelsPricing({ storage, fetcher, now: t0 + 120_000, forceRefresh: true });
    expect(forced.source).toBe('live');
    expect(fetchCalls).toBe(2);
  });

  test('falls back to stale localStorage cache or built-in fallback when offline', async () => {
    const storage = createMemoryStorage();
    const failFetcher = async () => {
      throw new Error('offline');
    };

    // No cache + offline -> fallback snapshot
    const offlineFallback = await loadModelsPricing({ storage, fetcher: failFetcher, now: 1000 });
    expect(offlineFallback.source).toBe('fallback');
    expect(offlineFallback.models.length).toBeGreaterThan(5);

    // Seed expired cache -> should return stale-cache on network error
    storage.setItem(
      CLIENT_MODELS_CACHE_KEY,
      JSON.stringify({
        cachedAt: 1000,
        models: offlineFallback.models.slice(0, 2),
        catalog: {
          source: 'live',
          fetchedAt: '2026-04-01T00:00:00.000Z',
          count: 2,
          providers: ['Anthropic'],
          models: offlineFallback.models.slice(0, 2),
        },
      }),
    );

    const stale = await loadModelsPricing({
      storage,
      fetcher: failFetcher,
      now: 1000 + MODELS_CACHE_TTL_MS + 5000,
    });
    expect(stale.source).toBe('stale-cache');
    expect(stale.models.length).toBe(2);
  });

  test('round-trips URL state parameters (including enterprise 10k+ headcounts) and piecewise slider mapping', () => {
    const search = buildCalculatorUrlSearch({
      teamSize: 10_000,
      billingCycle: 'annual',
      preset: 'custom',
      selectedSeats: [{ slug: 'cursor', planName: 'Business' }],
      selectedModels: [{ id: 'anthropic/claude-sonnet-4-6' }],
      usage: {
        inputMillionsPerDevDay: 1.5,
        outputMillionsPerDevDay: 0.3,
        cacheHitRatio: 0.7,
        workdaysPerMonth: 22,
      },
    });

    const parsed = parseCalculatorStateFromUrl(search);
    expect(parsed.teamSize).toBe(10_000);
    expect(parsed.billingCycle).toBe('annual');
    expect(parsed.preset).toBe('custom');
    expect(parsed.selectedSeats).toEqual([{ slug: 'cursor', planName: 'Business' }]);
    expect(parsed.selectedModels).toEqual([{ id: 'anthropic/claude-sonnet-4-6' }]);
    expect(parsed.usage.inputMillionsPerDevDay).toBe(1.5);
    expect(parsed.usage.outputMillionsPerDevDay).toBe(0.3);
    expect(parsed.usage.cacheHitRatio).toBe(0.7);

    expect(formatUsd(1250)).toBe('$1,250');
    expect(formatUsd(19.5)).toBe('$19.50');

    const summary = formatStackSummaryText(
      {
        teamSize: 12,
        billingCycle: 'annual',
        seatMonthlyTotal: 480,
        apiMonthlyTotal: 220,
        monthlyTotal: 700,
        annualTotal: 8400,
        perDevMonthly: 58.33,
        lineItems: [
          {
            kind: 'seat',
            id: 'cursor:Business',
            name: 'Cursor',
            subtitle: 'Business ($40/user/mo)',
            category: 'AI IDEs',
            perDevMonthly: 40,
            teamMonthly: 480,
            teamAnnual: 5760,
          },
        ],
        alternatives: [],
      },
      parsed.usage,
    );
    expect(summary).toContain('AI Coding Cost Estimate (12 devs)');
    expect(summary).toContain('$700/mo');
  });
});
