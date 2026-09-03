import { describe, expect, test } from 'bun:test';
import type { Tool } from './tools';
import { buildToolsFeed } from './tools-feed';

function tool(overrides: Partial<Tool>): Tool {
    return {
        slug: 'default',
        name: 'Default',
        company: 'Default Co',
        category: 'AI Tools',
        categoryClean: 'AI Tools',
        categoryShort: 'AI Tools',
        notes: 'Directory notes',
        url: 'https://example.com/default',
        enriched: null,
        ...overrides,
    };
}

describe('tools feed', () => {
    test('sorts updated tools first, then names, with undated tools last', () => {
        const feed = buildToolsFeed([
            tool({
                slug: 'missing',
                name: 'Missing',
                url: '',
                enriched: { lastUpdated: undefined },
            }),
            tool({
                slug: 'zulu',
                name: 'Zulu',
                enriched: { lastUpdated: '2026-09-02', tags: ['agents'] },
            }),
            tool({
                slug: 'alpha',
                name: 'Alpha',
                enriched: { lastUpdated: '2026-09-02' },
            }),
        ], 'https://ai.dosa.dev');

        expect(feed.items.map(item => item.title)).toEqual(['Alpha', 'Zulu', 'Missing']);
        expect(feed.home_page_url).toBe('https://ai.dosa.dev/');
        expect(feed.feed_url).toBe('https://ai.dosa.dev/tools/feed.json');
    });

    test('omits missing optional fields and deduplicates tags', () => {
        const feed = buildToolsFeed([
            tool({
                slug: 'cursor',
                name: 'Cursor',
                categoryClean: 'AI IDEs',
                enriched: {
                    description: '',
                    recentUpdates: 'A recent update',
                    tags: ['AI IDEs', 'agents', 'agents'],
                    lastUpdated: '2026-09-01',
                },
            }),
            tool({
                slug: 'plain',
                name: 'Plain',
                url: '',
                notes: 'Plain notes',
                enriched: null,
            }),
        ], 'https://ai.dosa.dev/');

        expect(feed.items[0]).toMatchObject({
            id: 'https://ai.dosa.dev/tools/cursor',
            url: 'https://ai.dosa.dev/tools/cursor',
            summary: '',
            content_text: 'A recent update',
            date_modified: '2026-09-01T00:00:00Z',
            tags: ['AI IDEs', 'agents'],
        });
        expect(feed.items[1]).not.toHaveProperty('external_url');
        expect(feed.items[1]).not.toHaveProperty('date_modified');
    });
});
