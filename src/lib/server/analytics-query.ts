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
    badgeReferrals: Array<[string, number]>;
    adPrompt: { closed: number; shown: number; opened: number; completed: number };
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
    const badgeReferrals = new Map<string, number>();
    let shown = 0;
    let started = 0;
    let completed = 0;
    const adPrompt = { closed: 0, shown: 0, opened: 0, completed: 0 };

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
        if (row.event === EVENTS.AD_CLOSED) adPrompt.closed += count;
        if (row.event === EVENTS.AD_PROMPT_SHOWN) adPrompt.shown += count;
        if (row.trigger === 'ad_close' && row.event === EVENTS.SIGNIN_MODAL_SHOWN) adPrompt.opened += count;
        if (row.trigger === 'ad_close' && row.event === EVENTS.SIGNIN_COMPLETED) adPrompt.completed += count;
        if (row.event === EVENTS.BADGE_REFERRAL) {
            const key = row.subject || '(home)';
            badgeReferrals.set(key, (badgeReferrals.get(key) ?? 0) + count);
        }
    }

    return {
        shown,
        started,
        completed,
        providers: Array.from(providers.values()),
        triggers: Array.from(triggers.values()),
        outbound: Array.from(outbound).sort((a, b) => b[1] - a[1]).slice(0, 20),
        badgeReferrals: Array.from(badgeReferrals).sort((a, b) => b[1] - a[1]).slice(0, 20),
        adPrompt,
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

export type ReferrerGroup = 'search' | 'github' | 'social' | 'ai' | 'direct' | 'other';

export const REFERRER_GROUPS: readonly ReferrerGroup[] = ['search', 'github', 'social', 'ai', 'direct', 'other'];

const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'chat.deepseek.com', 'grok.com', 'meta.ai', 'phind.com', 'poe.com', 'you.com'];
const SEARCH_HOSTS = ['bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com', 'ecosia.org', 'search.brave.com', 'kagi.com', 'startpage.com', 'qwant.com', 'naver.com', 'com.google.android.googlequicksearchbox'];
const SOCIAL_HOSTS = ['x.com', 't.co', 'twitter.com', 'reddit.com', 'linkedin.com', 'lnkd.in', 'facebook.com', 'news.ycombinator.com', 'youtube.com', 'bsky.app', 'threads.net', 'instagram.com', 'mastodon.social', 'producthunt.com', 'discord.com'];

