export const SITE_HOSTS = ['ai.dosa.dev'];
export const GITHUB_REPO = 'QAInsights/awesome-ai-tools';

export interface TrafficWindow {
    pageViews: number;
    visits: number;
}

export interface TrafficStats {
    last30: TrafficWindow;
    lifetime: TrafficWindow & { since: string };
}

export interface GitHubStats {
    stars: number;
    forks: number;
}

export interface DailyTraffic extends TrafficWindow {
    date: string;
    sampleInterval?: number;
}

export interface BreakdownRow extends TrafficWindow {
    label: string;
}

export const BREAKDOWN_DIMENSIONS = {
    pages: 'requestPath',
    referrers: 'refererHost',
    countries: 'countryName',
    devices: 'deviceType',
} as const;

export type BreakdownKey = keyof typeof BREAKDOWN_DIMENSIONS;
export type TrafficBreakdowns = Record<BreakdownKey, BreakdownRow[]>;

export const DETAIL_RANGES = [7, 30, 90] as const;

export interface TrafficDetail {
    /** First and last complete UTC day queried (inclusive); days inside it without rows had no traffic. */
    coverage: { from: string; to: string };
    /** Persisted complete UTC days, including explicit zero-traffic days, oldest first. */
    daily: DailyTraffic[];
    /** Top rows by page views and by visits per dimension, keyed by range length in days. */
    breakdowns: Record<string, TrafficBreakdowns>;
}

export interface GitHubHistoryPoint extends GitHubStats {
    date: string;
}

export interface SiteStats {
    generatedAt: string;
    traffic: TrafficStats | null;
    github: GitHubStats | null;
    detail?: TrafficDetail | null;
    history?: GitHubHistoryPoint[];
}

