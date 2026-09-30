/**
 * Weekly trending leaderboard: ISO week helpers, engagement aggregation with
 * vote-stuffing guards, scoring, and snapshot assembly.
 *
 * Pure module (no runtime bindings) so the weekly snapshot script, the Astro
 * pages and the tests can all share it.
 */

export const TRENDING_EVENTS = [
    'zap_cast',
    'favorite_added',
    'favorite_removed',
    'follow_added',
    'follow_removed',
    'outbound_click',
] as const;

/**
 * Score = 3·zaps + 4·favorites + 5·follows + 2·√outboundClicks + 2·√starGrowth.
 * Signed-in actions count linearly; anonymous clicks and external star counts
 * are square-root damped so no cheap signal can dominate the board.
 */
export const TRENDING_WEIGHTS = {
    zaps: 3,
    favorites: 4,
    follows: 5,
    outboundClicks: 2,
    starGrowth: 2,
} as const;

/** Actors touching more distinct tools than this in one week are treated as stuffing and ignored for that signal. */
export const MAX_TOOLS_PER_ACTOR = 20;
export const LEADERBOARD_SIZE = 25;
export const RISING_SIZE = 5;
export const NEW_TOOLS_SIZE = 10;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WEEK_ID_PATTERN = /^(\d{4})-w(\d{2})$/;

// ── ISO weeks ────────────────────────────────────────────────────────────────

/** ISO 8601 week id, e.g. "2026-w40", for the UTC date of `date`. */
export function isoWeekId(date: Date): string {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - weekday);
    const year = day.getUTCFullYear();
    const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
    return `${year}-w${String(week).padStart(2, '0')}`;
}

export function isValidWeekId(value: string): boolean {
    const match = WEEK_ID_PATTERN.exec(value);
    if (!match) return false;
    const week = Number(match[2]);
    return week >= 1 && week <= 53 && isoWeekId(weekRange(value, false).start) === value;
}

/** Monday 00:00 UTC (inclusive) to the next Monday 00:00 UTC (exclusive). */
export function weekRange(weekId: string, validate = true): { start: Date; end: Date } {
    const match = WEEK_ID_PATTERN.exec(weekId);
    if (!match || (validate && !isValidWeekId(weekId))) throw new Error(`Invalid ISO week id: ${weekId}`);
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week1Monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS;
    const start = new Date(week1Monday + (week - 1) * WEEK_MS);
    return { start, end: new Date(start.getTime() + WEEK_MS) };
}

export function previousWeekId(weekId: string): string {
    return isoWeekId(new Date(weekRange(weekId).start.getTime() - WEEK_MS));
}

/** The most recent week that has fully ended at `now`. */
export function lastCompletedWeekId(now: Date): string {
    return isoWeekId(new Date(now.getTime() - WEEK_MS));
}

/** "Week 40, 2026" */
export function formatWeekTitle(weekId: string): string {
    const match = WEEK_ID_PATTERN.exec(weekId);
    return match ? `Week ${Number(match[2])}, ${match[1]}` : weekId;
}

