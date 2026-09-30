import snapshotsJson from '../../data/trending/snapshots.json';
import { isValidWeekId, type TrendingSnapshot } from './trending';

const snapshots = (snapshotsJson as unknown as TrendingSnapshot[])
    .filter(snapshot => isValidWeekId(snapshot.week))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

/** Published weekly snapshots, newest first. */
export function getTrendingSnapshots(): TrendingSnapshot[] {
    return snapshots;
}

export function getLatestTrendingSnapshot(): TrendingSnapshot | null {
    return snapshots[0] ?? null;
}
