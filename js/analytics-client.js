import { EVENT_CATALOG, normalizeEventFields } from '../src/lib/analytics-events.js';
import { capture } from './posthog.js';

const STORAGE_KEY = 'aat_aid';
const FLUSH_SIZE = 10;
const FLUSH_DELAY_MS = 2_000;
const MIRRORED_FIELDS = ['trigger', 'subject', 'provider', 'value', 'durationMs'];

export function mirrorClientEvent(event, fields, captureEvent = capture) {
    if (!EVENT_CATALOG[event]?.client) return;
    const normalized = normalizeEventFields(event, fields);
    if (!normalized) return;
    const props = {};
    for (const field of MIRRORED_FIELDS) {
        const value = normalized[field];
        if (value !== '' && value !== undefined) props[field] = value;
    }
    captureEvent(event, props);
}

export function createAnalytics({
    request = globalThis.fetch,
    storage = globalThis.localStorage,
    navigation = globalThis.navigator,
    eventTarget = globalThis.window,
    randomUUID = () => globalThis.crypto?.randomUUID?.() ?? '',
    mirror = null,
} = {}) {
    let queue = [];
    let timer = null;
    let initialized = false;

    function anonymousId() {
        if (navigation?.globalPrivacyControl || navigation?.doNotTrack === '1') return '';
        try {
            let id = storage?.getItem(STORAGE_KEY) ?? '';
            if (!id) {
                id = randomUUID();
                if (id) storage?.setItem(STORAGE_KEY, id);
            }
            return id;
        } catch {
            return '';
        }
    }

    function schedule() {
        if (timer !== null) return;
        timer = setTimeout(() => {
            timer = null;
            flush();
        }, FLUSH_DELAY_MS);
    }

    function flush() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (queue.length === 0) return;
        const events = queue;
        queue = [];
        try {
            Promise.resolve(request('/api/events', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ events }),
                keepalive: true,
            })).catch(() => {});
        } catch {}
    }

    function track(event, fields = {}) {
        try {
            mirror?.(event, fields);
        } catch {}
        try {
            queue.push({ ...fields, event, anonId: anonymousId() });
            if (queue.length >= FLUSH_SIZE) flush();
            else schedule();
        } catch {}
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        eventTarget?.addEventListener?.('pagehide', flush);
    }

    initialize();
    return { flush, track };
}

export const analytics = createAnalytics({ mirror: mirrorClientEvent });
