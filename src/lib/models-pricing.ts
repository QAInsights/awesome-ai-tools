/**
 * Live & fallback LLM token pricing from https://models.dev/api.json.
 *
 * Normalizes the ~2 MB upstream catalog into a compact ~20 KB list of coding
 * and reasoning models with per-1M-token USD pricing and context limits.
 */

export const MODELS_DEV_API_URL = 'https://models.dev/api.json';
export const MODELS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface ModelTokenCost {
    /** USD per 1M uncached input tokens */
    input: number;
    /** USD per 1M output tokens */
    output: number;
    /** USD per 1M cached input tokens (if supported by provider) */
    cacheRead: number | null;
    /** USD per 1M cache-write tokens (if supported by provider) */
    cacheWrite: number | null;
}

export interface ModelPricing {
    id: string;
    canonicalId: string;
    name: string;
    providerId: string;
    provider: string;
    context: number;
    outputLimit: number;
    reasoning: boolean;
    openWeights: boolean;
    releaseDate: string;
    lastUpdated: string;
    cost: ModelTokenCost;
}

export type NormalizedModelPricing = ModelPricing;

export interface ModelCatalogResponse {
    source: 'models.dev' | 'fallback';
    fetchedAt: string;
    ttlSeconds: number;
    count: number;
    providers: string[];
    models: ModelPricing[];
}

export const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    deepseek: 'DeepSeek',
    xai: 'xAI',
    mistral: 'Mistral',
    meta: 'Meta',
    alibaba: 'Qwen (Alibaba)',
    cohere: 'Cohere',
    amazon: 'Amazon Bedrock',
});

const EXCLUDE_MODEL_PATTERNS = [
    /image/i,
    /audio/i,
    /embed/i,
    /vision(?!.*text)/i,
    /tts/i,
    /whisper/i,
    /dall-e/i,
    /realtime/i,
    /translation/i,
    /asr/i,
    /moderation/i,
    /guard/i,
    /preview-\d{2}-\d{2}$/i,
];

export const FALLBACK_MODEL_PRICING: readonly ModelPricing[] = Object.freeze([
    {
        id: 'claude-sonnet-4-5',
        canonicalId: 'anthropic/claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        providerId: 'anthropic',
        provider: 'Anthropic',
        context: 200_000,
        outputLimit: 64_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-09-29',
        lastUpdated: '2025-09-29',
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    },
    {
        id: 'claude-opus-4-5',
        canonicalId: 'anthropic/claude-opus-4-5',
        name: 'Claude Opus 4.5',
        providerId: 'anthropic',
        provider: 'Anthropic',
        context: 200_000,
        outputLimit: 64_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-11-01',
        lastUpdated: '2025-11-01',
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    },
    {
        id: 'claude-haiku-4-5',
        canonicalId: 'anthropic/claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        providerId: 'anthropic',
        provider: 'Anthropic',
        context: 200_000,
        outputLimit: 64_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-10-15',
        lastUpdated: '2025-10-15',
        cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    },
    {
        id: 'gpt-5',
        canonicalId: 'openai/gpt-5',
        name: 'GPT-5',
        providerId: 'openai',
        provider: 'OpenAI',
        context: 400_000,
        outputLimit: 128_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-08-07',
        lastUpdated: '2025-08-07',
        cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: null },
    },
    {
        id: 'gpt-5-mini',
        canonicalId: 'openai/gpt-5-mini',
        name: 'GPT-5 mini',
        providerId: 'openai',
        provider: 'OpenAI',
        context: 400_000,
        outputLimit: 128_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-08-07',
        lastUpdated: '2025-08-07',
        cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: null },
    },
    {
        id: 'gpt-4o',
        canonicalId: 'openai/gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai',
        provider: 'OpenAI',
        context: 128_000,
        outputLimit: 16_384,
        reasoning: false,
        openWeights: false,
        releaseDate: '2024-05-13',
        lastUpdated: '2024-11-20',
        cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: null },
    },
    {
        id: 'o3',
        canonicalId: 'openai/o3',
        name: 'o3',
        providerId: 'openai',
        provider: 'OpenAI',
        context: 200_000,
        outputLimit: 100_000,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-04-16',
        lastUpdated: '2025-06-10',
        cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: null },
    },
    {
        id: 'gemini-2.5-pro',
        canonicalId: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        providerId: 'google',
        provider: 'Google',
        context: 1_048_576,
        outputLimit: 65_536,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-03-25',
        lastUpdated: '2025-06-05',
        cost: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: null },
    },
    {
        id: 'gemini-2.5-flash',
        canonicalId: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        providerId: 'google',
        provider: 'Google',
        context: 1_048_576,
        outputLimit: 65_536,
        reasoning: true,
        openWeights: false,
        releaseDate: '2025-04-17',
        lastUpdated: '2025-06-17',
        cost: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: null },
    },
    {
        id: 'deepseek-chat',
        canonicalId: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        providerId: 'deepseek',
        provider: 'DeepSeek',
        context: 128_000,
        outputLimit: 8_192,
        reasoning: false,
        openWeights: true,
        releaseDate: '2024-12-26',
        lastUpdated: '2025-03-24',
        cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: null },
    },
    {
        id: 'deepseek-reasoner',
        canonicalId: 'deepseek/deepseek-reasoner',
        name: 'DeepSeek R1',
        providerId: 'deepseek',
        provider: 'DeepSeek',
        context: 128_000,
        outputLimit: 64_000,
        reasoning: true,
        openWeights: true,
        releaseDate: '2025-01-20',
        lastUpdated: '2025-05-28',
        cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: null },
    },
    {
        id: 'grok-3',
        canonicalId: 'xai/grok-3',
        name: 'Grok 3',
        providerId: 'xai',
        provider: 'xAI',
        context: 131_072,
        outputLimit: 16_384,
        reasoning: false,
        openWeights: false,
        releaseDate: '2025-02-17',
        lastUpdated: '2025-04-01',
        cost: { input: 3, output: 15, cacheRead: 0.75, cacheWrite: null },
    },
]);

