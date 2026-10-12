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
    /** Complete UTC days, oldest first, covering two of the longest range for period-over-period deltas. */
    daily: DailyTraffic[];
    /** Top rows per dimension, keyed by range length in days. */
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
    dimensions: Record<string, unknown>;
}

function rumAlias(alias: string, host: string, chunk: { from: string; to: string }, dimension: string, limit: number): string {
    return `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, orderBy: [count_DESC], filter: { requestHost: ${JSON.stringify(host)}, datetime_geq: ${JSON.stringify(chunk.from)}, datetime_leq: ${JSON.stringify(chunk.to)} }) { count sum { visits } dimensions { ${dimension} } }`;
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

export function topBreakdownRows(totals: Map<string, TrafficWindow>, limit = BREAKDOWN_TOP): BreakdownRow[] {
    return [...totals.entries()]
        .map(([label, window]) => ({ label, ...window }))
        .sort((a, b) => b.pageViews - a.pageViews || b.visits - a.visits || a.label.localeCompare(b.label))
        .slice(0, limit);
}

function startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
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
    const dailyChunks = buildRetentionChunks(today, dailySec, limits.maxDuration);

    const queryAccount = async (fields: string[]) => {
        const payload = await queryCloudflare(fetchImpl, token, accountQuery(accountId, fields));
        const account = payload.data?.viewer?.accounts?.[0];
        if (!account) throw new Error('Cloudflare Web Analytics returned no account data');
        return account;
    };

    const dailyAccount = await queryAccount(dailyChunks.map((chunk, index) => rumAlias(`d${index}`, host, chunk, 'date', 1000)));
    const dailyTotals = mergeDimensionGroups(dailyChunks.map((_chunk, index) => dailyAccount[`d${index}`] as DimensionGroup[] | undefined), 'date');
    const daily = [...dailyTotals.entries()]
        .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < isoSeconds(today).slice(0, 10))
        .map(([date, window]) => ({ date, ...window }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const breakdowns: Record<string, TrafficBreakdowns> = {};
    for (const days of DETAIL_RANGES) {
        const chunks = buildRetentionChunks(today, Math.min(days * DAY / SECOND, limits.notOlderThan), limits.maxDuration);
        const keys = Object.keys(BREAKDOWN_DIMENSIONS) as BreakdownKey[];
        const account = await queryAccount(keys.flatMap(key => chunks.map((chunk, index) =>
            rumAlias(`${key}${index}`, host, chunk, BREAKDOWN_DIMENSIONS[key], 100))));
        breakdowns[String(days)] = Object.fromEntries(keys.map(key => {
            const groups = chunks.map((_chunk, index) => account[`${key}${index}`] as DimensionGroup[] | undefined);
            const emptyLabel = key === 'referrers' ? 'Direct / none' : '';
            return [key, topBreakdownRows(mergeDimensionGroups(groups, BREAKDOWN_DIMENSIONS[key], emptyLabel))];
        })) as TrafficBreakdowns;
    }
    return { daily, breakdowns };
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
