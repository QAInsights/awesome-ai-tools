import { afterEach, describe, expect, test } from 'bun:test';
import {
    MODELS_CACHE_TTL_MS,
    buildFallbackModelCatalog,
    fetchModelsPricingCatalog,
    normalizeModelsDevCatalog,
    resetModelsPricingCache,
} from './models-pricing';

afterEach(() => {
    resetModelsPricingCache();
});

describe('normalizeModelsDevCatalog', () => {
    test('normalizes valid coding models and filters out non-text, zero-cost, or tiny-context models', () => {
        const raw = {
            anthropic: {
                id: 'anthropic',
                name: 'Anthropic',
                models: {
                    'claude-sonnet-4-5': {
                        id: 'claude-sonnet-4-5',
                        name: 'Claude Sonnet 4.5',
                        reasoning: true,
                        open_weights: false,
                        release_date: '2025-09-29',
                        last_updated: '2025-09-29',
                        modalities: { input: ['text', 'image'], output: ['text'] },
                        limit: { context: 200_000, output: 64_000 },
                        cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
                        canonical_model_id: 'anthropic/claude-sonnet-4-5',
                    },
                    'whisper-large': {
                        id: 'whisper-large',
                        name: 'Whisper Large',
                        modalities: { input: ['audio'], output: ['text'] },
                        limit: { context: 32_000, output: 4_096 },
                        cost: { input: 0.5, output: 0.5 },
                    },
                },
            },
            openai: {
                id: 'openai',
                name: 'OpenAI',
                models: {
                    'text-embedding-3-large': {
                        id: 'text-embedding-3-large',
                        name: 'Text Embedding 3 Large',
                        modalities: { input: ['text'], output: ['text'] },
                        limit: { context: 8_192, output: 8_192 },
                        cost: { input: 0.13, output: 0 },
                    },
                    'gpt-5': {
                        id: 'gpt-5',
                        name: 'GPT-5',
                        reasoning: true,
                        modalities: { input: ['text'], output: ['text'] },
                        limit: { context: 400_000, output: 128_000 },
                        cost: { input: 1.25, output: 10, cache_read: 0.125 },
                    },
                },
            },
            unknown_provider: {
                id: 'unknown_provider',
                models: {
                    foo: {
                        id: 'foo',
                        name: 'Foo',
                        modalities: { input: ['text'], output: ['text'] },
                        limit: { context: 128_000, output: 8_192 },
                        cost: { input: 1, output: 2 },
                    },
                },
            },
        };

        const result = normalizeModelsDevCatalog(raw, '2026-10-17T00:00:00.000Z');
        expect(result.source).toBe('models.dev');
        expect(result.count).toBe(2);
        expect(result.providers).toEqual(['Anthropic', 'OpenAI']);
        expect(result.models.map(m => m.canonicalId)).toEqual([
            'anthropic/claude-sonnet-4-5',
            'openai/gpt-5',
        ]);
        expect(result.models[0]?.cost).toEqual({
            input: 3,
            output: 15,
            cacheRead: 0.3,
            cacheWrite: 3.75,
        });
    });

    test('falls back to curated catalog when upstream payload is malformed or empty', () => {
        const fallback = normalizeModelsDevCatalog(null, '2026-10-17T00:00:00.000Z');
        expect(fallback.source).toBe('fallback');
        expect(fallback.count).toBeGreaterThan(5);
        expect(fallback.models.some(m => m.id === 'claude-sonnet-4-5')).toBe(true);
    });
});

describe('fetchModelsPricingCatalog caching & resilience', () => {
    test('caches upstream response in memory for MODELS_CACHE_TTL_MS and supports forceRefresh', async () => {
        let fetchCount = 0;
        const fakeFetcher = (async () => {
            fetchCount += 1;
            return new Response(
                JSON.stringify({
                    anthropic: {
                        models: {
                            'claude-sonnet-4-5': {
                                id: 'claude-sonnet-4-5',
                                name: `Claude Sonnet 4.5 v${fetchCount}`,
                                modalities: { input: ['text'], output: ['text'] },
                                limit: { context: 200_000, output: 64_000 },
                                cost: { input: 3, output: 15 },
                            },
                        },
                    },
                }),
                { status: 200 }
            );
        }) as unknown as typeof fetch;

        const t0 = 1_700_000_000_000;
        const first = await fetchModelsPricingCatalog({ fetcher: fakeFetcher, now: t0 });
        expect(first.source).toBe('models.dev');
        expect(first.models[0]?.name).toBe('Claude Sonnet 4.5 v1');
        expect(fetchCount).toBe(1);

        // Within TTL -> returns cached without fetching
        const second = await fetchModelsPricingCatalog({ fetcher: fakeFetcher, now: t0 + 60_000 });
        expect(second.models[0]?.name).toBe('Claude Sonnet 4.5 v1');
        expect(fetchCount).toBe(1);

        // After TTL -> fetches fresh
        const third = await fetchModelsPricingCatalog({
            fetcher: fakeFetcher,
            now: t0 + MODELS_CACHE_TTL_MS + 1,
        });
        expect(third.models[0]?.name).toBe('Claude Sonnet 4.5 v2');
        expect(fetchCount).toBe(2);

        // Force refresh within TTL -> fetches fresh
        const fourth = await fetchModelsPricingCatalog({
            fetcher: fakeFetcher,
            now: t0 + MODELS_CACHE_TTL_MS + 500,
            forceRefresh: true,
        });
        expect(fourth.models[0]?.name).toBe('Claude Sonnet 4.5 v3');
        expect(fetchCount).toBe(3);
    });

    test('returns stale cache if a subsequent refresh fails, or fallback on cold failure', async () => {
        const failingFetcher = (async () => {
            throw new Error('network error');
        }) as unknown as typeof fetch;

        const cold = await fetchModelsPricingCatalog({ fetcher: failingFetcher, now: 1_000 });
        expect(cold.source).toBe('fallback');
        expect(cold.count).toBe(buildFallbackModelCatalog().count);
    });
});
