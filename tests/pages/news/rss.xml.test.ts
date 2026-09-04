import { afterAll, describe, expect, mock, test } from 'bun:test';

const datedPosts = Array.from({ length: 32 }, (_, index) => ({
    id: `daily-${String(index).padStart(2, '0')}`,
    data: {
        title: `Daily ${index}`,
        description: `Description ${index}`,
        pubDate: new Date(Date.UTC(2026, 7, index + 1)),
        tags: ['news', 'today-in-ai', 'models'],
        draft: false,
    },
    body: `Intro ${index}\n\n## Story ${index}\n\n**What happened:** Event ${index}\n\n[Source: Example](https://example.com/${index})`,
}));

const fixtures = [
    {
        id: 'draft-post',
        data: {
            title: 'Draft',
            description: 'Draft',
            pubDate: new Date('2026-09-20T00:00:00Z'),
            tags: ['news'],
            draft: true,
        },
        body: 'Draft body',
    },
    {
        id: 'regular-post',
        data: {
            title: 'Regular',
            description: 'Regular',
            pubDate: new Date('2026-09-21T00:00:00Z'),
            tags: ['engineering'],
            draft: false,
        },
        body: 'Regular body',
    },
    ...datedPosts,
];

mock.module('astro:content', () => ({
    getCollection: async (_name: string, filter: (entry: typeof fixtures[number]) => boolean) =>
        fixtures.filter(filter),
}));

const { GET } = await import(`../../../src/pages/news/rss.xml.ts?test=${Date.now()}`);

afterAll(() => mock.restore());

describe('GET /news/rss.xml', () => {
    test('filters, limits, sorts, and categorizes Today in AI posts', async () => {
        const response = await GET({ site: 'https://ai.dosa.dev' } as never);
        const xml = await response.text();

        expect(response.status).toBe(200);
        expect(xml.match(/<item>/g)).toHaveLength(30);
        expect(xml).not.toContain('<title>Draft</title>');
        expect(xml).not.toContain('<title>Regular</title>');
        expect(xml.indexOf('<title>Daily 31</title>')).toBeLessThan(xml.indexOf('<title>Daily 30</title>'));
        expect(xml).toContain('<category>models</category>');
        expect(xml).not.toContain('<category>news</category>');
        expect(xml).not.toContain('<category>today-in-ai</category>');
        expect(xml).toContain('https://ai.dosa.dev/blog/daily-31/');
    });
});