function matchesHost(host: string, domains: string[]): boolean {
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function referrerGroup(host: string): ReferrerGroup {
    if (!host) return 'direct';
    if (matchesHost(host, AI_HOSTS)) return 'ai';
    if (/(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)yandex\.[a-z.]+$/.test(host) || matchesHost(host, SEARCH_HOSTS)) return 'search';
    if (matchesHost(host, ['github.com'])) return 'github';
    if (matchesHost(host, SOCIAL_HOSTS)) return 'social';
    return 'other';
}

/** Daily event counts; `day` is the UTC day number (unix seconds / 86400). */
export interface GrowthCountRow {
    event: string;
    trigger: string;
    subject: string;
    day: number;
    n: number;
}

/** One row per anonymous visitor per UTC day with a visit. */
export interface VisitorDayRow {
    anonId: string;
    day: number;
}

export interface PeriodCount {
    last7: number;
    prev7: number;
    last28: number;
}

export interface ReturnRate {
    rate: number | null;
    previous: number | null;
}

export interface GrowthViewModel {
    referrerGroups: Array<{ group: ReferrerGroup } & PeriodCount>;
    referrerHosts: Array<{ host: string } & PeriodCount>;
    refSources: Array<{ source: string } & PeriodCount>;
    visits: PeriodCount;
    visitors: { last7: number; prev7: number };
    weeklyReturn: ReturnRate;
    monthlyReturn: ReturnRate;
    weekly: Array<{ label: string; current: number; previous: number }>;
    truncated: boolean;
}

export const GROWTH_ROW_LIMIT = 10000;
const GROWTH_DAYS = 56;
const WEEKLY_EVENTS: Array<[string, string]> = [
    [EVENTS.SIGNIN_COMPLETED, 'Sign-ins'],
    [EVENTS.FAVORITE_ADDED, 'Favorites'],
    [EVENTS.FOLLOW_ADDED, 'Follows'],
];

function fromDataset(dataset: 'aat_events' | 'aat_events_staging'): string {
    return dataset === 'aat_events_staging' ? 'FROM aat_events_staging' : 'FROM aat_events';
}

export function growthCountsQuery(dataset: 'aat_events' | 'aat_events_staging'): string {
    const events = [EVENTS.VISIT, ...WEEKLY_EVENTS.map(([event]) => event)].map(event => `blob1 = '${event}'`).join(' OR ');
    return `
        SELECT
            blob1 AS event,
            blob4 AS trigger,
            blob5 AS subject,
            intDiv(toUInt32(timestamp), 86400) AS day,
            SUM(_sample_interval) AS n
        ${fromDataset(dataset)}
        WHERE timestamp >= NOW() - INTERVAL '${GROWTH_DAYS}' DAY AND (${events})
        GROUP BY event, trigger, subject, day
        LIMIT ${GROWTH_ROW_LIMIT}`;
}

export function visitorDaysQuery(dataset: 'aat_events' | 'aat_events_staging'): string {
    return `
        SELECT
            blob2 AS anonId,
            intDiv(toUInt32(timestamp), 86400) AS day
        ${fromDataset(dataset)}
        WHERE timestamp >= NOW() - INTERVAL '${GROWTH_DAYS}' DAY AND blob1 = '${EVENTS.VISIT}'
        GROUP BY anonId, day
        LIMIT ${GROWTH_ROW_LIMIT}`;
}

function emptyPeriod(): PeriodCount {
    return { last7: 0, prev7: 0, last28: 0 };
}

function addToPeriod(period: PeriodCount, age: number, count: number): void {
    if (age < 7) period.last7 += count;
    else if (age < 14) period.prev7 += count;
    if (age < 28) period.last28 += count;
}

function ratio(numerator: number, denominator: number): number | null {
    return denominator ? numerator / denominator : null;
}

/**
 * Folds daily rows into the growth panels. Windows are whole UTC days ending
 * today: last7 = days 0-6 ago, prev7 = 7-13, last28 = 0-27.
 */
export function buildGrowthViewModel(countRows: GrowthCountRow[], visitorRows: VisitorDayRow[], today: number): GrowthViewModel {
    const groups = new Map(REFERRER_GROUPS.map(group => [group, emptyPeriod()]));
    const hosts = new Map<string, PeriodCount>();
    const refs = new Map<string, PeriodCount>();
    const visits = emptyPeriod();
    const weekly = new Map(WEEKLY_EVENTS.map(([event, label]) => [event, { label, current: 0, previous: 0 }]));

    for (const row of countRows) {
        const age = today - Number(row.day);
        const count = Number(row.n) || 0;
        if (!(age >= 0 && age < GROWTH_DAYS) || !count) continue;
        if (row.event === EVENTS.VISIT) {
            addToPeriod(visits, age, count);
            addToPeriod(groups.get(referrerGroup(row.subject))!, age, count);
            if (row.subject) {
                const host = hosts.get(row.subject) ?? emptyPeriod();
                addToPeriod(host, age, count);
                hosts.set(row.subject, host);
            }
            if (row.trigger) {
                const ref = refs.get(row.trigger) ?? emptyPeriod();
                addToPeriod(ref, age, count);
                refs.set(row.trigger, ref);
            }
            continue;
        }
        const entry = weekly.get(row.event);
        if (entry && age < 7) entry.current += count;
        else if (entry && age < 14) entry.previous += count;
    }

    const weeks: Array<Set<string>> = [new Set(), new Set(), new Set()];
    const days = new Map<string, Set<number>>();
    for (const row of visitorRows) {
        const age = today - Number(row.day);
        if (!row.anonId || !(age >= 0 && age < GROWTH_DAYS)) continue;
        if (age < 21) weeks[Math.floor(age / 7)]!.add(row.anonId);
        const seen = days.get(row.anonId) ?? new Set<number>();
        seen.add(age);
        days.set(row.anonId, seen);
    }
    const returned = (earlier: Set<string>, later: Set<string>) => ratio([...earlier].filter(id => later.has(id)).length, earlier.size);
    const monthly = (from: number) => {
        let visitors = 0;
        let returning = 0;
        for (const seen of days.values()) {
            const inWindow = [...seen].filter(age => age >= from && age < from + 28).length;
            if (inWindow) visitors += 1;
            if (inWindow >= 2) returning += 1;
        }
        return ratio(returning, visitors);
    };

    const byLast28 = <K extends string>(entries: Map<K, PeriodCount>, key: string) =>
        Array.from(entries, ([name, period]) => ({ [key]: name, ...period }))
            .filter(entry => entry.last28 || entry.prev7)
            .sort((a, b) => b.last28 - a.last28 || b.last7 - a.last7);

    return {
        referrerGroups: REFERRER_GROUPS.map(group => ({ group, ...groups.get(group)! })),
        referrerHosts: (byLast28(hosts, 'host') as GrowthViewModel['referrerHosts']).slice(0, 15),
        refSources: byLast28(refs, 'source') as GrowthViewModel['refSources'],
        visits,
        visitors: { last7: weeks[0]!.size, prev7: weeks[1]!.size },
        weeklyReturn: { rate: returned(weeks[1]!, weeks[0]!), previous: returned(weeks[2]!, weeks[1]!) },
        monthlyReturn: { rate: monthly(0), previous: monthly(28) },
        weekly: Array.from(weekly.values()),
        truncated: countRows.length >= GROWTH_ROW_LIMIT || visitorRows.length >= GROWTH_ROW_LIMIT,
    };
}

/** Week-over-week change, e.g. "+25%", "-10%", "new", or "—" when both are zero. */
export function formatDelta(current: number, previous: number): string {
    if (!previous) return current ? 'new' : '—';
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct > 0 ? '+' : ''}${pct}%`;
}

/** Change between two rates in percentage points, e.g. "+3.1 pts". */
export function formatPointDelta(rate: number | null, previous: number | null): string {
    if (rate === null || previous === null) return '—';
    const points = (rate - previous) * 100;
    return `${points > 0 ? '+' : ''}${points.toFixed(1)} pts`;
}

export function formatRate(rate: number | null): string {
    return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

export async function loadGrowth(now = Date.now()): Promise<{ data: GrowthViewModel; error: string }> {
    const today = Math.floor(now / 86_400_000);
    try {
        const dataset = getAnalyticsDataset();
        const [counts, visitors] = await Promise.all([
            runAnalyticsSql(growthCountsQuery(dataset)),
            runAnalyticsSql(visitorDaysQuery(dataset)),
        ]);
        return { data: buildGrowthViewModel(counts as GrowthCountRow[], visitors as VisitorDayRow[], today), error: '' };
    } catch (error) {
        return {
            data: buildGrowthViewModel([], [], today),
            error: error instanceof Error ? error.message : 'Analytics unavailable',
        };
    }
}
