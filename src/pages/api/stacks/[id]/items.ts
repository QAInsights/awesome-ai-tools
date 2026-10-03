import type { APIRoute } from 'astro';
import { getAllTools, getToolBySlug } from '../../../../lib/tools';
import { validateItems } from '../../../../lib/stacks';
import { getCookieSessionUser } from '../../../../lib/server/route-auth';
import { requireDatabase } from '../../../../lib/server/runtime-env';
import {
    appendItem,
    getOwnedStack,
    replaceItems,
} from '../../../../lib/server/stacks-repository';
import { privateJson, privateJsonError, withPublicUrl } from '../../../../lib/server/stack-api-response';
import { getUsername } from '../../../../lib/server/username-repository';
import { isAllowedMutationRequest } from '../../../../lib/server/request-security';

export const prerender = false;

const knownSlugs = () => new Set(getAllTools().map(tool => tool.slug));

export const PUT: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const id = params.id ?? '';
        if (!await getOwnedStack(db, user.id, id)) return privateJsonError('Not found', 404);

        let body: { items?: unknown };
        try {
            body = await request.json() as { items?: unknown };
        } catch {
            return privateJsonError('Invalid request body', 400);
        }
        const validation = validateItems(body?.items, knownSlugs());
        if (!validation.ok) return privateJsonError(validation.error, 400);
        await replaceItems(db, user.id, id, validation.value);

        const [stack, username] = await Promise.all([
            getOwnedStack(db, user.id, id),
            getUsername(db, user.id),
        ]);
        if (!stack) return privateJsonError('Not found', 404);
        return privateJson({ stack: withPublicUrl(stack, username), username });
    } catch (error) {
        console.error('[Stacks] Items replacement failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to save stack tools', 503);
    }
};

export const POST: APIRoute = async ({ request, cookies, params }) => {
    if (!isAllowedMutationRequest(request, import.meta.env.DEV)) {
        return privateJsonError('Invalid request origin', 403);
    }

    try {
        const db = requireDatabase();
        const user = await getCookieSessionUser(cookies, db);
        if (!user) return privateJsonError('Unauthorized', 401);
        const id = params.id ?? '';
        if (!await getOwnedStack(db, user.id, id)) return privateJsonError('Not found', 404);

        let body: { slug?: unknown; purpose?: unknown; usageNotes?: unknown };
        try {
            body = await request.json() as { slug?: unknown; purpose?: unknown; usageNotes?: unknown };
        } catch {
            return privateJsonError('Invalid request body', 400);
        }
        if (typeof body?.slug !== 'string') return privateJsonError('A tool slug is required', 400);
        const tool = getToolBySlug(body.slug);
        if (!tool) return privateJsonError(`Unknown tool: ${body.slug}`, 400);
        const purpose = body.purpose === undefined ? tool.categoryShort : body.purpose;
        const validation = validateItems([{
            slug: body.slug,
            purpose,
            usageNotes: body.usageNotes,
        }], knownSlugs());
        if (!validation.ok) return privateJsonError(validation.error, 400);

        const result = await appendItem(db, user.id, id, {
            slug: validation.value[0]!.slug,
            purpose: validation.value[0]!.purpose,
            usageNotes: validation.value[0]!.usageNotes,
        });
        if (result.status === 'not_found') return privateJsonError('Not found', 404);
        if (result.status === 'limit') return privateJsonError('item_limit', 409);
        if (result.status === 'exists') return privateJsonError('item_exists', 409);
        const username = await getUsername(db, user.id);
        return privateJson({
            status: result.status,
            item: result.item,
            publicUrl: username ? `/u/${encodeURIComponent(username)}/${encodeURIComponent((await getOwnedStack(db, user.id, id))?.slug ?? '')}` : undefined,
        });
    } catch (error) {
        console.error('[Stacks] Item append failed:', error instanceof Error ? error.message : String(error));
        return privateJsonError('Unable to add tool to stack', 503);
    }
};
