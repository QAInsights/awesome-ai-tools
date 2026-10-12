import { describe, expect, test } from 'bun:test';

import { historyWindow, linePaths, percentChange, seriesWindow, summarizeRange } from './advertise-dashboard.js';

const day = (date, visits, pageViews = visits * 2) => ({ date, visits, pageViews });

describe('seriesWindow', () => {
    test('zero-fills missing days inside the covered range', () => {
        const daily = [day('2026-10-01', 1), day('2026-10-03', 3)];
        expect(seriesWindow(daily, 3)).toEqual([
            day('2026-10-01', 1),
            { date: '2026-10-02', visits: 0, pageViews: 0 },
            day('2026-10-03', 3),
        ]);
    });

    test('does not invent days before the first data point', () => {
        expect(seriesWindow([day('2026-10-02', 5)], 7)).toEqual([day('2026-10-02', 5)]);
        expect(seriesWindow([], 7)).toEqual([]);
    });
});

describe('summarizeRange', () => {
    const daily = ['01', '02', '03', '04'].map((d, index) => day(`2026-10-${d}`, index + 1));

    test('totals the latest range and compares with the period before it', () => {
        const summary = summarizeRange(daily, 2, 'visits');
        expect(summary.total).toBe(7);
        expect(summary.average).toBe(3.5);
        expect(summary.previous).toBe(3);
        expect(summary.change).toBeCloseTo(133.33, 1);
        expect(summary.points.map(point => point.date)).toEqual(['2026-10-03', '2026-10-04']);
    });

    test('omits the change when the previous period is incomplete', () => {
        const summary = summarizeRange(daily, 3, 'pageViews');
        expect(summary.total).toBe(18);
        expect(summary.previous).toBeNull();
        expect(summary.change).toBeNull();
    });
});

describe('percentChange', () => {
    test('returns null without a positive baseline', () => {
        expect(percentChange(10, 0)).toBeNull();
        expect(percentChange(15, 10)).toBe(50);
    });
});

describe('linePaths', () => {
    test('scales values into the box with the max at the top', () => {
        const { line, area, coords } = linePaths([0, 10], 100, 50, { padding: 0 });
        expect(coords).toEqual([[0, 50], [100, 0]]);
        expect(line).toBe('M0 50 L100 0');
        expect(area).toBe('M0 50 L100 0 L100 50 L0 50 Z');
    });

    test('handles empty and flat series', () => {
        expect(linePaths([], 100, 50).line).toBe('');
        expect(linePaths([3, 3], 100, 50, { padding: 0 }).coords).toEqual([[0, 0], [100, 0]]);
        expect(linePaths([3, 3], 100, 50, { padding: 0, zeroBaseline: false }).coords).toEqual([[0, 25], [100, 25]]);
    });

    test('fits the y-axis to the data without a zero baseline', () => {
        expect(linePaths([24, 26], 100, 50, { padding: 0, zeroBaseline: false }).coords).toEqual([[0, 50], [100, 0]]);
    });
});

describe('historyWindow', () => {
    test('keeps snapshots within the range of the latest one', () => {
        const history = [
            { date: '2026-09-01', stars: 1, forks: 0 },
            { date: '2026-10-05', stars: 2, forks: 0 },
            { date: '2026-10-11', stars: 3, forks: 0 },
        ];
        expect(historyWindow(history, 7).map(point => point.date)).toEqual(['2026-10-05', '2026-10-11']);
        expect(historyWindow([], 7)).toEqual([]);
    });
});