interface RumGroup {
    count: number;
    sum: { visits: number };
    dimensions: { requestHost: string };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GraphqlPayload {
    data?: {
        viewer?: {
            accounts?: Array<Record<string, unknown>>;
        };
    };
    errors?: Array<{ message?: string }>;
}

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const SECOND = 1_000;
const DAY = 86_400_000;
const MAX_CHUNKS = 24;
const BREAKDOWN_TOP = 10;

function isoSeconds(value: Date): string {
    return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function finiteNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function buildRetentionChunks(
    now: Date,
    notOlderThanSec: number,
    maxDurationSec: number,
): Array<{ from: string; to: string }> {
    const endMs = Math.floor(now.getTime() / SECOND) * SECOND;
    const retentionSec = Math.max(0, finiteNumber(notOlderThanSec));
    const requestedStartMs = Math.min(endMs, endMs - retentionSec * SECOND + 120 * SECOND);
    const durationSec = finiteNumber(maxDurationSec);
    if (durationSec <= 0 || requestedStartMs === endMs) {
        return [{ from: isoSeconds(new Date(requestedStartMs)), to: isoSeconds(new Date(endMs)) }];
    }

    const chunkMs = durationSec * SECOND;
    const startMs = Math.max(requestedStartMs, endMs - chunkMs * MAX_CHUNKS);
    const chunks: Array<{ from: string; to: string }> = [];
    for (let fromMs = startMs; fromMs < endMs && chunks.length < MAX_CHUNKS; fromMs += chunkMs) {
        const toMs = Math.min(fromMs + chunkMs, endMs);
        chunks.push({ from: isoSeconds(new Date(fromMs)), to: isoSeconds(new Date(toMs)) });
    }
    return chunks;
}

export function buildRumQuery(
    accountTag: string,
    host: string,
    now: Date,
    chunks: Array<{ from: string; to: string }>,
): string {
    const end = isoSeconds(now);
    const last30Start = isoSeconds(new Date(now.getTime() - 30 * DAY));
    const selection = 'count sum { visits } dimensions { requestHost }';
    const fields = [
        `last30: rumPageloadEventsAdaptiveGroups(limit: 100, filter: { requestHost: ${JSON.stringify(host)}, datetime_geq: ${JSON.stringify(last30Start)}, datetime_leq: ${JSON.stringify(end)} }) { ${selection} }`,
        ...chunks.map((chunk, index) => `w${index}: rumPageloadEventsAdaptiveGroups(limit: 100, filter: { requestHost: ${JSON.stringify(host)}, datetime_geq: ${JSON.stringify(chunk.from)}, datetime_leq: ${JSON.stringify(chunk.to)} }) { ${selection} }`),
    ];
    return `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountTag)} }) { ${fields.join('\n')} } } }`;
}

export function summarizeRumGroups(groups: RumGroup[] | undefined, hosts = SITE_HOSTS): TrafficWindow {
    const allowedHosts = new Set(hosts.map(host => host.toLowerCase()));
    let pageViews = 0;
    let visits = 0;
    for (const group of groups ?? []) {
        const host = typeof group?.dimensions?.requestHost === 'string'
            ? group.dimensions.requestHost.toLowerCase()
            : '';
        if (!allowedHosts.has(host)) continue;
        pageViews += finiteNumber(group.count);
        visits += finiteNumber(group.sum?.visits);
    }
    return { pageViews, visits };
}

export function parseGitHubRepo(payload: unknown): GitHubStats | null {
    if (!payload || typeof payload !== 'object') return null;
    const repo = payload as Record<string, unknown>;
    if (typeof repo.stargazers_count !== 'number' || !Number.isFinite(repo.stargazers_count)) return null;
    if (typeof repo.forks_count !== 'number' || !Number.isFinite(repo.forks_count)) return null;
    return { stars: repo.stargazers_count, forks: repo.forks_count };
}

export async function queryCloudflare(fetchImpl: Fetcher, token: string, query: string): Promise<GraphqlPayload> {
    const response = await fetchImpl(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    });
    const payload = await response.json() as GraphqlPayload;
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Cloudflare GraphQL query failed');
    if (!response.ok) throw new Error(`Cloudflare GraphQL query failed: ${response.status}`);
    return payload;
}

/** Query window limits (seconds) of the Web Analytics dataset for this account. */
export async function fetchRumLimits(
    credentials: { accountId: string; token: string },
    fetchImpl: Fetcher = fetch,
): Promise<{ maxDuration: number; notOlderThan: number }> {
    const { accountId, token } = credentials;
    const settingsQuery = `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) { settings { rumPageloadEventsAdaptiveGroups { enabled maxDuration notOlderThan } } } } }`;
    const settingsPayload = await queryCloudflare(fetchImpl, token, settingsQuery);
    const settingsAccount = settingsPayload.data?.viewer?.accounts?.[0];
    const settings = settingsAccount?.settings as Record<string, unknown> | undefined;
    const limits = settings?.rumPageloadEventsAdaptiveGroups as Record<string, unknown> | undefined;
    if (!limits?.enabled || typeof limits.notOlderThan !== 'number' || !Number.isFinite(limits.notOlderThan)
        || typeof limits.maxDuration !== 'number' || !Number.isFinite(limits.maxDuration)) {
        throw new Error('Cloudflare Web Analytics dataset is unavailable');
    }
    return { maxDuration: limits.maxDuration, notOlderThan: limits.notOlderThan };
}

export async function fetchTrafficStats(
    credentials: { accountId: string; token: string },
    fetchImpl: Fetcher = fetch,
    now = new Date(),
): Promise<TrafficStats> {
    const { accountId, token } = credentials;
    if (!accountId || !token) throw new Error('Cloudflare Web Analytics credentials are not configured');

    const limits = await fetchRumLimits({ accountId, token }, fetchImpl);
    const chunks = buildRetentionChunks(now, limits.notOlderThan, limits.maxDuration);
    const dataPayload = await queryCloudflare(
        fetchImpl,
        token,
        buildRumQuery(accountId, SITE_HOSTS[0]!, now, chunks),
    );
    const account = dataPayload.data?.viewer?.accounts?.[0];
    if (!account) throw new Error('Cloudflare Web Analytics returned no account data');

    const last30 = summarizeRumGroups(account.last30 as RumGroup[] | undefined);
    const lifetime = chunks.reduce<TrafficWindow>((total, _chunk, index) => {
        const window = summarizeRumGroups(account[`w${index}`] as RumGroup[] | undefined);
        total.pageViews += window.pageViews;
        total.visits += window.visits;
        return total;
    }, { pageViews: 0, visits: 0 });
    return {
        last30,
        lifetime: { ...lifetime, since: chunks[0]!.from },
    };
}

interface DimensionGroup {
    count: number;
    sum: { visits: number };
    avg?: { sampleInterval?: unknown };
    dimensions: Record<string, unknown>;
}

function rumAlias(alias: string, host: string, chunk: { from: string; to: string }, dimension: string, limit: number): string {
    return `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, orderBy: [count_DESC], filter: { requestHost: ${JSON.stringify(host)}, datetime_geq: ${JSON.stringify(chunk.from)}, datetime_lt: ${JSON.stringify(chunk.to)} }) { count sum { visits } dimensions { ${dimension} } }`;
}

function accountQuery(accountTag: string, fields: string[]): string {
    return `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountTag)} }) { ${fields.join('\n')} } } }`;
}

/** Sums grouped rows by a dimension value across every chunk alias of one query. */
export function mergeDimensionGroups(
    chunks: Array<DimensionGroup[] | undefined>,
    dimension: string,
    emptyLabel = '',
): Map<string, TrafficWindow> {
    const totals = new Map<string, TrafficWindow>();
    for (const groups of chunks) {
        for (const group of groups ?? []) {
            const raw = group?.dimensions?.[dimension];
            const label = typeof raw === 'string' && raw.trim() ? raw.trim() : emptyLabel;
            if (!label) continue;
            const total = totals.get(label) ?? { pageViews: 0, visits: 0 };
            total.pageViews += finiteNumber(group.count);
            total.visits += finiteNumber(group.sum?.visits);
            totals.set(label, total);
        }
    }
    return totals;
}

/** Union of the top rows by page views and by visits, so the client can rank by either metric. */
export function topBreakdownRows(totals: Map<string, TrafficWindow>, limit = BREAKDOWN_TOP): BreakdownRow[] {
    const rows = [...totals.entries()].map(([label, window]) => ({ label, ...window }));
    const top = (metric: keyof TrafficWindow) => [...rows]
        .sort((a, b) => b[metric] - a[metric] || a.label.localeCompare(b.label))
        .slice(0, limit);
    const kept = new Set([...top('pageViews'), ...top('visits')]);
    return rows
        .filter(row => kept.has(row))
        .sort((a, b) => b.pageViews - a.pageViews || b.visits - a.visits || a.label.localeCompare(b.label));
}

function startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function validIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && isoDate(date) === value;
}

