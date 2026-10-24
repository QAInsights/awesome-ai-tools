import type { Database } from './db';

export const TOOL_EMAIL_DAILY_LIMIT = 20;

export function utcDay(now: number): string {
    return new Date(now).toISOString().slice(0, 10);
}

export function secondsUntilNextUtcDay(now: number): number {
    const date = new Date(now);
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - now) / 1000));
}

/** Atomically counts one send against today's cap; returns false when the cap is already reached. */
export async function reserveToolEmailSend(
    db: Database,
    userId: string,
    now = Date.now(),
    limit = TOOL_EMAIL_DAILY_LIMIT,
): Promise<boolean> {
    const day = utcDay(now);
    const row = await db.prepare(`
        INSERT INTO tool_email_daily_counts (user_id, day, count) VALUES (?1, ?2, 1)
        ON CONFLICT(user_id, day) DO UPDATE SET count = tool_email_daily_counts.count + 1
        WHERE tool_email_daily_counts.count < ?3
        RETURNING count
    `).bind(userId, day, limit).first<{ count: number }>();
    if (!row) return false;
    if (Number(row.count) === 1) {
        await db.prepare('DELETE FROM tool_email_daily_counts WHERE user_id = ?1 AND day < ?2')
            .bind(userId, day)
            .run()
            .catch(() => {});
    }
    return true;
}

export async function releaseToolEmailSend(db: Database, userId: string, now = Date.now()): Promise<void> {
    await db.prepare(`
        UPDATE tool_email_daily_counts SET count = count - 1
        WHERE user_id = ?1 AND day = ?2 AND count > 0
    `).bind(userId, utcDay(now)).run();
}
