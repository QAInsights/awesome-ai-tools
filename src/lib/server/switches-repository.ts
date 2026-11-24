import type { Database } from './db';

export async function getSwitches(db: Database, source: string, voterKey: string | null) {
    const result = await db.prepare(`
        SELECT target_tool AS tool, COUNT(*) AS votes FROM switch_votes
        WHERE source_tool = ? GROUP BY target_tool ORDER BY votes DESC, target_tool ASC
    `).bind(source).all<{ tool: string; votes: number }>();
    const counts = (result.results ?? []).map(row => ({ tool: row.tool, votes: Number(row.votes) }));
    const mine = voterKey ? await db.prepare(`
        SELECT target_tool FROM switch_votes WHERE source_tool = ? AND voter_key = ?
    `).bind(source, voterKey).first<{ target_tool: string }>() : null;
    return { total: counts.reduce((sum, row) => sum + row.votes, 0), counts, mine: mine?.target_tool ?? null };
}

export async function setSwitch(db: Database, source: string, voterKey: string, target: string | null, now = Date.now()) {
    if (target === null) {
        await db.prepare('DELETE FROM switch_votes WHERE source_tool = ? AND voter_key = ?').bind(source, voterKey).run();
        return;
    }
    await db.prepare(`
        INSERT INTO switch_votes (source_tool, voter_key, target_tool, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_tool, voter_key) DO UPDATE SET target_tool = excluded.target_tool, updated_at = excluded.updated_at
    `).bind(source, voterKey, target, now, now).run();
}
