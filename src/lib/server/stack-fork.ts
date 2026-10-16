import { MAX_STACK_TITLE_LENGTH, type StackItemInput } from '../stacks';
import type { Database } from './db';
import {
    createStack,
    getOwnedStack,
    getPublicStack,
    replaceItems,
    type OwnedStack,
} from './stacks-repository';

export type ForkStackResult =
    | { status: 'forked'; stack: OwnedStack }
    | { status: 'not_found' };

export function buildForkTitle(sourceTitle: string): string {
    const clean = sourceTitle.trim() || 'AI stack';
    const suffix = ' (Fork)';
    if (clean.endsWith(suffix)) return clean.slice(0, MAX_STACK_TITLE_LENGTH);
    const maxStem = MAX_STACK_TITLE_LENGTH - suffix.length;
    return `${clean.slice(0, maxStem).trimEnd()}${suffix}`;
}

export async function forkPublicStack(
    db: Database,
    viewerUserId: string,
    sourceUsername: string,
    sourceSlug: string,
    now = Date.now(),
): Promise<ForkStackResult> {
    const publicResult = await getPublicStack(db, sourceUsername, sourceSlug);
    if (publicResult.status !== 'found') {
        return { status: 'not_found' };
    }

    const source = publicResult.stack;
    const created = await createStack(
        db,
        viewerUserId,
        {
            title: buildForkTitle(source.title),
            description: source.description,
        },
        now,
    );

    const items: StackItemInput[] = source.items
        .filter(item => item.enabled)
        .map((item, position) => ({
            slug: item.slug,
            purpose: item.purpose,
            usageNotes: item.usageNotes,
            enabled: true,
            position,
        }));

    if (items.length > 0) {
        await replaceItems(db, viewerUserId, created.id, items, now);
    }

    const forked = await getOwnedStack(db, viewerUserId, created.id);
    if (!forked) return { status: 'not_found' };
    return { status: 'forked', stack: forked };
}
