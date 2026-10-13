import type { Database } from './db';

export const ZAP_TOOL_ID_PATTERN = /^[a-z0-9-]{1,128}$/;

interface ZapCountRow {
    tool_id: string;
    n: number | string;
}

export async function getZapCounts(db: Database): Promise<Record<string, number>> {
    const result = await db.prepare(`
        SELECT tool_id, SUM(n) AS n
        FROM (
            SELECT tool_id, count AS n FROM zap_legacy_counts
            UNION ALL
            SELECT tool_id, COUNT(*) AS n FROM zap_votes WHERE source = 'd1' GROUP BY tool_id
        )
        GROUP BY tool_id
        HAVING SUM(n) > 0
    `).bind().all<ZapCountRow>();

    const counts: Record<string, number> = {};
    for (const row of result.results ?? []) {
        const n = Number(row.n);
        if (Number.isFinite(n)) counts[row.tool_id] = n;
    }
    return counts;
}

export async function castZap(
    db: Database,
    toolId: string,
    voterId: string,
    now = Date.now(),
): Promise<'created' | 'duplicate'> {
    const result = await db.prepare(`
        INSERT OR IGNORE INTO zap_votes (tool_id, voter_id, created_at, source)
        VALUES (?, ?, ?, 'd1')
    `).bind(toolId, voterId, now).run();

    return (result.meta?.changes ?? 0) === 0 ? 'duplicate' : 'created';
}
