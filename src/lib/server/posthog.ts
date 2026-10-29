import { env, waitUntil } from 'cloudflare:workers';
import type { EventFields } from './analytics';

const PROPERTY_FIELDS = ['trigger', 'subject', 'provider', 'route', 'device', 'country', 'value', 'durationMs'] as const;

export function buildPostHogEvent(event: string, fields: EventFields = {}) {
    const properties: Record<string, unknown> = {
        source: 'server',
        $lib: 'ai-dosa-dev-worker',
        $geoip_disable: true,
    };
    for (const field of PROPERTY_FIELDS) {
        const value = fields[field];
        if (value !== undefined && value !== null && value !== '') properties[field] = value;
    }
    if (!fields.userId) properties.$process_person_profile = false;

    return {
        api_key: env.POSTHOG_KEY,
        event,
        distinct_id: fields.userId || fields.anonId || globalThis.crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        properties,
    };
}

export function capturePostHog(event: string, fields: EventFields = {}): void {
    try {
        if (import.meta.env.DEV || !env.POSTHOG_KEY) return;
        const host = (env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
        const promise = fetch(`${host}/i/v0/e/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPostHogEvent(event, fields)),
        }).catch(() => {});
        waitUntil(promise);
    } catch {}
}
