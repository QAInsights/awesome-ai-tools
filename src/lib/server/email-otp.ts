import type { Database } from './db';

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_OTP_MAX_CODES = 3;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

interface EmailOtpRow {
    id: number;
    code_hash: string;
    attempts: number;
}

export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return email;
}

export function generateCode(): string {
    const bound = 0x1_0000_0000;
    const ceiling = Math.floor(bound / 1_000_000) * 1_000_000;
    const random = new Uint32Array(1);
    do {
        crypto.getRandomValues(random);
    } while (random[0]! >= ceiling);
    return String(random[0]! % 1_000_000).padStart(6, '0');
}

export async function hashCode(email: string, code: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${email}:${code}`),
    );
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeHashEqual(left: string, right: string): boolean {
    let difference = left.length ^ right.length;
    for (let index = 0; index < 64; index += 1) {
        difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }
    return difference === 0;
}

export async function issueCode(
    db: Database,
    email: string,
    now = Date.now(),
    code = generateCode(),
): Promise<{ ok: true; id: number; code: string } | { ok: false; reason: 'rate_limited' }> {
    await db.prepare(`
        DELETE FROM email_otps
        WHERE expires_at <= ? AND created_at <= ?
    `).bind(now, now - 24 * 60 * 60 * 1000).run();

    const recent = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM email_otps
        WHERE email = ? AND created_at >= ? AND created_at <= ?
    `).bind(email, now - EMAIL_OTP_WINDOW_MS, now).first<{ count: number }>();
    if (Number(recent?.count ?? 0) >= EMAIL_OTP_MAX_CODES) {
        return { ok: false, reason: 'rate_limited' };
    }

    const inserted = await db.prepare(`
        INSERT INTO email_otps (email, code_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?)
        RETURNING id
    `).bind(email, await hashCode(email, code), now, now + EMAIL_OTP_TTL_MS).first<{ id: number }>();
    if (!inserted) throw new Error('Could not persist email sign-in code');
    return { ok: true, id: inserted.id, code };
}

export async function verifyCode(
    db: Database,
    email: string,
    code: string,
    now = Date.now(),
): Promise<{ ok: true; id: number; consumedAt: number } | { ok: false; reason: 'invalid' | 'too_many_attempts' }> {
    const row = await db.prepare(`
        SELECT id, code_hash, attempts
        FROM email_otps
        WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).bind(email, now).first<EmailOtpRow>();
    if (!row) return { ok: false, reason: 'invalid' };

    const candidate = await hashCode(email, code);
    if (!constantTimeHashEqual(row.code_hash, candidate)) {
        const result = await db.prepare(`
            UPDATE email_otps
            SET attempts = attempts + 1,
                consumed_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE NULL END
            WHERE id = ? AND consumed_at IS NULL
            RETURNING attempts
        `).bind(EMAIL_OTP_MAX_ATTEMPTS, now, row.id).first<{ attempts: number }>();
        const attempts = Number(result?.attempts ?? row.attempts);
        return {
            ok: false,
            reason: attempts >= EMAIL_OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid',
        };
    }

    const consumed = await db.prepare(`
        UPDATE email_otps
        SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
    `).bind(now, row.id, now).run();
    if (consumed.meta?.changes !== 1) return { ok: false, reason: 'invalid' };
    return { ok: true, id: row.id, consumedAt: now };
}
