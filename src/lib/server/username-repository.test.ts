import { describe, expect, test } from 'bun:test';
import { addTestUser, createTestDatabase } from './test-d1-adapter';
import {
    findUserByUsername,
    getUsername,
    setUsername,
    UsernameTakenError,
} from './username-repository';

describe('username repository', () => {
    test('sets a username and finds the current profile', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada', 'Ada Lovelace');

        expect(await getUsername(db, 'github:ada')).toBeNull();
        await setUsername(db, 'github:ada', 'ada-lovelace', 10);

        expect(await getUsername(db, 'github:ada')).toBe('ada-lovelace');
        expect(await findUserByUsername(db, 'ada-lovelace')).toEqual({
            user: {
                id: 'github:ada',
                username: 'ada-lovelace',
                displayName: 'Ada Lovelace',
                githubUsername: null,
            },
        });
        sqlite.close();
    });

    test('redirects old usernames and prevents another user claiming them', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        addTestUser(sqlite, 'github:grace');

        await setUsername(db, 'github:ada', 'ada', 10);
        await setUsername(db, 'github:ada', 'ada-lovelace', 20);
        expect(await findUserByUsername(db, 'ada')).toMatchObject({
            user: { id: 'github:ada', username: 'ada-lovelace' },
            redirectTo: 'ada-lovelace',
        });
        await expect(setUsername(db, 'github:grace', 'ada', 30)).rejects.toBeInstanceOf(UsernameTakenError);
        sqlite.close();
    });

    test('allows the owner to reclaim a retired username and redirects the newer name', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');

        await setUsername(db, 'github:ada', 'ada', 10);
        await setUsername(db, 'github:ada', 'ada-lovelace', 20);
        await setUsername(db, 'github:ada', 'ada', 30);

        expect(await findUserByUsername(db, 'ada')).toMatchObject({
            user: { id: 'github:ada', username: 'ada' },
        });
        expect(await findUserByUsername(db, 'ada-lovelace')).toMatchObject({
            user: { id: 'github:ada', username: 'ada' },
            redirectTo: 'ada',
        });
        sqlite.close();
    });

    test('cascades username history when the account is deleted', async () => {
        const { db, sqlite } = createTestDatabase();
        addTestUser(sqlite, 'github:ada');
        await setUsername(db, 'github:ada', 'ada', 10);
        await setUsername(db, 'github:ada', 'ada-lovelace', 20);

        sqlite.query('DELETE FROM users WHERE id = ?').run('github:ada');

        expect(await findUserByUsername(db, 'ada')).toBeNull();
        sqlite.close();
    });
});
