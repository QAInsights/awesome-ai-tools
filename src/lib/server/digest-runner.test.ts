import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requestedDates: string[] = [];
const newsCalls: Array<Record<string, unknown>> = [];
const digestCalls: Array<Record<string, unknown>> = [];
let currentPost: Record<string, unknown> | null = null;
let newsError = false;
let digestError = false;

const newsSummary = {
    candidates: 1,
    sent: 1,
    skippedAlreadySent: 0,
    failed: 0,
    dryRun: false,
    errors: [],
};
const digestSummary = {
    candidates: 2,
    sent: 1,
    skippedNoChanges: 1,
    skippedTooSoon: 0,
    failed: 0,
    dryRun: false,
    errors: [],
};

let useRunnerMocks = true;
mock.module('cloudflare:workers', () => ({ env: { DB: {} } }));
const actualDigest = await import(`./digest.ts?actual=${Date.now()}`);
const actualNews = await import(`./news.ts?actual=${Date.now()}`);
const actualEmail = await import(`./email.ts?actual=${Date.now()}`);
mock.module('./news-files', () => ({
    getNewsPostForDate: (date: string) => {
        requestedDates.push(date);
        return currentPost;
    },
}));
mock.module('./news', () => ({
    runNewsSend: async (input: Record<string, unknown>) => {
        if (!useRunnerMocks) return actualNews.runNewsSend(input as never);
        newsCalls.push(input);
        if (newsError) throw new Error('boom');
        return newsSummary;
    },
}));
mock.module('./digest', () => ({
    runDigest: async (input: Record<string, unknown>) => {
        if (!useRunnerMocks) return actualDigest.runDigest(input as never);
        digestCalls.push(input);
        if (digestError) throw new Error('boom');
        return digestSummary;
    },
}));
mock.module('./email', () => ({
    sendEmail: async (input: Record<string, unknown>) => {
        if (!useRunnerMocks) return actualEmail.sendEmail(input as never);
        return undefined;
    },
}));

const {
    runScheduledDigest,
    runScheduledNews,
} = await import(`./digest-runner.ts?test=${Date.now()}`);

afterAll(() => {
    useRunnerMocks = false;
    mock.restore();
});

beforeEach(() => {
    requestedDates.splice(0);
    newsCalls.splice(0);
    digestCalls.splice(0);
    currentPost = null;
    newsError = false;
    digestError = false;
});

describe('scheduled news runner', () => {
    test('uses the UTC date at both sides of midnight', async () => {
        await runScheduledNews('manual', Date.parse('2026-09-04T23:59:59Z'));
        await runScheduledNews('manual', Date.parse('2026-09-05T00:00:01Z'));

        expect(requestedDates).toEqual(['2026-09-04', '2026-09-05']);
    });

    test('returns the no-post summary without sending', async () => {
        const result = await runScheduledNews('manual', Date.parse('2026-09-04T12:00:00Z'));

        expect(result).toEqual({
            candidates: 0,
            sent: 0,
            skippedAlreadySent: 0,
            failed: 0,
            dryRun: true,
            errors: [],
            skippedNoPost: true,
        });
        expect(newsCalls).toHaveLength(0);
    });

    test('sends a found post and marks it as handled', async () => {
        currentPost = { id: 'today-in-ai-2026-09-04' };

        const result = await runScheduledNews('manual', Date.parse('2026-09-04T12:00:00Z'));

        expect(newsCalls[0]?.post).toBe(currentPost);
        expect(result).toEqual({ ...newsSummary, skippedNoPost: false });
    });

    test('wraps news send errors', async () => {
        currentPost = { id: 'today-in-ai-2026-09-04' };
        newsError = true;

        const result = await runScheduledNews('manual', Date.parse('2026-09-04T12:00:00Z'));

        expect(result).toEqual({
            candidates: 0,
            sent: 0,
            skippedAlreadySent: 0,
            failed: 1,
            dryRun: true,
            errors: ['manual: boom'],
            skippedNoPost: false,
        });
    });
});

describe('scheduled digest runner', () => {
    test('passes the digest result through', async () => {
        const result = await runScheduledDigest('0 6 * * *');

        expect(result).toEqual(digestSummary);
        expect(digestCalls).toHaveLength(1);
    });

    test('wraps digest errors with the trigger', async () => {
        digestError = true;

        const result = await runScheduledDigest('0 6 * * *');

        expect(result).toEqual({
            candidates: 0,
            sent: 0,
            skippedNoChanges: 0,
            skippedTooSoon: 0,
            failed: 1,
            dryRun: true,
            errors: ['0 6 * * *: boom'],
        });
    });
});