/** "Sep 28 to Oct 4, 2026" */
export function formatWeekSpan(weekId: string): string {
    const { start, end } = weekRange(weekId);
    const last = new Date(end.getTime() - DAY_MS);
    const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${day(start)} to ${day(last)}, ${last.getUTCFullYear()}`;
}

// ── Analytics Engine query ───────────────────────────────────────────────────

function sqlDateTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Engagement rows for one week, grouped per actor so the aggregation below can
 * dedupe and apply the stuffing guards. blob1 event, blob2 anonymous id,
 * blob3 user id, blob5 subject (see src/lib/server/analytics.ts).
 */
export function buildWeeklySignalsQuery(dataset: 'aat_events' | 'aat_events_staging', weekId: string): string {
    const { start, end } = weekRange(weekId);
    const events = TRENDING_EVENTS.map(event => `'${event}'`).join(', ');
    return `SELECT blob1 AS event, blob5 AS subject, blob3 AS user_id, blob2 AS anon_id, SUM(_sample_interval) AS n FROM ${dataset} WHERE blob1 IN (${events}) AND timestamp >= toDateTime('${sqlDateTime(start)}') AND timestamp < toDateTime('${sqlDateTime(end)}') GROUP BY event, subject, user_id, anon_id LIMIT 100000`;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export interface SignalRow {
    event?: unknown;
    subject?: unknown;
    user_id?: unknown;
    anon_id?: unknown;
}

export interface TrendingToolRef {
    slug: string;
    name: string;
    company: string;
}

export interface ToolSignals {
    zaps: number;
    favorites: number;
    follows: number;
    outboundClicks: number;
}

export interface GuardStats {
    /** zap_cast events without a signed-in user; the UI gates those (gate_blocked), so they are forged. */
    ungatedZapsDropped: number;
    /** Actors ignored for a signal because they touched more than MAX_TOOLS_PER_ACTOR tools. */
    burstActorsDropped: number;
}

/** Same id the zap backend and zap_cast events use for a tool. */
export function zapToolId(company: string, name: string): string {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${normalize(company)}-${normalize(name)}`;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function emptySignals(): ToolSignals {
    return { zaps: 0, favorites: 0, follows: 0, outboundClicks: 0 };
}

type Signal = 'zap' | 'favorite' | 'follow' | 'outbound';

/**
 * Collapse raw rows into per-tool counts of distinct actors.
 *   - zaps, favorites, follows need a signed-in user; each user counts once per tool
 *   - favorites/follows are net of removals within the week
 *   - outbound clicks count distinct visitors (user id, else anonymous id)
 *   - an actor spreading one signal over more than MAX_TOOLS_PER_ACTOR tools is dropped for it
 */
export function aggregateSignals(rows: SignalRow[], tools: TrendingToolRef[]): { signals: Map<string, ToolSignals>; guard: GuardStats } {
    const slugs = new Set(tools.map(tool => tool.slug));
    const slugByZapId = new Map(tools.map(tool => [zapToolId(tool.company, tool.name), tool.slug]));
    const guard: GuardStats = { ungatedZapsDropped: 0, burstActorsDropped: 0 };

    // signal -> actor -> slug -> net direction (+1 added, -1 removed, 0 both)
    const actions = new Map<Signal, Map<string, Map<string, { added: boolean; removed: boolean }>>>();
    const record = (signal: Signal, actor: string, slug: string, removed: boolean) => {
        const byActor = actions.get(signal) ?? new Map();
        actions.set(signal, byActor);
        const bySlug = byActor.get(actor) ?? new Map();
        byActor.set(actor, bySlug);
        const state = bySlug.get(slug) ?? { added: false, removed: false };
        if (removed) state.removed = true;
        else state.added = true;
        bySlug.set(slug, state);
    };

    for (const row of rows) {
        const event = text(row.event);
        const subject = text(row.subject);
        const userId = text(row.user_id);
        const anonId = text(row.anon_id);
        if (event === 'zap_cast') {
            const slug = slugByZapId.get(subject);
            if (!slug) continue;
            if (!userId) {
                guard.ungatedZapsDropped++;
                continue;
            }
            record('zap', userId, slug, false);
        } else if (event === 'favorite_added' || event === 'favorite_removed') {
            if (userId && slugs.has(subject)) record('favorite', userId, subject, event === 'favorite_removed');
        } else if (event === 'follow_added' || event === 'follow_removed') {
            if (userId && slugs.has(subject)) record('follow', userId, subject, event === 'follow_removed');
        } else if (event === 'outbound_click') {
            const actor = userId || (anonId ? `anon:${anonId}` : '');
            if (actor && slugs.has(subject)) record('outbound', actor, subject, false);
        }
    }

    const signals = new Map<string, ToolSignals>();
    const field: Record<Signal, keyof ToolSignals> = { zap: 'zaps', favorite: 'favorites', follow: 'follows', outbound: 'outboundClicks' };
    for (const [signal, byActor] of actions) {
        for (const bySlug of byActor.values()) {
            if (bySlug.size > MAX_TOOLS_PER_ACTOR) {
                guard.burstActorsDropped++;
                continue;
            }
            for (const [slug, state] of bySlug) {
                const delta = state.added === state.removed ? 0 : state.added ? 1 : -1;
                if (!delta) continue;
                const counts = signals.get(slug) ?? emptySignals();
                counts[field[signal]] += delta;
                signals.set(slug, counts);
            }
        }
    }
    return { signals, guard };
}

// ── GitHub stars ─────────────────────────────────────────────────────────────

const GITHUB_RESERVED_OWNERS = new Set([
    'about', 'apps', 'collections', 'enterprise', 'features', 'login', 'marketplace',
    'orgs', 'pricing', 'settings', 'solutions', 'sponsors', 'topics',
]);

/** "owner/repo" for a github.com repository URL, else null. */
export function githubRepoFromUrl(url: string): string | null {
    const match = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/.exec(url.trim());
    if (!match) return null;
    const owner = match[1]!;
    const repo = match[2]!.replace(/\.git$/, '');
    if (!repo || GITHUB_RESERVED_OWNERS.has(owner.toLowerCase())) return null;
    return `${owner}/${repo}`;
}

/** Stars gained since the previous capture; null when either side is unknown. */
export function computeStarGrowth(current: Record<string, number>, previous: Record<string, number>): Map<string, number | null> {
    const growth = new Map<string, number | null>();
    for (const [slug, stars] of Object.entries(current)) {
        const before = previous[slug];
        growth.set(slug, typeof before === 'number' ? stars - before : null);
    }
    return growth;
}

// ── Scoring and snapshot ─────────────────────────────────────────────────────

export function scoreTool(signals: ToolSignals, starGrowth: number | null = null): number {
    const w = TRENDING_WEIGHTS;
    const score = w.zaps * Math.max(0, signals.zaps)
        + w.favorites * Math.max(0, signals.favorites)
        + w.follows * Math.max(0, signals.follows)
        + w.outboundClicks * Math.sqrt(Math.max(0, signals.outboundClicks))
        + w.starGrowth * Math.sqrt(Math.max(0, starGrowth ?? 0));
    return Math.round(score * 10) / 10;
}

export function scoreAll(signals: Map<string, ToolSignals>, starGrowth: Map<string, number | null> = new Map()): Map<string, number> {
    const scores = new Map<string, number>();
    for (const slug of new Set([...signals.keys(), ...starGrowth.keys()])) {
        const score = scoreTool(signals.get(slug) ?? emptySignals(), starGrowth.get(slug) ?? null);
        if (score > 0) scores.set(slug, score);
    }
    return scores;
}

function rankOrder(scores: Map<string, number>): string[] {
    return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([slug]) => slug);
}

