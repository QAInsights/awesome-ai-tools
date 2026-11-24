import type { Database } from './db';

function countStatement(db: Database, source: string) {
    return db.prepare(`
        SELECT target_tool AS tool, COUNT(*) AS votes FROM switch_votes
        WHERE source_tool = ? GROUP BY target_tool ORDER BY votes DESC, target_tool ASC
    `).bind(source);
}

function mineStatement(db: Database, source: string, voterKey: string | null) {
    return db.prepare('SELECT target_tool FROM switch_votes WHERE source_tool = ? AND voter_key = ?').bind(source, voterKey);
}

function switchResults(rows: Array<{ tool: string; votes: number }>, mine: string | null) {
    const counts = rows.map(row => ({ tool: row.tool, votes: Number(row.votes) }));
    return { total: counts.reduce((sum, row) => sum + row.votes, 0), counts, mine };
}

export async function getSwitches(db: Database, source: string, voterKey: string | null) {
    const result = await countStatement(db, source).all<{ tool: string; votes: number }>();
    const mine = voterKey ? await mineStatement(db, source, voterKey).first<{ target_tool: string }>() : null;
    return switchResults(result.results ?? [], mine?.target_tool ?? null);
}

export async function setSwitch(db: Database, source: string, voterKey: string, target: string | null, now = Date.now()) {
    const write = target === null
        ? db.prepare('DELETE FROM switch_votes WHERE source_tool = ? AND voter_key = ?').bind(source, voterKey)
        : db.prepare(`
        INSERT INTO switch_votes (source_tool, voter_key, target_tool, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_tool, voter_key) DO UPDATE SET target_tool = excluded.target_tool, updated_at = excluded.updated_at
    `).bind(source, voterKey, target, now, now);
    const [, counts, mine] = await db.batch<{ tool: string; votes: number; target_tool: string }>([
        write, countStatement(db, source), mineStatement(db, source, voterKey),
    ]);
    return switchResults(counts!.results ?? [], mine!.results?.[0]?.target_tool ?? null);
}
