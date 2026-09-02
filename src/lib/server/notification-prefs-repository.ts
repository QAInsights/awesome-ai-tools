import type { Database } from './db';

export interface NotificationPrefs {
    emailEnabled: boolean;
    unsubscribeToken: string;
    lastDigestSentAt: number | null;
}

interface NotificationPrefsRow {
    email_enabled: number;
    unsubscribe_token: string;
    last_digest_sent_at: number | null;
}

function toNotificationPrefs(row: NotificationPrefsRow): NotificationPrefs {
    return {
        emailEnabled: Boolean(row.email_enabled),
        unsubscribeToken: row.unsubscribe_token,
        lastDigestSentAt: row.last_digest_sent_at,
    };
}

async function readPrefs(db: Database, userId: string): Promise<NotificationPrefs> {
    const row = await db.prepare(`
        SELECT email_enabled, unsubscribe_token, last_digest_sent_at
        FROM notification_prefs
        WHERE user_id = ?
    `).bind(userId).first<NotificationPrefsRow>();
    if (!row) throw new Error('Notification preferences were not created');
    return toNotificationPrefs(row);
}

export async function findPrefsByUnsubscribeToken(
    db: Database,
    token: string,
): Promise<NotificationPrefs | null> {
    if (!token) return null;
    const row = await db.prepare(`
        SELECT email_enabled, unsubscribe_token, last_digest_sent_at
        FROM notification_prefs
        WHERE unsubscribe_token = ?
    `).bind(token).first<NotificationPrefsRow>();
    return row ? toNotificationPrefs(row) : null;
}

export async function getOrCreatePrefs(
    db: Database,
    userId: string,
): Promise<NotificationPrefs> {
    await db.prepare(`
        INSERT OR IGNORE INTO notification_prefs (
            user_id, email_enabled, unsubscribe_token, last_digest_sent_at, updated_at
        ) VALUES (?, 1, ?, NULL, ?)
    `).bind(userId, crypto.randomUUID(), Date.now()).run();
    return readPrefs(db, userId);
}

export async function setEmailEnabled(
    db: Database,
    userId: string,
    enabled: boolean,
): Promise<NotificationPrefs> {
    await db.prepare(`
        INSERT OR IGNORE INTO notification_prefs (
            user_id, email_enabled, unsubscribe_token, last_digest_sent_at, updated_at
        ) VALUES (?, 1, ?, NULL, ?)
    `).bind(userId, crypto.randomUUID(), Date.now()).run();
    await db.prepare(`
        UPDATE notification_prefs
        SET email_enabled = ?, updated_at = ?
        WHERE user_id = ?
    `).bind(enabled ? 1 : 0, Date.now(), userId).run();
    return readPrefs(db, userId);
}

export async function unsubscribeByToken(db: Database, token: string): Promise<boolean> {
    if (!token) return false;
    const result = await db.prepare(`
        UPDATE notification_prefs
        SET email_enabled = 0, updated_at = ?
        WHERE unsubscribe_token = ?
    `).bind(Date.now(), token).run();
    return (result.meta?.changes ?? 0) > 0;
}
