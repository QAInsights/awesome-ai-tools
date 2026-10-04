import type { APIRoute } from 'astro';
import { validateStackInput } from '../../../lib/stacks';
import { getCookieSessionUser } from '../../../lib/server/route-auth';
import { requireDatabase } from '../../../lib/server/runtime-env';
import {
    deleteStack,
    getOwnedStack,
    StackSlugTakenError,
    updateStack,
} from '../../../lib/server/stacks-repository';
import { privateJson, privateJsonError, withPublicUrl } from '../../../lib/server/stack-api-response';
import { getUsername } from '../../../lib/server/username-repository';
import { isAllowedMutationRequest } from '../../../lib/server/request-security';
import { EVENTS } from '../../../lib/analytics-events.js';
import { trackRequest } from '../../../lib/server/analytics';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, params }) => {
    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const stack = await getOwnedStack(db, user.id, params.id ?? '');
        if (!stack) return privateJsonError('Not found', 404);

        const username = await getUsername(db, user.id);
        return privateJson({ stack: withPublicUrl(stack, username), username });
    } catch (error) {
        console.error('[Stacks] Read failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Stack is temporarily unavailable', 503);
    }
};

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const id = params.id ?? '';
        const existing = await getOwnedStack(db, user.id, id);
        if (!existing) return privateJsonError('Not found', 404);

        let body: Record<string, unknown>;
        try {
            body = await request.json() as Record<string, unknown>;
        } catch {
            return privateJsonError('Invalid request body', 400);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return privateJsonError('Invalid request body', 400);
        }

        const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
        if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') {
            return privateJsonError('isPublic must be true or false', 400);
        }
        const validation = validateStackInput({
            title: has('title') ? body.title : existing.title,
            description: has('description') ? body.description : existing.description,
            slug: has('slug') ? body.slug : existing.slug,
        });
        if (!validation.ok) return privateJsonError(validation.error, 400);

        const changes = {
            ...(has('title') ? { title: validation.value.title } : {}),
            ...(has('description') ? { description: validation.value.description } : {}),
            ...(has('slug') && validation.value.slug ? { slug: validation.value.slug } : {}),
            ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
        };
        const username = await getUsername(db, user.id);
        if (changes.isPublic === true && !username) return privateJsonError('username_required', 409);

        await updateStack(db, user.id, id, changes);
        if (!existing.isPublic && changes.isPublic === true) {
            trackRequest(request, EVENTS.STACK_PUBLISHED, { userId: user.id, subject: changes.slug ?? existing.slug });
        }

        const stack = await getOwnedStack(db, user.id, id);
        if (!stack) return privateJsonError('Not found', 404);
        return privateJson({ stack: withPublicUrl(stack, username), username });
    } catch (error) {
        if (error instanceof StackSlugTakenError) return privateJsonError('slug_taken', 409);
        console.error('[Stacks] Update failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to update stack', 503);
    }
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const deleted = await deleteStack(db, user.id, params.id ?? '');
        if (!deleted) return privateJsonError('Not found', 404);
        return privateJson({ deleted: true });
    } catch (error) {
        console.error('[Stacks] Delete failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to delete stack', 503);
    }
};