function sampleIntervalOf(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : undefined;
}

function dailyWindows(
    today: Date,
    notOlderThanSec: number,
    maxDurationSec: number,
): Array<{ from: string; to: string }> {
    const endMs = today.getTime();
    const requestedStartMs = Math.min(
        endMs,
        endMs - Math.max(0, finiteNumber(notOlderThanSec)) * SECOND + 120 * SECOND,
    );
    const requestedStart = new Date(requestedStartMs);
    const startDay = startOfUtcDay(requestedStart);
    const startMs = startDay.getTime() === requestedStartMs ? requestedStartMs : startDay.getTime() + DAY;
    const maxDurationMs = finiteNumber(maxDurationSec) * SECOND;
    const windowMs = maxDurationMs > 0 && maxDurationMs < 7 * DAY ? maxDurationMs : 7 * DAY;
    const windows: Array<{ from: string; to: string }> = [];
    for (let fromMs = startMs; fromMs < endMs; fromMs += windowMs) {
        windows.push({
            from: isoSeconds(new Date(fromMs)),
            to: isoSeconds(new Date(Math.min(fromMs + windowMs, endMs))),
        });
    }
    return windows;
}

function dailyAlias(
    host: string,
    chunk: { from: string; to: string },
    includeSampleInterval: boolean,
): string {
    const avg = includeSampleInterval ? ' avg { sampleInterval }' : '';
    return `daily: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [date_ASC], filter: { requestHost: ${JSON.stringify(host)}, datetime_geq: ${JSON.stringify(chunk.from)}, datetime_lt: ${JSON.stringify(chunk.to)} }) { count sum { visits }${avg} dimensions { date } }`;
}

