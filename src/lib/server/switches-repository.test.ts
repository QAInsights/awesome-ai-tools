import { expect, test } from 'bun:test';
import { createTestDatabase } from './test-d1-adapter';
import { getSwitches, setSwitch } from './switches-repository';

test('writes and reads the authoritative counts and pick in exactly one batch, including undo', async () => {
    const { db, sqlite } = createTestDatabase();
    const batch = db.batch.bind(db);
    const sizes: number[] = [];
    db.batch = (statements => { sizes.push(statements.length); return batch(statements); }) as typeof db.batch;
    try {
        expect(await setSwitch(db, 'cursor', 'g:1', 'zed')).toEqual({ total: 1, counts: [{ tool: 'zed', votes: 1 }], mine: 'zed' });
        expect(await setSwitch(db, 'cursor', 'g:1', 'cline')).toEqual({ total: 1, counts: [{ tool: 'cline', votes: 1 }], mine: 'cline' });
        expect(await setSwitch(db, 'cursor', 'g:1', null)).toEqual({ total: 0, counts: [], mine: null });
        expect(sizes).toEqual([3, 3, 3]);
    } finally { sqlite.close(); }
});

test('rolls back a batch write if a following read fails', async () => {
    const { db, sqlite } = createTestDatabase();
    const prepare = db.prepare.bind(db);
    db.prepare = sql => prepare(sql.includes('GROUP BY') ? 'SELECT * FROM missing_table' : sql);
    try {
        await expect(setSwitch(db, 'cursor', 'g:1', 'zed')).rejects.toThrow();
        expect(sqlite.query('SELECT COUNT(*) AS n FROM switch_votes').get()).toEqual({ n: 0 });
    } finally { sqlite.close(); }
});

test('upserts one pick per source and voter, preserving creation time on changes', async () => {
    const { db, sqlite } = createTestDatabase();
    try {
        expect(await getSwitches(db, 'cursor', null)).toEqual({ total: 0, counts: [], mine: null });
        await setSwitch(db, 'cursor', 'g:1', 'cline', 100);
        await setSwitch(db, 'cursor', 'g:1', 'cline', 200);
        await setSwitch(db, 'cursor', 'g:1', 'zed', 300);
        expect(await getSwitches(db, 'cursor', 'g:1')).toEqual({ total: 1, counts: [{ tool: 'zed', votes: 1 }], mine: 'zed' });
        expect(sqlite.query('SELECT created_at, updated_at FROM switch_votes').get()).toEqual({ created_at: 100, updated_at: 300 });
    } finally { sqlite.close(); }
});

test('counts independent voters and sources, sorts by votes then slug, and retracts idempotently', async () => {
    const { db, sqlite } = createTestDatabase();
    try {
        await setSwitch(db, 'cursor', 'u:1', 'zed');
        await setSwitch(db, 'cursor', 'g:2', 'cline');
        await setSwitch(db, 'cursor', 'g:3', 'cline');
        await setSwitch(db, 'zed', 'u:1', 'cursor');
        expect(await getSwitches(db, 'cursor', 'u:1')).toEqual({ total: 3, counts: [{ tool: 'cline', votes: 2 }, { tool: 'zed', votes: 1 }], mine: 'zed' });
        await setSwitch(db, 'cursor', 'g:3', null);
        expect((await getSwitches(db, 'cursor', 'g:3')).counts).toEqual([{ tool: 'cline', votes: 1 }, { tool: 'zed', votes: 1 }]);
        await setSwitch(db, 'cursor', 'g:3', null);
        expect((await getSwitches(db, 'cursor', 'g:3')).mine).toBeNull();
        expect((await getSwitches(db, 'zed', 'u:1')).total).toBe(1);
    } finally { sqlite.close(); }
});
