import { expect, test } from 'bun:test';
import { getBriefNavigation } from './news-navigation';

const entry = (id: string, date: string, tags = ['news'], draft = false) => ({ id, data: { pubDate: new Date(date), tags, draft } });
const oldest = entry('first', '2026-11-01');
const middle = entry('middle', '2026-11-03');
const newest = entry('latest', '2026-11-07');
const entries = [newest, entry('draft', '2026-11-08', ['news'], true), oldest, entry('blog', '2026-11-04', ['tools']), middle];

test('orders published briefs by date and does not mutate the collection', () => {
    expect(getBriefNavigation(entries, 'middle')).toEqual({ previous: oldest, next: newest });
    expect(entries[0]).toBe(newest);
});

test('newest brief has only a previous link; oldest has only a next link', () => {
    expect(getBriefNavigation(entries, 'latest')).toEqual({ previous: middle, next: undefined });
    expect(getBriefNavigation(entries, 'first')).toEqual({ previous: undefined, next: middle });
});

test('handles a single brief, empty collections and unknown or non-news ids', () => {
    expect(getBriefNavigation([oldest], 'first')).toEqual({ previous: undefined, next: undefined });
    expect(getBriefNavigation([], 'first')).toEqual({});
    expect(getBriefNavigation(entries, 'missing')).toEqual({});
    expect(getBriefNavigation(entries, 'blog')).toEqual({});
});
