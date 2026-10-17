import { describe, expect, test } from 'bun:test';
import { addTestUser, createTestDatabase } from './test-d1-adapter';
import { createStack, replaceItems, updateStack } from './stacks-repository';
import { setUsername } from './username-repository';
import { buildForkTitle, forkPublicStack } from './stack-fork';

describe('stack-fork', () => {
    test('buildForkTitle appends (Fork) and respects max length', () => {
        expect(buildForkTitle('Daily Drivers')).toBe('Daily Drivers (Fork)');
        expect(buildForkTitle('Daily Drivers (Fork)')).toBe('Daily Drivers (Fork)');
        const longTitle = 'A'.repeat(80);
        const forkedTitle = buildForkTitle(longTitle);
        expect(forkedTitle.length).toBeLessThanOrEqual(80);
        expect(forkedTitle.endsWith(' (Fork)')).toBe(true);
    });

    test('clones public stack and enabled items into viewer account as private draft', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        addTestUser(sqlite, 'github:grace');
        await setUsername(db, 'github:ada', 'ada', 10);

        const source = await createStack(db, 'github:ada', {
            title: 'Terminal Workflow',
            description: 'Fast CLI setup',
        }, 20);
        await replaceItems(db, 'github:ada', source.id, [
            { slug: 'claude-code', purpose: 'Agent', usageNotes: 'Main loop', enabled: true, position: 0 },
            { slug: 'aider', purpose: 'Git commits', usageNotes: null, enabled: false, position: 1 },
        ], 30);
        await updateStack(db, 'github:ada', source.id, { isPublic: true }, 40);

        const result = await forkPublicStack(db, 'github:grace', 'ada', source.slug, 50);
        expect(result.status).toBe('forked');
        if (result.status === 'forked') {
            expect(result.stack.title).toBe('Terminal Workflow (Fork)');
            expect(result.stack.description).toBe('Fast CLI setup');
            expect(result.stack.isPublic).toBe(false);
            expect(result.stack.items).toEqual([
                { slug: 'claude-code', position: 0, purpose: 'Agent', usageNotes: 'Main loop', enabled: true },
            ]);
        }

        const missing = await forkPublicStack(db, 'github:grace', 'ada', 'non-existent', 60);
        expect(missing).toEqual({ status: 'not_found' });
        sqlite.close();
    });
});
