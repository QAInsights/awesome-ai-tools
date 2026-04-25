/**
 * Lightweight localStorage cache for the enriched-tools.json dataset.
 *
 * Stale-while-revalidate strategy:
 *   - `read()` returns the cached array instantly (may be stale).
 *   - `isStale(entry)` tells caller whether a network revalidation is warranted.
 *   - `write(data)` persists a fresh copy with timestamp.
 *
 * Envelope shape:
 *   { v: 1, data: ToolDetail[], fetchedAt: <epochMs>, etag: <string|null> }
 */

const STORAGE_KEY = 'tools:enriched:v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Read the cached enriched payload, or null if absent / corrupted.
 * @returns {{data: Array, fetchedAt: number, etag: string|null}|null}
 */
export function read() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.data)) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Persist fresh payload. Silently drops on quota errors after evicting old entry.
 * @param {Array} data
 * @param {string|null} etag
 */
export function write(data, etag = null) {
    if (!Array.isArray(data) || data.length === 0) return;
    const envelope = { v: 1, data, fetchedAt: Date.now(), etag };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (err) {
        // Likely QuotaExceededError — evict and retry once
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        } catch {
            console.warn('[tool-cache] Failed to persist enriched cache:', err);
        }
    }
}

/**
 * @param {{fetchedAt: number}|null} entry
 * @returns {boolean}
 */
export function isStale(entry) {
    if (!entry) return true;
    return (Date.now() - entry.fetchedAt) > TTL_MS;
}

/** Clear cache (exported for dev tooling / manual invalidation). */
export function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
