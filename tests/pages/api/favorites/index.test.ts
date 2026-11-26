import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { MAX_GUEST_FAVORITES } from '../../../../src/lib/favorite-slugs.js';

const db = new Database(':memory:');
const userA = 'github:a';
const userB = 'github:b';
let sessionUser: string | null;
let writeFails: boolean;
let eventCounts: number[];

mock.module('cloudflare:workers', () => ({
    env: {
        DB: {
            prepare: (sql: string) => ({
                bind: (...values: [string, number?, string?]) => ({
                    all: async () => ({ results: db.query(sql).all(...values) }),
                    run: async () => {
                        if (writeFails) throw new Error('Write failed');
                        return { meta: db.query(sql).run(...values) };
                    },
                }),
            }),
        },
        ANALYTICS: {
            writeDataPoint: ({ indexes, doubles }: { indexes: string[]; doubles: number[] }) => {
                if (indexes[0] === 'guest_favorites_imported') eventCounts.push(doubles[0]!);
            },
        },
    },
    waitUntil() {},
}));
mock.module('../../../../src/lib/server/route-auth', () => ({
    getCookieSessionUser: async () => sessionUser ? { id: sessionUser, provider: 'github' } : null,
}));

const { POST } = await import('../../../../src/pages/api/favorites/index');
mock.restore();

db.exec('CREATE TABLE favorites (user_id TEXT, tool_slug TEXT, created_at INTEGER, PRIMARY KEY (user_id, tool_slug))');
beforeEach(() => {
    db.exec('DELETE FROM favorites');
    sessionUser = userA;
    writeFails = false;
    eventCounts = [];
});
afterAll(() => db.close());

function post(body: unknown, origin = 'https://ai.dosa.dev') {
    return POST({
        request: new Request('https://ai.dosa.dev/api/favorites', {
            method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body),
        }),
        cookies: {},
    } as never);
}

describe('POST /api/favorites', () => {
    test('requires same-origin and a matching account session', async () => {
        const body = { expectedUserId: userA, slugs: ['cursor'] };
        expect((await post(body, 'https://example.com')).status).toBe(403);
        sessionUser = null;
        expect((await post(body)).status).toBe(401);
        sessionUser = userB;
        expect((await post(body)).status).toBe(409);
        expect(db.query('SELECT * FROM favorites').all()).toEqual([]);
    });

    test('rejects invalid and oversized lists without writing', async () => {
        for (const slugs of [null, [], ['../cursor'], [null], Array(MAX_GUEST_FAVORITES + 1).fill('cursor')]) {
            expect((await post({ expectedUserId: userA, slugs })).status).toBe(400);
        }
        expect(db.query('SELECT * FROM favorites').all()).toEqual([]);
    });

    test('returns a private, deduplicated union and preserves existing favorites', async () => {
        db.exec(`INSERT INTO favorites VALUES ('${userA}', 'cursor', 10), ('${userA}', 'windsurf', 5), ('${userB}', 'zed', 8)`);
        const body = { expectedUserId: userA, slugs: ['cursor', 'claude-code', 'claude-code'] };
        const response = await post(body);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const result = await response.json();
        expect(result.favorites).toEqual([
            { slug: 'claude-code', createdAt: expect.any(Number) },
            { slug: 'cursor', createdAt: 10 },
            { slug: 'windsurf', createdAt: 5 },
        ]);
        expect(await (await post(body)).json()).toEqual(result);
        expect(eventCounts).toEqual([1]);
    });

    test('reports a failed write so the browser can retry', async () => {
        writeFails = true;
        expect((await post({ expectedUserId: userA, slugs: ['cursor'] })).status).toBe(503);
        expect(eventCounts).toEqual([]);
    });
});