/** Preserves the finest sampled value for each date while retaining older history. */
export function mergeDailyHistory(
    previous: DailyTraffic[] | undefined,
    fresh: DailyTraffic[],
    maxDays = 400,
    today = isoDate(new Date()),
): DailyTraffic[] {
    const byDate = new Map<string, DailyTraffic>();
    const canKeep = (entry: DailyTraffic) => validIsoDate(entry.date) && entry.date <= today;
    for (const entry of previous ?? []) {
        if (canKeep(entry)) byDate.set(entry.date, entry);
    }
    for (const entry of fresh) {
        if (!canKeep(entry)) continue;
        const existing = byDate.get(entry.date);
        if (!existing) {
            byDate.set(entry.date, entry);
            continue;
        }
        const previousInterval = sampleIntervalOf(existing.sampleInterval);
        const freshInterval = sampleIntervalOf(entry.sampleInterval);
        if (previousInterval === undefined || (freshInterval !== undefined && freshInterval <= previousInterval)) {
            byDate.set(entry.date, entry);
        }
    }
    const days = Number.isFinite(maxDays) ? Math.max(0, Math.floor(maxDays)) : 400;
    if (days === 0) return [];
    return [...byDate.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-days);
}

/** Daily series and per-range breakdowns for the dashboard on /advertise. */
export async function fetchTrafficDetail(
    credentials: { accountId: string; token: string },
    fetchImpl: Fetcher = fetch,
    now = new Date(),
): Promise<TrafficDetail> {
    const { accountId, token } = credentials;
    if (!accountId || !token) throw new Error('Cloudflare Web Analytics credentials are not configured');
    const host = SITE_HOSTS[0]!;
    const limits = await fetchRumLimits({ accountId, token }, fetchImpl);
    const longest = DETAIL_RANGES[DETAIL_RANGES.length - 1]!;
    // Stop at midnight UTC so the series only contains complete days.
    const today = startOfUtcDay(now);
    const dailySec = Math.min(2 * longest * DAY / SECOND, limits.notOlderThan);
    const dailyChunks = dailyWindows(today, dailySec, limits.maxDuration);
    const firstFullDay = new Date(dailyChunks[0]?.from ?? today.toISOString());
    const coverage = { from: isoDate(firstFullDay), to: isoDate(new Date(today.getTime() - DAY)) };

    const queryAccount = async (fields: string[]) => {
        const payload = await queryCloudflare(fetchImpl, token, accountQuery(accountId, fields));
        const account = payload.data?.viewer?.accounts?.[0];
        if (!account) throw new Error('Cloudflare Web Analytics returned no account data');
        return account;
    };

    const dailyByDate = new Map<string, DailyTraffic>();
    for (const chunk of dailyChunks) {
        let groups: DimensionGroup[] | undefined;
        let sampleIntervalSupported = true;
        try {
            const account = await queryAccount([dailyAlias(host, chunk, true)]);
            groups = account.daily as DimensionGroup[] | undefined;
        } catch (error) {
            if (error instanceof Error && error.message.includes('sampleInterval')) {
                sampleIntervalSupported = false;
                try {
                    const account = await queryAccount([dailyAlias(host, chunk, false)]);
                    groups = account.daily as DimensionGroup[] | undefined;
                } catch (fallbackError) {
                    console.error('[Site Stats] Daily window unavailable:', fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
                    continue;
                }
            } else {
                console.error('[Site Stats] Daily window unavailable:', error instanceof Error ? error.message : String(error));
                continue;
            }
        }
        const rows = (groups ?? []).filter(group => {
            const date = group?.dimensions?.date;
            return typeof date === 'string' && validIsoDate(date) && date >= coverage.from && date <= coverage.to;
        });
        if (!rows.length) continue;
        let windowMaxInterval: number | undefined;
        for (const group of rows) {
            const date = group.dimensions.date as string;
            const sampleInterval = sampleIntervalOf(group.avg?.sampleInterval);
            if (sampleInterval !== undefined) {
                windowMaxInterval = Math.max(windowMaxInterval ?? sampleInterval, sampleInterval);
            }
            const existing = dailyByDate.get(date);
            const entry: DailyTraffic = existing ?? { date, pageViews: 0, visits: 0 };
            entry.pageViews += finiteNumber(group.count);
            entry.visits += finiteNumber(group.sum?.visits);
            if (sampleInterval !== undefined) {
                entry.sampleInterval = Math.max(entry.sampleInterval ?? sampleInterval, sampleInterval);
            }
            dailyByDate.set(date, entry);
        }
        if (!sampleIntervalSupported) continue;
        const firstWindowDay = startOfUtcDay(new Date(chunk.from));
        for (let day = firstWindowDay.getTime(); day < new Date(chunk.to).getTime(); day += DAY) {
            const date = isoDate(new Date(day));
            if (date < coverage.from || date > coverage.to || dailyByDate.has(date)) continue;
            dailyByDate.set(date, {
                date,
                pageViews: 0,
                visits: 0,
                ...(windowMaxInterval === undefined ? {} : { sampleInterval: windowMaxInterval }),
            });
        }
    }
    const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    const rangeChunks = DETAIL_RANGES.map(days => ({
        days,
        chunks: buildRetentionChunks(today, Math.min(days * DAY / SECOND, limits.notOlderThan), limits.maxDuration),
    }));
    const breakdowns: Record<string, TrafficBreakdowns> = Object.fromEntries(
        DETAIL_RANGES.map(days => [String(days), { pages: [], referrers: [], countries: [], devices: [] }]),
    );
    // One query per dimension, so an unsupported field only empties its own tab.
    for (const key of Object.keys(BREAKDOWN_DIMENSIONS) as BreakdownKey[]) {
        const dimension = BREAKDOWN_DIMENSIONS[key];
        try {
            const account = await queryAccount(rangeChunks.flatMap(({ days, chunks }) =>
                chunks.map((chunk, index) => rumAlias(`r${days}_${index}`, host, chunk, dimension, 100))));
            for (const { days, chunks } of rangeChunks) {
                const groups = chunks.map((_chunk, index) => account[`r${days}_${index}`] as DimensionGroup[] | undefined);
                const emptyLabel = key === 'referrers' ? 'Direct / none' : '';
                breakdowns[String(days)]![key] = topBreakdownRows(mergeDimensionGroups(groups, dimension, emptyLabel));
            }
        } catch (error) {
            console.error(`[Site Stats] ${key} breakdown unavailable:`, error instanceof Error ? error.message : String(error));
        }
    }
    return { coverage, daily, breakdowns };
}

export async function fetchGitHubStats(fetchImpl: Fetcher = fetch, token = ''): Promise<GitHubStats> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai.dosa.dev-stats',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`https://api.github.com/repos/${GITHUB_REPO}`, { headers });
    if (!response.ok) throw new Error(`GitHub stats request failed: ${response.status}`);
    const stats = parseGitHubRepo(await response.json());
    if (!stats) throw new Error('GitHub stats response is invalid');
    return stats;
}

