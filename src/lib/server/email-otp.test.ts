import { describe, expect, test } from 'bun:test';
import { createTestDatabase } from './test-d1-adapter';
import {
    EMAIL_OTP_TTL_MS,
    constantTimeHashEqual,
    generateCode,
    hashCode,
    issueCode,
    normalizeEmail,
    verifyCode,
} from './email-otp';

describe('email OTP helpers', () => {
    test('normalizes valid email addresses and rejects malformed or oversized input', () => {
        expect(normalizeEmail('  Ada.Lovelace@Example.COM  ')).toBe('ada.lovelace@example.com');
        expect(normalizeEmail('not-an-email')).toBeNull();
        expect(normalizeEmail('ada @example.com')).toBeNull();
        expect(normalizeEmail(`a${'x'.repeat(250)}@example.com`)).toBeNull();
        expect(normalizeEmail(null)).toBeNull();
    });

    test('generates uniformly bounded six-digit codes with leading zeroes allowed', () => {
        for (let index = 0; index < 100; index += 1) {
            expect(generateCode()).toMatch(/^\d{6}$/);
        }
    });

    test('hashes the normalized address and code and compares fixed-size hashes', async () => {
        const first = await hashCode('ada@example.com', '001234');
        const same = await hashCode('ada@example.com', '001234');
        const otherEmail = await hashCode('grace@example.com', '001234');

        expect(first).toHaveLength(64);
        expect(constantTimeHashEqual(first, same)).toBe(true);
        expect(constantTimeHashEqual(first, otherEmail)).toBe(false);
        expect(constantTimeHashEqual(first, 'short')).toBe(false);
    });

    test('expires codes after ten minutes and rejects use at the expiry boundary', async () => {
        const { db, sqlite } = createTestDatabase();
        const now = 1_000_000;
        await issueCode(db, 'ada@example.com', now, '012345');
        expect(sqlite.query('SELECT expires_at FROM email_otps').get()).toEqual({
            expires_at: now + EMAIL_OTP_TTL_MS,
        });

        expect(await verifyCode(db, 'ada@example.com', '012345', now + EMAIL_OTP_TTL_MS))
            .toEqual({ ok: false, reason: 'invalid' });
        sqlite.close();
    });

    test('limits an address to three codes in a rolling fifteen-minute window', async () => {
        const { db, sqlite } = createTestDatabase();
        const now = 2_000_000;
        expect(await issueCode(db, 'ada@example.com', now, '000001')).toEqual({ ok: true, id: 1, code: '000001' });
        expect(await issueCode(db, 'ada@example.com', now + 1, '000002')).toEqual({ ok: true, id: 2, code: '000002' });
        expect(await issueCode(db, 'ada@example.com', now + 2, '000003')).toEqual({ ok: true, id: 3, code: '000003' });
        expect(await issueCode(db, 'ada@example.com', now + 3, '000004')).toEqual({
            ok: false,
            reason: 'rate_limited',
        });
        expect(await issueCode(db, 'grace@example.com', now + 3, '000005')).toEqual({
            ok: true,
            id: 4,
            code: '000005',
        });

        sqlite.query(`
            INSERT INTO email_otps (email, code_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        `).run('old@example.com', 'expired', now - 86_400_001, now - 1);
        await issueCode(db, 'new@example.com', now + 4, '000006');
        expect(sqlite.query("SELECT COUNT(*) AS count FROM email_otps WHERE email = 'old@example.com'").get())
            .toEqual({ count: 0 });
        sqlite.close();
    });

    test('counts failed attempts and invalidates a code after the fifth failure', async () => {
        const { db, sqlite } = createTestDatabase();
        const now = 3_000_000;
        await issueCode(db, 'ada@example.com', now, '123456');

        for (let attempt = 1; attempt < 5; attempt += 1) {
            expect(await verifyCode(db, 'ada@example.com', '000000', now + attempt))
                .toEqual({ ok: false, reason: 'invalid' });
        }
        expect(await verifyCode(db, 'ada@example.com', '000000', now + 5))
            .toEqual({ ok: false, reason: 'too_many_attempts' });
        expect(sqlite.query('SELECT attempts, consumed_at FROM email_otps').get()).toEqual({
            attempts: 5,
            consumed_at: now + 5,
        });
        expect(await verifyCode(db, 'ada@example.com', '123456', now + 6))
            .toEqual({ ok: false, reason: 'invalid' });
        sqlite.close();
    });

    test('consumes a successful code but leaves other codes for the caller to clean up', async () => {
        const { db, sqlite } = createTestDatabase();
        const now = 4_000_000;
        await issueCode(db, 'ada@example.com', now, '111111');
        await issueCode(db, 'ada@example.com', now + 1, '222222');

        expect(await verifyCode(db, 'ada@example.com', '222222', now + 2)).toEqual({
            ok: true,
            id: 2,
            consumedAt: now + 2,
        });
        expect(sqlite.query('SELECT email, consumed_at FROM email_otps').all()).toEqual([
            { email: 'ada@example.com', consumed_at: null },
            { email: 'ada@example.com', consumed_at: now + 2 },
        ]);
        expect(await verifyCode(db, 'ada@example.com', '222222', now + 3))
            .toEqual({ ok: false, reason: 'invalid' });
        sqlite.close();
    });

    test('allows only one of two concurrent verifications to consume a code', async () => {
        const { db, sqlite } = createTestDatabase();
        const now = 5_000_000;
        await issueCode(db, 'ada@example.com', now, '123456');

        const results = await Promise.all([
            verifyCode(db, 'ada@example.com', '123456', now + 1),
            verifyCode(db, 'ada@example.com', '123456', now + 1),
        ]);

        expect(results.filter(result => result.ok)).toHaveLength(1);
        expect(sqlite.query('SELECT COUNT(*) AS count FROM email_otps WHERE consumed_at IS NOT NULL').get())
            .toEqual({ count: 1 });
        sqlite.close();
    });
});
