import { EVENTS } from '../analytics-events.js';
import {
    getAnalyticsDataset,
    getCloudflareAccountId,
    getCloudflareAnalyticsToken,
} from './runtime-env';

export type FunnelRange = '24h' | '7d' | '30d';

export interface FunnelEventRow {
    event: string;
    trigger: string;
    subject: string;
    provider: string;
    n: number;
}

export interface FunnelViewModel {
    shown: number;
    started: number;
    completed: number;
    providers: Array<{ provider: string; started: number; completed: number }>;
    triggers: Array<{ trigger: string; blocked: number; completed: number }>;
    outbound: Array<[string, number]>;
}

const INTERVALS: Record<FunnelRange, string> = {
    '24h': "INTERVAL '1' DAY",
    '7d': "INTERVAL '7' DAY",
    '30d': "INTERVAL '30' DAY",
};

export function parseFunnelRange(value: string | null): FunnelRange {
    return value === '24h' || value === '30d' ? value : '7d';
}

function funnelQuery(dataset: 'aat_events' | 'aat_events_staging', range: FunnelRange): string {
    const interval = INTERVALS[range];
    const select = `
        SELECT
            blob1 AS event,
            blob4 AS trigger,
            blob5 AS subject,
            blob7 AS provider,
            SUM(_sample_interval) AS n`;
    const tail = `
        WHERE timestamp >= NOW() - ${interval}
        GROUP BY event, trigger, subject, provider
        ORDER BY n DESC
        LIMIT 10000`;
    return dataset === 'aat_events_staging'
        ? `${select}\n        FROM aat_events_staging${tail}`
        : `${select}\n        FROM aat_events${tail}`;
}

export function buildFunnelViewModel(rows: FunnelEventRow[]): FunnelViewModel {
    const providers = new Map(['github', 'google', 'dev'].map(provider => [provider, { provider, started: 0, completed: 0 }]));
    const triggers = new Map<string, { trigger: string; blocked: number; completed: number }>();
    const outbound = new Map<string, number>();
    let shown = 0;
    let started = 0;
    let completed = 0;

    for (const row of rows) {
        const count = Number(row.n) || 0;
        if (row.event === EVENTS.SIGNIN_MODAL_SHOWN) shown += count;
        if (row.event === EVENTS.SIGNIN_STARTED) {
            started += count;
            const provider = providers.get(row.provider);
            if (provider) provider.started += count;
        }
        if (row.event === EVENTS.SIGNIN_COMPLETED) {
            completed += count;
            const provider = providers.get(row.provider);
            if (provider) provider.completed += count;
            if (row.trigger) {
                const trigger = triggers.get(row.trigger) ?? { trigger: row.trigger, blocked: 0, completed: 0 };
                trigger.completed += count;
                triggers.set(row.trigger, trigger);
            }
        }
        if (row.event === EVENTS.GATE_BLOCKED && row.trigger) {
            const trigger = triggers.get(row.trigger) ?? { trigger: row.trigger, blocked: 0, completed: 0 };
            trigger.blocked += count;
            triggers.set(row.trigger, trigger);
        }
        if (row.event === EVENTS.OUTBOUND_CLICK && row.subject) {
            outbound.set(row.subject, (outbound.get(row.subject) ?? 0) + count);
        }
    }

    return {
        shown,
        started,
        completed,
        providers: Array.from(providers.values()),
        triggers: Array.from(triggers.values()),
        outbound: Array.from(outbound).sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
}

export async function runAnalyticsSql(sql: string): Promise<unknown[]> {
    const accountId = getCloudflareAccountId();
    const token = getCloudflareAnalyticsToken();
    if (!accountId || !token) throw new Error('Cloudflare Analytics query credentials are not configured');

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: sql,
    });
    if (!response.ok) throw new Error(`Cloudflare Analytics query failed: ${response.status}`);

    const payload = await response.json() as { data?: unknown[] };
    return payload.data ?? [];
}

export async function queryFunnel(range: FunnelRange): Promise<FunnelViewModel> {
    const rows = await runAnalyticsSql(funnelQuery(getAnalyticsDataset(), range));
    return buildFunnelViewModel(rows as FunnelEventRow[]);
}

export async function loadFunnel(range: FunnelRange): Promise<{ data: FunnelViewModel; error: string }> {
    try {
        return { data: await queryFunnel(range), error: '' };
    } catch (error) {
        return {
            data: buildFunnelViewModel([]),
            error: error instanceof Error ? error.message : 'Analytics unavailable',
        };
    }
}
