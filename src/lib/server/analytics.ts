import { env } from 'cloudflare:workers';
import { EVENT_CATALOG, normalizeEventFields } from '../analytics-events.js';
import { getRequestContext } from './request-context';
import { capturePostHog } from './posthog';

export interface EventFields {
    anonId?: string;
    userId?: string;
    trigger?: string;
    subject?: string;
    route?: string;
    provider?: string;
    referrerHost?: string;
    authState?: 'anon' | 'auth';
    device?: 'mobile' | 'desktop';
    country?: string;
    variant?: string;
    value?: number;
    durationMs?: number;
}

export interface AnalyticsDataPoint {
    indexes: string[];
    blobs: string[];
    doubles: number[];
}

const MAX_BLOB_LENGTH = 256;

function clean(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, MAX_BLOB_LENGTH) : '';
}

export function buildDataPoint(event: string, fields: EventFields = {}): AnalyticsDataPoint {
    return {
        indexes: [event],
        blobs: [
            event,
            clean(fields.anonId),
            clean(fields.userId),
            clean(fields.trigger),
            clean(fields.subject),
            clean(fields.route),
            clean(fields.provider),
            clean(fields.referrerHost),
            clean(fields.authState) || 'anon',
            clean(fields.device),
            clean(fields.country),
            clean(env.CF_VERSION_METADATA?.id || 'dev'),
            clean(fields.variant),
        ],
        doubles: [
            Number.isFinite(fields.value) ? fields.value! : 1,
            Number.isFinite(fields.durationMs) ? fields.durationMs! : 0,
        ],
    };
}

export function track(event: string, fields: EventFields = {}): void {
    try {
        const normalized = normalizeEventFields(event, fields);
        if (!normalized) return;
        const point = buildDataPoint(event, normalized);
        if (import.meta.env.DEV) console.debug('[Analytics]', point);
        env.ANALYTICS?.writeDataPoint(point);
        const definition = EVENT_CATALOG[event as keyof typeof EVENT_CATALOG];
        if (definition?.client === false) capturePostHog(event, normalized);
    } catch {}
}

export function trackRequest(request: Request, event: string, fields: EventFields = {}): void {
    track(event, {
        ...getRequestContext(request),
        ...fields,
        authState: fields.userId ? 'auth' : 'anon',
    });
}
