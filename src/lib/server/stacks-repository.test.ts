import { describe, expect, test } from 'bun:test';
import { MAX_ITEMS_PER_STACK, MAX_STACKS_PER_USER, validateItems } from '../stacks';
import { addTestUser, createTestDatabase } from './test-d1-adapter';
import {
    appendItem,
    createStack,
    deleteStack,
    getOwnedStack,
    getPublicStack,
    listPublicStackProfileUsernames,
    listPublicStacksByUser,
    listPublicStacksForSitemap,
    listStacks,
    replaceItems,
    StackLimitError,
    updateStack,
} from './stacks-repository';
import { setUsername } from './username-repository';

describe('stacks repository', () => {
    test('creates private stacks and publishes only enabled items', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        await setUsername(db, 'github:ada', 'ada', 10);
        const stack = await createStack(db, 'github:ada', { title: 'My tools' }, 20);

        expect(stack.isPublic).toBe(false);
        expect(await getPublicStack(db, 'ada', stack.slug)).toEqual({ status: 'not_found' });

        const items = validateItems([
            { slug: 'cursor', purpose: 'Build features', usageNotes: 'Plan first' },
            { slug: 'zed', purpose: 'Review code', enabled: false },
        ], new Set(['cursor', 'zed']));
        if (!items.ok) throw new Error(items.error);
        expect(await replaceItems(db, 'github:ada', stack.id, items.value, 30)).toBe(true);
        expect(await updateStack(db, 'github:ada', stack.id, { isPublic: true }, 40)).toBe(true);

        const publicStack = await getPublicStack(db, 'ada', stack.slug);
        expect(publicStack.status).toBe('found');
        if (publicStack.status === 'found') {
            expect(publicStack.stack.items).toEqual([
                { slug: 'cursor', position: 0, purpose: 'Build features', usageNotes: 'Plan first', enabled: true },
            ]);
        }
        expect((await getOwnedStack(db, 'github:ada', stack.id))?.items).toHaveLength(2);
        expect((await listStacks(db, 'github:ada'))[0]).toMatchObject({
            itemCount: 2,
            enabledItemCount: 1,
        });
        sqlite.close();
    });

    test('keeps slug redirects and prevents current and historical collisions', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        await setUsername(db, 'github:ada', 'ada', 10);
        const first = await createStack(db, 'github:ada', { title: 'My tools' }, 20);
        const second = await createStack(db, 'github:ada', { title: 'My tools' }, 30);
        expect(second.slug).toBe('my-tools-2');
        await replaceItems(db, 'github:ada', first.id, [
            { slug: 'cursor', purpose: 'Build', usageNotes: null, enabled: true, position: 0 },
        ], 40);
        await updateStack(db, 'github:ada', first.id, { isPublic: true }, 50);

        expect(await updateStack(db, 'github:ada', first.id, { slug: 'build-tools' }, 60)).toBe(true);
        expect(await getPublicStack(db, 'ada', 'my-tools')).toEqual({
            status: 'redirect',
            username: 'ada',
            slug: 'build-tools',
        });
        await expect(updateStack(db, 'github:ada', second.id, { slug: 'my-tools' }, 70))
            .rejects.toThrow('already in use');
        await expect(updateStack(db, 'github:ada', second.id, { slug: 'build-tools' }, 80))
            .rejects.toThrow('already in use');
        sqlite.close();
    });

    test('redirects historical usernames to the current public stack URL', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        await setUsername(db, 'github:ada', 'ada', 10);
        const stack = await createStack(db, 'github:ada', { title: 'My tools' }, 20);
        await replaceItems(db, 'github:ada', stack.id, [
            { slug: 'cursor', purpose: 'Build', usageNotes: null, enabled: true, position: 0 },
        ], 30);
        await updateStack(db, 'github:ada', stack.id, { isPublic: true }, 40);
        await setUsername(db, 'github:ada', 'ada-lovelace', 50);

        expect(await getPublicStack(db, 'ada', stack.slug)).toEqual({
            status: 'redirect',
            username: 'ada-lovelace',
            slug: stack.slug,
        });
        sqlite.close();
    });

    test('does not reveal or update another owner’s stack', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        addTestUser(sqlite, 'github:grace');
        const stack = await createStack(db, 'github:ada', { title: 'Private work' }, 10);

        expect(await getOwnedStack(db, 'github:grace', stack.id)).toBeNull();
        expect(await updateStack(db, 'github:grace', stack.id, { title: 'Stolen' }, 20)).toBe(false);
        expect(await deleteStack(db, 'github:grace', stack.id)).toBe(false);
        expect((await getOwnedStack(db, 'github:ada', stack.id))?.title).toBe('Private work');
        sqlite.close();
    });

    test('appends items at the next position and returns exists and max outcomes', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        const stack = await createStack(db, 'github:ada', { title: 'My tools' }, 10);

        expect(await appendItem(db, 'github:ada', stack.id, { slug: 'cursor', purpose: 'Build' }, 20))
            .toMatchObject({ status: 'added', item: { position: 0 } });
        expect(await appendItem(db, 'github:ada', stack.id, { slug: 'cursor', purpose: 'Build' }, 30))
            .toMatchObject({ status: 'exists' });
        expect(await appendItem(db, 'github:grace', stack.id, { slug: 'zed', purpose: 'Review' }, 40))
            .toEqual({ status: 'not_found' });

        const rows = Array.from({ length: MAX_ITEMS_PER_STACK }, (_, index) => ({
            slug: `tool-${index}`,
            purpose: 'Use tool',
            usageNotes: null,
            enabled: true,
            position: index,
        }));
        await replaceItems(db, 'github:ada', stack.id, rows);
        expect(await appendItem(db, 'github:ada', stack.id, { slug: 'last', purpose: 'Use it' }))
            .toEqual({ status: 'limit' });
        sqlite.close();
    });

    test('enforces stack limits and allocates collision-free slugs', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        const stacks = [];
        for (let index = 0; index < MAX_STACKS_PER_USER; index += 1) {
            stacks.push(await createStack(db, 'github:ada', { title: 'Tools' }, index + 1));
        }
        expect(new Set(stacks.map(stack => stack.slug)).size).toBe(MAX_STACKS_PER_USER);
        await expect(createStack(db, 'github:ada', { title: 'One too many' })).rejects.toBeInstanceOf(StackLimitError);
        sqlite.close();
    });

    test('lists only public stacks with enabled tools in the sitemap', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        addTestUser(sqlite, 'github:grace');
        await setUsername(db, 'github:ada', 'ada', 10);
        await setUsername(db, 'github:grace', 'grace', 11);
        const publicStack = await createStack(db, 'github:ada', { title: 'Public' }, 20);
        const emptyStack = await createStack(db, 'github:ada', { title: 'Empty' }, 30);
        const privateStack = await createStack(db, 'github:ada', { title: 'Private' }, 40);
        const graceEmptyStack = await createStack(db, 'github:grace', { title: 'Public but empty' }, 45);

        await replaceItems(db, 'github:ada', publicStack.id, [
            { slug: 'cursor', purpose: 'Build', usageNotes: null, enabled: true, position: 0 },
        ], 50);
        await replaceItems(db, 'github:ada', emptyStack.id, [
            { slug: 'zed', purpose: 'Review', usageNotes: null, enabled: false, position: 0 },
        ], 60);
        await replaceItems(db, 'github:ada', privateStack.id, [
            { slug: 'claude-code', purpose: 'Plan', usageNotes: null, enabled: true, position: 0 },
        ], 70);
        await updateStack(db, 'github:ada', publicStack.id, { isPublic: true }, 80);
        await updateStack(db, 'github:ada', emptyStack.id, { isPublic: true }, 90);
        await updateStack(db, 'github:grace', graceEmptyStack.id, { isPublic: true }, 95);

        expect(await listPublicStacksByUser(db, 'github:ada')).toHaveLength(2);
        expect(await listPublicStackProfileUsernames(db)).toEqual(['ada', 'grace']);
        expect(await listPublicStacksForSitemap(db)).toEqual([
            { username: 'ada', slug: publicStack.slug, updatedAt: 80 },
        ]);
        sqlite.close();
    });

    test('cascades stacks and stack items when the owner is deleted', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        const stack = await createStack(db, 'github:ada', { title: 'My tools' }, 10);
        await replaceItems(db, 'github:ada', stack.id, [
            { slug: 'cursor', purpose: 'Build', usageNotes: null, enabled: true, position: 0 },
        ]);

        sqlite.query('DELETE FROM users WHERE id = ?').run('github:ada');

        expect(sqlite.query('SELECT COUNT(*) AS count FROM stacks').get()).toEqual({ count: 0 });
        expect(sqlite.query('SELECT COUNT(*) AS count FROM stack_items').get()).toEqual({ count: 0 });
        sqlite.close();
    });
});
