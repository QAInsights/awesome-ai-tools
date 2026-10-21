import type { APIRoute } from 'astro';
import { EVENTS } from '../../../../lib/analytics-events.js';
import { getAuthTrigger } from '../../../../lib/server/auth-attribution';
import { trackRequest } from '../../../../lib/server/analytics';
import { normalizeEmail, verifyCode } from '../../../../lib/server/email-otp';
import { isAllowedMutationRequest, jsonError } from '../../../../lib/server/request-security';
import { requireDatabase } from '../../../../lib/server/runtime-env';
import { toClientUser } from '../../../../lib/server/route-auth';
import {
    createSessionForUser,
    createUserSession,
    SESSION_COOKIE_NAME,
    sessionCookieOptions,
    type IdentityProfile,
} from '../../../../lib/server/user-session';

export const prerender = false;

const responseHeaders = { 'Cache-Control': 'no-store' };

async function emailProviderUserId(email: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    let body: { email?: unknown; code?: unknown } | null;
    try {
        body = await request.json() as { email?: unknown; code?: unknown } | null;
    } catch {
        return jsonError('Invalid request body', 400);
    }
    const email = normalizeEmail(body?.email);
    if (!email || typeof body?.code !== 'string' || !/^\d{6}$/.test(body.code)) {
        return jsonError('Enter a valid email and 6-digit code', 400);
    }

    const trigger = getAuthTrigger(cookies);
    let db: ReturnType<typeof requireDatabase> | null = null;
    let consumedOtp: { id: number; consumedAt: number } | null = null;
    try {
        db = requireDatabase();
        const verification = await verifyCode(db, email, body.code);
        if (!verification.ok) {
            const tooManyAttempts = verification.reason === 'too_many_attempts';
            const reason = tooManyAttempts ? 'too_many_attempts' : 'verification_failed';
            trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: reason });
            return jsonError(
                tooManyAttempts ? 'Request a new code' : 'Invalid or expired code',
                tooManyAttempts ? 429 : 401,
            );
        }
        consumedOtp = verification;

        const existing = await db.prepare(`
            SELECT id
            FROM users
            WHERE lower(email) = ? AND email_verified = 1
            ORDER BY last_seen_at DESC, created_at DESC
            LIMIT 1
        `).bind(email).first<{ id: string }>();
        const session = existing
            ? await createSessionForUser(db, existing.id)
            : await createUserSession(db, {
                provider: 'email',
                providerUserId: await emailProviderUserId(email),
                name: email.slice(0, email.indexOf('@')),
                email,
                picture: null,
                githubUsername: null,
                emailVerified: true,
            } satisfies IdentityProfile);

        consumedOtp = null;
        try {
            await db.prepare('DELETE FROM email_otps WHERE email = ? AND id <> ?')
                .bind(email, verification.id)
                .run();
        } catch (cleanupError) {
            console.error('[Email Auth] Failed to clear older sign-in codes:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
        }
        cookies.set(
            SESSION_COOKIE_NAME,
            session.token,
            sessionCookieOptions(new URL(request.url)),
        );
        trackRequest(request, EVENTS.SIGNIN_COMPLETED, {
            userId: session.user.id,
            provider: 'email',
            trigger,
            value: session.isNewUser ? 1 : 0,
        });
        return Response.json({ user: toClientUser(session.user) }, {
            status: 201,
            headers: responseHeaders,
        });
    } catch (error) {
        if (db && consumedOtp) {
            try {
                await db.prepare(`
                    UPDATE email_otps
                    SET consumed_at = NULL
                    WHERE id = ? AND consumed_at = ?
                `).bind(consumedOtp.id, consumedOtp.consumedAt).run();
            } catch (restoreError) {
                console.error('[Email Auth] Failed to restore sign-in code:', restoreError instanceof Error ? restoreError.message : String(restoreError));
            }
        }
        console.error('[Email Auth] Verification failed:', error instanceof Error ? error.message : String(error));
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: 'session_failed' });
        return jsonError('Authentication service unavailable', 503);
    }
};
