import type { APIRoute } from 'astro';
import { suggestUsername, validateUsername } from '../../../lib/stacks';
import { getUsername, setUsername, UsernameTakenError } from '../../../lib/server/username-repository';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { isAllowedMutationRequest } from '../../../lib/server/request-security';
import { requireDatabase } from '../../../lib/server/runtime-env';
import { privateJson, privateJsonError } from '../../../lib/server/stack-api-response';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);

        return privateJson({
            username: await getUsername(db, user.id),
            suggestion: suggestUsername(user.githubUsername, user.email, user.name),
        });
    } catch (error) {
        console.error('[Username] Read failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Username is temporarily unavailable', 503);
    }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);

        let body: { username?: unknown };
        try {
            body = await request.json() as { username?: unknown };
        } catch {
            return privateJsonError('Invalid request body', 400);
        }

        const validation = validateUsername(body?.username);
        if (!validation.ok) return privateJsonError(validation.error, 400);
        await setUsername(db, user.id, validation.value);
        return privateJson({ username: validation.value });
    } catch (error) {
        if (error instanceof UsernameTakenError) return privateJsonError('username_taken', 409);
        console.error('[Username] Update failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to save username', 503);
    }
};