function finiteNonNegative(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function buildFallbackModelCatalog(fetchedAt = new Date().toISOString()): ModelCatalogResponse {
    const models = [...FALLBACK_MODEL_PRICING];
    const providers = [...new Set(models.map(m => m.provider))].sort((a, b) => a.localeCompare(b));
    return {
        source: 'fallback',
        fetchedAt,
        ttlSeconds: Math.floor(MODELS_CACHE_TTL_MS / 1000),
        count: models.length,
        providers,
        models,
    };
}

/**
 * Transform the raw https://models.dev/api.json payload into a normalized
 * ModelCatalogResponse. Falls back to FALLBACK_MODEL_PRICING if the input
 * yields no valid paid text models.
 */
export function normalizeModelsDevCatalog(raw: unknown, fetchedAt = new Date().toISOString()): ModelCatalogResponse {
    if (!raw || typeof raw !== 'object') {
        return buildFallbackModelCatalog(fetchedAt);
    }

    const candidates: ModelPricing[] = [];

    for (const [providerId, providerValue] of Object.entries(raw as Record<string, unknown>)) {
        const providerLabel = PROVIDER_LABELS[providerId];
        if (!providerLabel || !providerValue || typeof providerValue !== 'object') continue;

        const modelsMap = (providerValue as { models?: unknown }).models;
        if (!modelsMap || typeof modelsMap !== 'object') continue;

        for (const [modelKey, modelValue] of Object.entries(modelsMap as Record<string, unknown>)) {
            if (!modelValue || typeof modelValue !== 'object') continue;
            const model = modelValue as Record<string, unknown>;

            const id = typeof model.id === 'string' && model.id ? model.id : modelKey;
            const name = typeof model.name === 'string' && model.name ? model.name : id;

            const modalities = (model.modalities ?? {}) as { input?: unknown; output?: unknown };
            const inputModalities = Array.isArray(modalities.input) ? modalities.input : [];
            const outputModalities = Array.isArray(modalities.output) ? modalities.output : [];
            if (!inputModalities.includes('text') || !outputModalities.includes('text')) continue;
            if (outputModalities.length === 1 && (outputModalities[0] === 'image' || outputModalities[0] === 'audio')) {
                continue;
            }
            if (EXCLUDE_MODEL_PATTERNS.some(pattern => pattern.test(id) || pattern.test(name))) {
                continue;
            }

            const limit = (model.limit ?? {}) as { context?: unknown; output?: unknown };
            const context = finiteNonNegative(limit.context) ?? 0;
            if (context < 8_192) continue;
            const outputLimit = finiteNonNegative(limit.output) ?? 0;

            const costObj = (model.cost ?? {}) as Record<string, unknown>;
            const inputCost = finiteNonNegative(costObj.input);
            const outputCost = finiteNonNegative(costObj.output);
            if (inputCost === null || outputCost === null) continue;
            if (inputCost === 0 && outputCost === 0) continue;

            const cacheRead = finiteNonNegative(costObj.cache_read);
            const cacheWrite = finiteNonNegative(costObj.cache_write);
            const canonicalId =
                typeof model.canonical_model_id === 'string' && model.canonical_model_id
                    ? model.canonical_model_id
                    : `${providerId}/${id}`;

            candidates.push({
                id,
                canonicalId,
                name,
                providerId,
                provider: providerLabel,
                context,
                outputLimit,
                reasoning: Boolean(model.reasoning),
                openWeights: Boolean(model.open_weights),
                releaseDate: typeof model.release_date === 'string' ? model.release_date : '',
                lastUpdated: typeof model.last_updated === 'string' ? model.last_updated : '',
                cost: {
                    input: inputCost,
                    output: outputCost,
                    cacheRead,
                    cacheWrite,
                },
            });
        }
    }

    if (!candidates.length) {
        return buildFallbackModelCatalog(fetchedAt);
    }

    const dedupedMap = new Map<string, ModelPricing>();
    for (const item of candidates) {
        const key = `${item.providerId}::${item.name.toLowerCase()}`;
        const prev = dedupedMap.get(key);
        if (!prev || item.lastUpdated > prev.lastUpdated || item.context > prev.context) {
            dedupedMap.set(key, item);
        }
    }

    const models = [...dedupedMap.values()].sort(
        (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    );
    const providers = [...new Set(models.map(m => m.provider))].sort((a, b) => a.localeCompare(b));

    return {
        source: 'models.dev',
        fetchedAt,
        ttlSeconds: Math.floor(MODELS_CACHE_TTL_MS / 1000),
        count: models.length,
        providers,
        models,
    };
}

let cachedCatalog: { expiresAt: number; data: ModelCatalogResponse } | null = null;

export function resetModelsPricingCache(): void {
    cachedCatalog = null;
}

export async function fetchModelsPricingCatalog({
    fetcher = globalThis.fetch,
    now = Date.now(),
    forceRefresh = false,
}: {
    fetcher?: typeof fetch;
    now?: number;
    forceRefresh?: boolean;
} = {}): Promise<ModelCatalogResponse> {
    if (!forceRefresh && cachedCatalog && cachedCatalog.expiresAt > now) {
        return cachedCatalog.data;
    }

    const fetchedAt = new Date(now).toISOString();
    try {
        const response = await fetcher(MODELS_DEV_API_URL, {
            signal: AbortSignal.timeout(8_000),
            // Cloudflare Worker upstream edge cache hint (ignored outside Workers)
            cf: { cacheTtl: Math.floor(MODELS_CACHE_TTL_MS / 1000), cacheEverything: true },
        } as RequestInit);

        if (!response.ok) {
            throw new Error(`models.dev returned HTTP ${response.status}`);
        }
        const raw = await response.json();
        const catalog = normalizeModelsDevCatalog(raw, fetchedAt);
        cachedCatalog = {
            expiresAt: now + MODELS_CACHE_TTL_MS,
            data: catalog,
        };
        return catalog;
    } catch {
        if (cachedCatalog) {
            return cachedCatalog.data;
        }
        return buildFallbackModelCatalog(fetchedAt);
    }
}