export interface TrendingEntry extends ToolSignals {
    slug: string;
    name: string;
    company: string;
    rank: number;
    score: number;
    starGrowth: number | null;
}

export interface RisingEntry {
    slug: string;
    name: string;
    company: string;
    rank: number;
    previousRank: number | null;
    score: number;
    previousScore: number;
    delta: number;
}

export interface NewToolEntry {
    slug: string;
    name: string;
    company: string;
}

export interface TrendingSnapshot {
    week: string;
    start: string;
    end: string;
    generatedAt: string;
    entries: TrendingEntry[];
    rising: RisingEntry[];
    newTools: NewToolEntry[];
    guard: GuardStats;
}

export interface SnapshotInput {
    week: string;
    generatedAt: Date;
    tools: TrendingToolRef[];
    signals: Map<string, ToolSignals>;
    starGrowth: Map<string, number | null>;
    /** Last week's scores, used for the "Rising this week" deltas. */
    previousScores: Map<string, number>;
    newSlugs: string[];
    guard: GuardStats;
}

export function buildSnapshot(input: SnapshotInput): TrendingSnapshot {
    const bySlug = new Map(input.tools.map(tool => [tool.slug, tool]));
    const ref = (slug: string) => {
        const tool = bySlug.get(slug);
        return tool ? { slug, name: tool.name, company: tool.company } : null;
    };
    const scores = scoreAll(input.signals, input.starGrowth);
    for (const slug of scores.keys()) if (!bySlug.has(slug)) scores.delete(slug);
    const order = rankOrder(scores);
    const rankOf = new Map(order.map((slug, i) => [slug, i + 1]));
    const previousRankOf = new Map(rankOrder(input.previousScores).map((slug, i) => [slug, i + 1]));

    const entries: TrendingEntry[] = order.slice(0, LEADERBOARD_SIZE).map(slug => ({
        ...ref(slug)!,
        ...(input.signals.get(slug) ?? emptySignals()),
        rank: rankOf.get(slug)!,
        score: scores.get(slug)!,
        starGrowth: input.starGrowth.get(slug) ?? null,
    }));

    const rising: RisingEntry[] = order
        .map(slug => {
            const previousScore = input.previousScores.get(slug) ?? 0;
            const score = scores.get(slug)!;
            return {
                ...ref(slug)!,
                rank: rankOf.get(slug)!,
                previousRank: previousRankOf.get(slug) ?? null,
                score,
                previousScore,
                delta: Math.round((score - previousScore) * 10) / 10,
            };
        })
        .filter(entry => entry.delta > 0)
        .sort((a, b) => b.delta - a.delta || a.rank - b.rank)
        .slice(0, RISING_SIZE);

    const newTools = [...new Set(input.newSlugs)]
        .map(ref)
        .filter((tool): tool is NewToolEntry => tool !== null)
        .slice(0, NEW_TOOLS_SIZE);

    const { start, end } = weekRange(input.week);
    return {
        week: input.week,
        start: start.toISOString(),
        end: end.toISOString(),
        generatedAt: input.generatedAt.toISOString(),
        entries,
        rising,
        newTools,
        guard: input.guard,
    };
}

/** Slugs present in `after` but not in `before`, in `after` order. */
export function diffNewSlugs(before: { slug: string }[], after: { slug: string }[]): string[] {
    const known = new Set(before.map(tool => tool.slug));
    return after.map(tool => tool.slug).filter(slug => !known.has(slug));
}

/** Insert or replace a week, keeping the archive sorted newest first. */
export function upsertSnapshot(snapshots: TrendingSnapshot[], snapshot: TrendingSnapshot): TrendingSnapshot[] {
    return [...snapshots.filter(s => s.week !== snapshot.week), snapshot]
        .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}
