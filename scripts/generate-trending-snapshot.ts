/**
 * Weekly trending snapshot.
 *
 * Scores every catalog tool for the last completed ISO week from Analytics
 * Engine engagement (zaps, favorites, follows, outbound clicks) plus GitHub
 * star growth, then appends the week to data/trending/snapshots.json. Each
 * snapshot backs a permanent /trending/<week> page.
 *
 * Usage: bun scripts/generate-trending-snapshot.ts [--week 2026-w40] [--force]
 * Env:   CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN, ANALYTICS_DATASET (default aat_events), GITHUB_TOKEN (optional)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { getAllTools } from '../src/lib/tools';
import {
    aggregateSignals,
    buildSnapshot,
    buildWeeklySignalsQuery,
    computeStarGrowth,
    diffNewSlugs,
    githubRepoFromUrl,
    isValidWeekId,
    lastCompletedWeekId,
    previousWeekId,
    scoreAll,
    upsertSnapshot,
    weekRange,
    type SignalRow,
    type TrendingSnapshot,
} from '../src/lib/trending';

const SNAPSHOTS_PATH = 'data/trending/snapshots.json';
const STARS_PATH = 'data/trending/github-stars.json';
const GITHUB_CONCURRENCY = 8;

interface StarsFile {
    capturedAt: string | null;
    stars: Record<string, number>;
}

function argValue(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(path: string, fallback: T): T {
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

function datasetName(): 'aat_events' | 'aat_events_staging' {
    const value = process.env.ANALYTICS_DATASET || 'aat_events';
    if (value !== 'aat_events' && value !== 'aat_events_staging') throw new Error(`Unsupported ANALYTICS_DATASET ${value}`);
    return value;
}

async function querySignals(week: string): Promise<SignalRow[]> {
    const accountId = process.env.CF_ACCOUNT_ID ?? '';
    const token = process.env.CF_ANALYTICS_TOKEN ?? '';
    if (!accountId || !token) throw new Error('CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN are required');
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildWeeklySignalsQuery(datasetName(), week),
    });
    if (!response.ok) throw new Error(`Analytics Engine query for ${week} failed: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { data?: SignalRow[] };
    return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchStars(repos: Map<string, string>): Promise<Record<string, number>> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'ai.dosa.dev-trending' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const entries = [...repos.entries()];
    const stars: Record<string, number> = {};
    let failed = 0;
    for (let i = 0; i < entries.length; i += GITHUB_CONCURRENCY) {
        await Promise.all(entries.slice(i, i + GITHUB_CONCURRENCY).map(async ([slug, repo]) => {
            try {
                const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });
                if (!response.ok) throw new Error(String(response.status));
                const body = await response.json() as { stargazers_count?: unknown };
                if (typeof body.stargazers_count === 'number') stars[slug] = body.stargazers_count;
            } catch {
                failed++;
            }
        }));
    }
    if (failed) console.warn(`[Trending] GitHub stars unavailable for ${failed} of ${entries.length} repos`);
    return stars;
}

/** Catalog slugs as of `date`, from git history of data/slugs.json. */
function slugsAt(date: Date): { slug: string }[] | null {
    try {
        const sha = execFileSync('git', ['rev-list', '-1', `--before=${date.toISOString()}`, 'HEAD'], { encoding: 'utf-8' }).trim();
        if (!sha) return null;
        return JSON.parse(execFileSync('git', ['show', `${sha}:data/slugs.json`], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 }));
    } catch {
        return null;
    }
}

async function main() {
    const week = argValue('--week') ?? lastCompletedWeekId(new Date());
    if (!isValidWeekId(week)) throw new Error(`Invalid --week ${week}`);
    const { start, end } = weekRange(week);
    if (end.getTime() > Date.now()) throw new Error(`${week} has not finished yet`);

    const snapshots = readJson<TrendingSnapshot[]>(SNAPSHOTS_PATH, []);
    if (snapshots.some(s => s.week === week) && !process.argv.includes('--force')) {
        console.log(`[Trending] ${week} already snapshotted; pass --force to rebuild`);
        return;
    }

    const catalog = getAllTools();
    const tools = catalog.map(tool => ({ slug: tool.slug, name: tool.name, company: tool.company }));
    const previousWeek = previousWeekId(week);
    const [rows, previousRows] = await Promise.all([querySignals(week), querySignals(previousWeek)]);
    const current = aggregateSignals(rows, tools);
    const previous = aggregateSignals(previousRows, tools);

    const repos = new Map<string, string>();
    for (const tool of catalog) {
        const repo = githubRepoFromUrl(tool.url);
        if (repo) repos.set(tool.slug, repo);
    }
    const starsFile = readJson<StarsFile>(STARS_PATH, { capturedAt: null, stars: {} });
    const freshStars = await fetchStars(repos);
    const githubDown = repos.size > 0 && Object.keys(freshStars).length === 0;
    const starGrowth = githubDown ? new Map<string, number | null>() : computeStarGrowth(freshStars, starsFile.stars);

    const previousSnapshot = snapshots.find(s => s.week === previousWeek);
    const previousStarGrowth = new Map(previousSnapshot?.entries.map(e => [e.slug, e.starGrowth]) ?? []);
    const previousScores = scoreAll(previous.signals, previousStarGrowth);

    const before = slugsAt(start);
    const after = slugsAt(end);
    if (!before || !after) console.warn('[Trending] Catalog history unavailable (shallow clone?); "New this week" left empty');
    const newSlugs = before && after ? diffNewSlugs(before, after) : [];

    const snapshot = buildSnapshot({
        week,
        generatedAt: new Date(),
        tools,
        signals: current.signals,
        starGrowth,
        previousScores,
        newSlugs,
        guard: current.guard,
    });

    writeFileSync(SNAPSHOTS_PATH, `${JSON.stringify(upsertSnapshot(snapshots, snapshot), null, 2)}\n`);
    if (!githubDown) {
        writeFileSync(STARS_PATH, `${JSON.stringify({ capturedAt: snapshot.generatedAt, stars: freshStars }, null, 2)}\n`);
    }
    console.log(`[Trending] ${week}: ${snapshot.entries.length} ranked, ${snapshot.rising.length} rising, ${snapshot.newTools.length} new; dropped ${snapshot.guard.ungatedZapsDropped} ungated zaps and ${snapshot.guard.burstActorsDropped} burst actors`);
}

if (import.meta.main) {
    await main();
}
