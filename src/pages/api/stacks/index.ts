import type { APIRoute } from 'astro';
import { EVENTS } from '../../../lib/analytics-events.js';
import { validateStackInput } from '../../../lib/stacks';
import { trackRequest } from '../../../lib/server/analytics';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { getStackWriteLimiter, requireDatabase } from '../../../lib/server/runtime-env';
import { createStack, listStacks, StackLimitError } from '../../../lib/server/stacks-repository';
import { privateJson, privateJsonError, withPublicUrl } from '../../../lib/server/stack-api-response';
import { getUsername } from '../../../lib/server/username-repository';
import { isAllowedMutationRequest } from '../../../lib/server/request-security';
import { enforceRateLimit } from '../../../lib/server/rate-limit';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);

        const [stacks, username] = await Promise.all([
            listStacks(db, user.id),
            getUsername(db, user.id),
        ]);
        return privateJson({
            stacks: stacks.map(stack => withPublicUrl(stack, username)),
            username,
        });
    } catch (error) {
        console.error('[Stacks] List failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Stacks are temporarily unavailable', 503);
    }
};

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

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return privateJsonError('Invalid request body', 400);
        }
        const validation = validateStackInput(body);
        if (!validation.ok) return privateJsonError(validation.error, 400);

        const stack = await createStack(db, user.id, validation.value);
        const username = await getUsername(db, user.id);
        trackRequest(request, EVENTS.STACK_CREATED, { userId: user.id, subject: stack.slug });
        return privateJson({ stack: withPublicUrl(stack, username), username }, 201);
    } catch (error) {
        if (error instanceof StackLimitError) return privateJsonError('stack_limit', 409);
        console.error('[Stacks] Create failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to create stack', 503);
    }
};
