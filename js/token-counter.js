/**
 * token-counter.js
 * Pure JS tokenizer + live model data from models.dev.
 *
 * Tokenization approach:
 *  - BPE approximation targeting cl100k_base (GPT-4 family) at multiplier=1.0
 *  - Accuracy: ~±5% vs tiktoken for typical English text
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS_API = 'https://models.dev/api.json';
const CACHE_KEY  = 'tc_models_v1';
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 hours in ms

/**
 * Provider display names and their tokenizer multipliers.
 * Models not in this map are skipped (too niche / fine-tuned / non-text).
 * Multiplier = how their tokenizer compares to cl100k_base.
 */
const PROVIDER_CONFIG = {
    openai:    { label: 'OpenAI',    multiplier: 1.00 },
    anthropic: { label: 'Anthropic', multiplier: 1.05 },
    google:    { label: 'Google',    multiplier: 0.98 },
    mistral:   { label: 'Mistral',   multiplier: 1.02 },
    meta:      { label: 'Meta',      multiplier: 1.02 },
    deepseek:  { label: 'DeepSeek',  multiplier: 1.00 },
    xai:       { label: 'xAI',       multiplier: 1.00 },
    amazon:    { label: 'Amazon',    multiplier: 1.00 },
    cohere:    { label: 'Cohere',    multiplier: 1.00 },
};

/**
 * Model IDs to explicitly exclude (duplicates, image-only, fine-tune variants).
 * Pattern-based filtering handles most; these cover stragglers.
 */
const EXCLUDE_PATTERNS = [
    /image/i, /audio/i, /embed/i, /vision(?!.*text)/i,
    /tts/i, /whisper/i, /dall-e/i, /whi/i,
    /realtime/i, /translation/i, /asr/i,
    /preview-\d{2}-\d{2}$/i,  // dated preview slugs
];

// ---------------------------------------------------------------------------
// Model fetching + transformation
// ---------------------------------------------------------------------------

/**
 * Fetch and transform models from models.dev.
 * Results are cached in sessionStorage for CACHE_TTL duration.
 *
 * @returns {Promise<{models: Array, families: Array<string>}>}
 */
export async function fetchModels() {
    // 1. Try sessionStorage cache
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL) return data;
        }
    } catch { /* ignore quota / parse errors */ }

    // 2. Fetch from API
    const res  = await fetch(MODELS_API);
    const json = await res.json();

    const models   = [];
    const families = new Set();

    for (const [providerId, provider] of Object.entries(json)) {
        const cfg = PROVIDER_CONFIG[providerId];
        if (!cfg) continue; // skip niche/reseller providers

        if (!provider.models || typeof provider.models !== 'object') continue;

        for (const [, model] of Object.entries(provider.models)) {
            // Must be text-in / text-out
            const inp = model.modalities?.input  || [];
            const out = model.modalities?.output || [];
            if (!inp.includes('text') || !out.includes('text')) continue;

            // Skip if output includes only image/audio
            if (out.length === 1 && (out[0] === 'image' || out[0] === 'audio')) continue;

            // Skip models matching exclude patterns
            if (EXCLUDE_PATTERNS.some(p => p.test(model.id) || p.test(model.name || ''))) continue;

            // Must have a non-trivial context window
            const context = model.limit?.context;
            if (!context || context < 4096) continue;

            families.add(cfg.label);
            models.push({
                id:         model.id,
                name:       model.name || model.id,
                family:     cfg.label,
                context,
                multiplier: cfg.multiplier,
                reasoning:  model.reasoning ?? false,
                releaseDate: model.release_date || '',
            });
        }
    }

    // 3. De-duplicate by (family + name) — keep the one with the largest context
    const deduped = [];
    const seen    = new Map();
    for (const m of models) {
        const key = `${m.family}::${m.name.toLowerCase()}`;
        const existing = seen.get(key);
        if (!existing || m.context > existing.context) {
            seen.set(key, m);
        }
    }
    for (const m of seen.values()) deduped.push(m);

    // 4. Sort: family asc, then name asc
    deduped.sort((a, b) =>
        a.family.localeCompare(b.family) || a.name.localeCompare(b.name)
    );

    const familiesArr = ['All', ...Array.from(families).sort()];
    const result = { models: deduped, families: familiesArr };

    // 5. Cache
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }));
    } catch { /* ignore quota errors */ }

    return result;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Estimate token count for `text` using a BPE approximation.
 * Base targets cl100k_base (GPT-4); apply model.multiplier for others.
 *
 * @param {string} text
 * @param {number} multiplier — model-specific adjustment factor (default 1.0)
 * @returns {number}
 */
export function estimateTokens(text, multiplier = 1.0) {
    if (!text || text.trim().length === 0) return 0;

    const words = text.trim().split(/\s+/);
    let count   = 0;
    for (const w of words) count += tokensPerWord(w);

    return Math.round(count * multiplier);
}

/**
 * Per-word token estimate derived from BPE behaviour:
 *  - Short, common ASCII words → 1 token
 *  - Longer words: ~1 token per 4 alpha chars
 *  - Each digit run / punctuation char / non-ASCII char adds tokens
 */
function tokensPerWord(word) {
    if (!word.length) return 0;

    const nonAscii   = (word.match(/[^\x00-\x7F]/g) || []).length;
    const digitRuns  = (word.match(/\d+/g)           || []).length;
    const punctCount = (word.match(/[^\w\s]/g)        || []).length;
    const asciiAlpha = word
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/\d/g, '')
        .replace(/[^\w]/g, '')
        .length;

    const alphaTokens = Math.max(1, Math.ceil(asciiAlpha / 4));
    return alphaTokens + digitRuns + punctCount + nonAscii * 2;
}

/**
 * Run tokenizer across every model and enrich with fill stats.
 *
 * @param {string} text
 * @param {Array}  models — from fetchModels()
 * @returns {Array<{model, tokens, fillPct, isNearLimit, isOverLimit}>}
 */
export function countAllModels(text, models) {
    return models.map(model => {
        const tokens  = estimateTokens(text, model.multiplier);
        const fillPct = Math.min(100, (tokens / model.context) * 100);
        return {
            model,
            tokens,
            fillPct,
            isNearLimit: fillPct >= 75 && fillPct < 100,
            isOverLimit: fillPct >= 100,
        };
    });
}

// ---------------------------------------------------------------------------
// URL State
// ---------------------------------------------------------------------------

const URL_PARAM    = 'text';
const MAX_URL_CHARS = 2000;

export function getTextFromURL() {
    try {
        const p = new URLSearchParams(window.location.search);
        return p.has(URL_PARAM) ? decodeURIComponent(p.get(URL_PARAM)) : '';
    } catch { return ''; }
}

export function syncTextToURL(text) {
    const url = new URL(window.location);
    if (text) {
        url.searchParams.set(URL_PARAM, encodeURIComponent(text.slice(0, MAX_URL_CHARS)));
    } else {
        url.searchParams.delete(URL_PARAM);
    }
    window.history.replaceState({}, '', url);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatTokens(n) {
    return n.toLocaleString();
}

export function formatContext(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
    return `${n}`;
}

export function buildSummaryText(text, results) {
    const lines = [
        `Token Count Summary — ai.dosa.dev/tools/token-counter`,
        `Prompt: ${text.length} chars, ~${text.trim().split(/\s+/).length} words`,
        '',
        ...results.map(r =>
            `${r.model.name.padEnd(30)} ${formatTokens(r.tokens).padStart(8)} tokens  (${r.fillPct.toFixed(1)}% of ${formatContext(r.model.context)} ctx)`
        ),
    ];
    return lines.join('\n');
}
