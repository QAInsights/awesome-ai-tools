import { describe, expect, test } from 'bun:test';

import { appendGitHubHistory, mergeSiteStats } from './generate-site-stats';
import type { SiteStats } from '../src/lib/site-stats';

const previous: SiteStats = {
    generatedAt: '2026-09-26T00:00:00.000Z',
    traffic: {
        last30: { pageViews: 100, visits: 50 },
        lifetime: { pageViews: 200, visits: 100, since: '2026-03-01T00:00:00Z' },
    },
    github: { stars: 10, forks: 2 },
};

describe('mergeSiteStats', () => {
    test('uses fresh values when both are present', () => {
        const fresh: SiteStats = {
            generatedAt: '2026-09-27T00:00:00.000Z',
            traffic: {
                last30: { pageViews: 110, visits: 55 },
                lifetime: { pageViews: 210, visits: 105, since: '2026-03-01T00:00:00Z' },
            },
            github: { stars: 11, forks: 3 },
        };

        expect(mergeSiteStats(previous, fresh)).toEqual(fresh);
    });

    test('keeps the previous value for fields that came back null', () => {
        const fresh: SiteStats = {
            generatedAt: '2026-09-27T00:00:00.000Z',
            traffic: null,
            github: { stars: 11, forks: 3 },
        };

        const merged = mergeSiteStats(previous, fresh);
        expect(merged.traffic).toEqual(previous.traffic);
        expect(merged.github).toEqual(fresh.github);
        expect(merged.generatedAt).toBe(fresh.generatedAt);
    });

    test('leaves a field null when there is no previous value to keep', () => {
        const fresh: SiteStats = {
            generatedAt: '2026-09-27T00:00:00.000Z',
            traffic: null,
            github: { stars: 11, forks: 3 },
        };

        const merged = mergeSiteStats(null, fresh);
        expect(merged.traffic).toBeNull();
        expect(merged.github).toEqual(fresh.github);
    });
});

describe('detail and history', () => {
    const detail = { coverage: { from: '2026-09-25', to: '2026-09-25' }, daily: [{ date: '2026-09-25', pageViews: 4, visits: 2 }], breakdowns: {} };

    test('keeps previous detail and history when the fresh fetch has none', () => {
        const history = [{ date: '2026-09-26', stars: 10, forks: 2 }];
        const merged = mergeSiteStats({ ...previous, detail, history }, { ...previous, generatedAt: '2026-09-27T00:00:00.000Z', detail: null });
        expect(merged.detail).toEqual(detail);
        expect(merged.history).toEqual(history);
    });

    test('preserves finer previous daily samples while merging detail coverage', () => {
        const previousDetail = {
            coverage: { from: '2026-09-01', to: '2026-09-25' },
            daily: [
                { date: '2026-09-24', pageViews: 400, visits: 300, sampleInterval: 100 },
                { date: '2026-09-25', pageViews: 300, visits: 200, sampleInterval: 100 },
            ],
            breakdowns: { '30': { pages: [], referrers: [], countries: [], devices: [] } },
        };
        const freshDetail = {
            coverage: { from: '2026-09-20', to: '2026-09-26' },
            daily: [
                { date: '2026-09-24', pageViews: 0, visits: 0, sampleInterval: 1_000 },
                { date: '2026-09-25', pageViews: 1_000, visits: 500, sampleInterval: 1_000 },
            ],
            breakdowns: { '30': { pages: [], referrers: [], countries: [], devices: [] } },
        };

        const merged = mergeSiteStats(
            { ...previous, detail: previousDetail },
            { ...previous, generatedAt: '2026-09-27T00:00:00.000Z', detail: freshDetail },
        );

        expect(merged.detail).toEqual({
            coverage: { from: '2026-09-24', to: '2026-09-26' },
            daily: previousDetail.daily,
            breakdowns: freshDetail.breakdowns,
        });
    });

    test('appends one GitHub snapshot per day', () => {
        const history = [{ date: '2026-09-26', stars: 10, forks: 2 }, { date: '2026-09-27', stars: 11, forks: 2 }];
        expect(appendGitHubHistory(history, '2026-09-27T09:00:00.000Z', { stars: 12, forks: 3 })).toEqual([
            { date: '2026-09-26', stars: 10, forks: 2 },
            { date: '2026-09-27', stars: 12, forks: 3 },
        ]);
        expect(appendGitHubHistory(history, '2026-09-28T01:00:00.000Z', null)).toEqual(history);
        expect(appendGitHubHistory(history, '2026-09-28T01:00:00.000Z', { stars: 13, forks: 3 }, 2).map(point => point.date))
            .toEqual(['2026-09-27', '2026-09-28']);
    });
});