export async function loadSiteStats(
    options: { accountId: string; token: string; githubToken?: string },
    fetchImpl: Fetcher = fetch,
): Promise<SiteStats> {
    const credentials = { accountId: options.accountId, token: options.token };
    const [trafficResult, githubResult, detailResult] = await Promise.allSettled([
        fetchTrafficStats(credentials, fetchImpl),
        fetchGitHubStats(fetchImpl, options.githubToken ?? ''),
        fetchTrafficDetail(credentials, fetchImpl),
    ]);
    if (trafficResult.status === 'rejected') {
        console.error('[Site Stats] Traffic unavailable:', trafficResult.reason instanceof Error ? trafficResult.reason.message : String(trafficResult.reason));
    }
    if (githubResult.status === 'rejected') {
        console.error('[Site Stats] GitHub unavailable:', githubResult.reason instanceof Error ? githubResult.reason.message : String(githubResult.reason));
    }
    if (detailResult.status === 'rejected') {
        console.error('[Site Stats] Traffic detail unavailable:', detailResult.reason instanceof Error ? detailResult.reason.message : String(detailResult.reason));
    }
    return {
        generatedAt: new Date().toISOString(),
        traffic: trafficResult.status === 'fulfilled' ? trafficResult.value : null,
        github: githubResult.status === 'fulfilled' ? githubResult.value : null,
        detail: detailResult.status === 'fulfilled' ? detailResult.value : null,
    };
}
