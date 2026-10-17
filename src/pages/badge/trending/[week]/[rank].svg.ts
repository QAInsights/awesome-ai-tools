import type { APIRoute, GetStaticPaths } from 'astro';
import { getTrendingSnapshots } from '../../../../lib/trending-data';
import { renderTrendingBadgeSvg } from '../../../../lib/trending-badge';

export const getStaticPaths = (() => {
    const snapshots = getTrendingSnapshots();
    return snapshots.flatMap(snapshot => {
        const entries = snapshot.entries.slice(0, 10);
        if (entries.length === 0) {
            return [{
                params: { week: snapshot.week, rank: '1' },
                props: { week: snapshot.week, rank: 1, toolName: undefined },
            }];
        }
        return entries.map(entry => ({
            params: { week: snapshot.week, rank: String(entry.rank) },
            props: { week: snapshot.week, rank: entry.rank, toolName: entry.name },
        }));
    });
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
    const { week, rank, toolName } = props as { week: string; rank: number; toolName?: string };
    const svg = renderTrendingBadgeSvg({ week, rank, toolName });
    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
        },
    });
};
