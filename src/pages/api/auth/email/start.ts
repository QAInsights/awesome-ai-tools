import type { APIRoute } from 'astro';
import { EVENTS } from '../../../../lib/analytics-events.js';
import { getAuthTrigger } from '../../../../lib/server/auth-attribution';
import { trackRequest } from '../../../../lib/server/analytics';
import { EmailBindingUnavailableError, sendLoginCodeEmail } from '../../../../lib/server/email';
import { issueCode, normalizeEmail } from '../../../../lib/server/email-otp';
import { enforceRateLimit, RATE_LIMIT_RETRY_AFTER_SECONDS } from '../../../../lib/server/rate-limit';
import { isAllowedMutationRequest, jsonError } from '../../../../lib/server/request-security';
import { getEmailOtpLimiter, requireDatabase } from '../../../../lib/server/runtime-env';

export const prerender = false;

const responseHeaders = { 'Cache-Control': 'no-store' };

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) return jsonError('Invalid request origin', 403);

    let body: { email?: unknown } | null;
    try {
        body = await request.json() as { email?: unknown } | null;
    } catch {
        return jsonError('Invalid request body', 400);
    }
    const email = normalizeEmail(body?.email);
    const trigger = getAuthTrigger(cookies);
    if (!email) {
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: 'invalid_email' });
        return jsonError('Enter a valid email address', 400);
    }

    const ip = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
    const ipLimit = await enforceRateLimit(getEmailOtpLimiter(), `email-otp:${ip}`);
    if (ipLimit) {
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: 'rate_limited' });
        return ipLimit;
    }

    try {
        const db = requireDatabase();
        const issued = await issueCode(db, email);
        if (!issued.ok) {
            trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: 'rate_limited' });
            return Response.json({ error: 'rate_limited' }, {
                status: 429,
                headers: {
                    ...responseHeaders,
                    'Retry-After': String(15 * 60),
                },
            });
        }
        try {
            await sendLoginCodeEmail(email, issued.code);
        } catch (error) {
            await db.prepare('DELETE FROM email_otps WHERE id = ?').bind(issued.id).run();
            throw error;
        }
        return Response.json({ ok: true }, { status: 202, headers: responseHeaders });
    } catch (error) {
        const reason = error instanceof EmailBindingUnavailableError ? 'not_configured' : 'send_failed';
        console.error('[Email Auth] Code delivery failed:', error instanceof Error ? error.message : String(error));
        trackRequest(request, EVENTS.AUTH_ERROR, { provider: 'email', trigger, subject: reason });
        return jsonError('Email sign-in is temporarily unavailable', 503);
    }
};
