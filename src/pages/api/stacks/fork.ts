import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { isValidStackSlug, validateUsername } from '../../../lib/stacks';
import { trackRequest } from '../../../lib/server/analytics';
import { enforceRateLimit } from '../../../lib/server/rate-limit';
import { isAllowedMutationRequest } from '../../../lib/server/request-security';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { getStackWriteLimiter, requireDatabase } from '../../../lib/server/runtime-env';
import { privateJson, privateJsonError, withPublicUrl } from '../../../lib/server/stack-api-response';
import { forkPublicStack } from '../../../lib/server/stack-fork';
import { StackLimitError } from '../../../lib/server/stacks-repository';
import { getUsername } from '../../../lib/server/username-repository';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const limited = await enforceRateLimit(getStackWriteLimiter(), user.id);
        if (limited) return limited;

        let body: { username?: unknown; slug?: unknown };
        try {
            body = await request.json() as { username?: unknown; slug?: unknown };
        } catch {
            return privateJsonError('Invalid request body', 400);
        }

        const usernameResult = validateUsername(body?.username);
        if (!usernameResult.ok) return privateJsonError('Invalid source username', 400);
        if (!isValidStackSlug(body?.slug)) return privateJsonError('Invalid source stack slug', 400);

        const result = await forkPublicStack(db, user.id, usernameResult.value, body.slug);
        if (result.status === 'not_found') return privateJsonError('Source stack not found', 404);

        const viewerUsername = await getUsername(db, user.id);
        trackRequest(request, EVENTS.STACK_CREATED, { userId: user.id, subject: result.stack.slug });
        return privateJson({
            stack: withPublicUrl(result.stack, viewerUsername),
            editorUrl: `/stacks/edit?id=${encodeURIComponent(result.stack.id)}`,
        }, 201);
    } catch (error) {
        if (error instanceof StackLimitError) return privateJsonError('stack_limit', 409);
        console.error('[Stacks] Fork failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to fork stack', 503);
    }
};
