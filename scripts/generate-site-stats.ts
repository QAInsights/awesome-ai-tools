import { readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { loadSiteStats } from '../src/lib/site-stats';
import type { SiteStats } from '../src/lib/site-stats';

const OUTPUT_PATH = 'public/data/site-stats.json';

// Keep the previous value for any field that failed to refresh, so a
// transient Cloudflare/GitHub outage doesn't blank the published stats.
export function mergeSiteStats(previous: SiteStats | null, fresh: SiteStats): SiteStats {
    return {
        generatedAt: fresh.generatedAt,
        traffic: fresh.traffic ?? previous?.traffic ?? null,
        github: fresh.github ?? previous?.github ?? null,
    };
}

function readPrevious(): SiteStats | null {
    try {
        return JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')) as SiteStats;
    } catch {
        return null;
    }
}

async function main() {
    const fresh = await loadSiteStats({
        accountId: process.env.CF_ACCOUNT_ID ?? '',
        token: process.env.CF_ANALYTICS_TOKEN ?? '',
        githubToken: process.env.GITHUB_TOKEN ?? '',
    });

    if (fresh.traffic === null && fresh.github === null) {
        console.error('[Site Stats] Both Cloudflare and GitHub fetches failed; keeping existing file');
        process.exit(1);
    }

    const merged = mergeSiteStats(readPrevious(), fresh);
    await writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`);
    const traffic = merged.traffic ? `traffic ${merged.traffic.last30.pageViews} pv/30d` : 'traffic unavailable';
    const github = merged.github ? `github ${merged.github.stars} stars` : 'github unavailable';
    console.log(`[Site Stats] Wrote ${OUTPUT_PATH}: ${traffic}, ${github}`);
}

if (import.meta.main) {
    await main();
}
