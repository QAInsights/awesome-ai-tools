import { describe, expect, mock, test } from 'bun:test';

const tools = [
    {
        slug: 'a',
        name: 'Zulu A',
        company: 'A Co',
        category: 'AI',
        categoryClean: 'AI',
        categoryShort: 'AI',
        notes: 'A notes',
        url: 'https://a.example',
        enriched: {
            slug: 'a',
            description: 'A description',
            recentUpdates: 'A update',
            tags: ['AI', 'builders'],
            lastUpdated: '2026-09-01',
        },
    },
    {
        slug: 'b',
        name: 'Alpha B',
        company: 'B Co',
        category: 'AI',
        categoryClean: 'AI',
        categoryShort: 'AI',
        notes: 'B notes',
        url: 'https://b.example',
        enriched: {
            slug: 'b',
            description: 'B description',
            recentUpdates: 'B update',
            tags: ['builders', 'AI'],
            lastUpdated: '2026-09-03',
        },
    },
    {
        slug: 'c',
        name: 'Zulu C',
        company: 'C Co',
        category: 'Editors',
        categoryClean: 'Editors',
        categoryShort: 'Editors',
        notes: 'C notes',
        url: 'https://c.example',
        enriched: null,
    },
    {
        slug: 'd',
        name: 'Alpha D',
        company: 'D Co',
        category: 'Editors',
        categoryClean: 'Editors',
        categoryShort: 'Editors',
        notes: 'D notes',
        url: 'https://d.example',
        enriched: {
            slug: 'd',
            description: 'D description',
            tags: ['Editors'],
            lastUpdated: 'not-a-date',
        },
    },
];

mock.module('../../../src/lib/tools', () => ({
    getAllTools: () => tools,
}));

const { GET } = await import(`../../../src/pages/tools/rss.xml.ts?test=${Date.now()}`);

mock.restore();

describe('GET /tools/rss.xml', () => {
    test('sorts tools and emits valid RSS metadata', async () => {
        const response = await GET({ site: 'https://ai.dosa.dev' } as never);
        const xml = await response.text();

        expect(response.status).toBe(200);
        expect(xml.indexOf('<title>Alpha B</title>')).toBeLessThan(xml.indexOf('<title>Zulu A</title>'));
        expect(xml.indexOf('<title>Zulu A</title>')).toBeLessThan(xml.indexOf('<title>Alpha D</title>'));
        expect(xml.indexOf('<title>Alpha D</title>')).toBeLessThan(xml.indexOf('<title>Zulu C</title>'));
        expect(xml.match(/<pubDate>/g)).toHaveLength(2);
        expect(xml).toContain('https://ai.dosa.dev/tools/b');
        expect(xml).toContain('https://ai.dosa.dev/tools/a');
        expect(xml).toContain('<category>AI</category>');
        expect(xml).toContain('<category>builders</category>');
        expect(xml.match(/<category>AI<\/category>/g)).toHaveLength(2);
        expect(xml).not.toContain('<category>AI</category><category>AI</category>');
    });
});
