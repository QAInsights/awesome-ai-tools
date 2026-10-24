import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { trackRequest } from '../../../lib/server/analytics';
import { sendEmail } from '../../../lib/server/email';
import { renderToolResultEmail } from '../../../lib/server/email-templates/tool-result';
import { enforceRateLimit } from '../../../lib/server/rate-limit';
import { isAllowedMutationRequest } from '../../../lib/server/request-security';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { getSiteOrigin, getToolEmailLimiter, requireDatabase } from '../../../lib/server/runtime-env';
import { privateJson, privateJsonError } from '../../../lib/server/stack-api-response';
import { validateToolEmailInput } from '../../../lib/server/tool-result-email';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return privateJsonError('Invalid request body', 400);
    }
    const validation = validateToolEmailInput(body);
    if (!validation.ok) return privateJsonError(validation.error, 400);

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        if (!user.email || !user.emailVerified) return privateJsonError('email_unverified', 409);
        const limited = await enforceRateLimit(getToolEmailLimiter(), user.id);
        if (limited) return limited;

        const { kind, search, content } = validation.value;
        const siteOrigin = getSiteOrigin();
        const message = renderToolResultEmail({
            kind,
            userName: user.name,
            content,
            resultUrl: `${siteOrigin}/tools/${kind}${search}`,
            siteOrigin,
        });
        await sendEmail({ to: user.email, ...message });
        trackRequest(request, EVENTS.TOOL_RESULT_EMAILED, { userId: user.id, subject: kind });
        return privateJson({ sent: true, email: user.email });
    } catch (error) {
        console.error('[Tool email] Send failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to send email', 503);
    }
};
