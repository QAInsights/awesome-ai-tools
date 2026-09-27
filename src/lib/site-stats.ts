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

export interface SiteStats {
    generatedAt: string;
    traffic: TrafficStats | null;
    github: GitHubStats | null;
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

async function queryCloudflare(fetchImpl: Fetcher, token: string, query: string): Promise<GraphqlPayload> {
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

export async function fetchTrafficStats(
    credentials: { accountId: string; token: string },
    fetchImpl: Fetcher = fetch,
    now = new Date(),
): Promise<TrafficStats> {
    const { accountId, token } = credentials;
    if (!accountId || !token) throw new Error('Cloudflare Web Analytics credentials are not configured');

    const settingsQuery = `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) { settings { rumPageloadEventsAdaptiveGroups { enabled maxDuration notOlderThan } } } } }`;
    const settingsPayload = await queryCloudflare(fetchImpl, token, settingsQuery);
    const settingsAccount = settingsPayload.data?.viewer?.accounts?.[0];
    const settings = settingsAccount?.settings as Record<string, unknown> | undefined;
    const limits = settings?.rumPageloadEventsAdaptiveGroups as Record<string, unknown> | undefined;
    if (!limits?.enabled || typeof limits.notOlderThan !== 'number' || !Number.isFinite(limits.notOlderThan)
        || typeof limits.maxDuration !== 'number' || !Number.isFinite(limits.maxDuration)) {
        throw new Error('Cloudflare Web Analytics dataset is unavailable');
    }

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
    const [trafficResult, githubResult] = await Promise.allSettled([
        fetchTrafficStats({ accountId: options.accountId, token: options.token }, fetchImpl),
        fetchGitHubStats(fetchImpl, options.githubToken ?? ''),
    ]);
    if (trafficResult.status === 'rejected') {
        console.error('[Site Stats] Traffic unavailable:', trafficResult.reason instanceof Error ? trafficResult.reason.message : String(trafficResult.reason));
    }
    if (githubResult.status === 'rejected') {
        console.error('[Site Stats] GitHub unavailable:', githubResult.reason instanceof Error ? githubResult.reason.message : String(githubResult.reason));
    }
    return {
        generatedAt: new Date().toISOString(),
        traffic: trafficResult.status === 'fulfilled' ? trafficResult.value : null,
        github: githubResult.status === 'fulfilled' ? githubResult.value : null,
    };
}
