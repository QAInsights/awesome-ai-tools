import { describe, expect, test } from 'bun:test';
import {
    createFrontmatter,
    dedupeResults,
    escapeMdxText,
    parseFrontmatter,
    renderNewsPost,
    slugForDate,
    validateNewsOutput,
} from './generate-news-post.js';

const result = (url, title, host = 'example.com') => ({
    url: url || `https://${host}/story`,
    title,
    text: 'A substantial report about an AI developer tool.',
});

const validOutput = {
    title: "Acme puts faster coding agents in developers' hands",
    description: "Acme ships a faster coding model, Northstar funds its developer-tools push, and Forge adds automated test repair for coding agents today.",
    leadIn: 'Three fresh moves push AI coding agents closer to the daily developer workflow.',
    items: [
        { headline: 'Acme ships a faster coding model for agents', whatHappened: 'Acme announced a coding model that runs repository agents faster. The release is available through its developer API today.', whyItMatters: 'Developers get another model option for agent workflows where execution speed affects iteration time.', sourceUrl: 'https://example.com/a', sourceName: 'Example News' },
        { headline: 'Northstar raises $40 million for AI developer tools', whatHappened: 'Northstar announced a $40 million funding round to expand its AI developer-tools team and product.', whyItMatters: 'More capital gives the team room to ship and support tools aimed at software builders.', sourceUrl: 'https://example.com/b', sourceName: 'Example News' },
        { headline: 'Forge adds test repair to its coding agent', whatHappened: 'Forge released an update that lets its coding agent inspect failing tests and propose repairs in the same workspace.', whyItMatters: 'Agents that can respond to failing tests may shorten the loop between a code change and a fix.', sourceUrl: 'https://example.com/c', sourceName: 'Example News' },
    ],
    tags: ['agents', 'coding', 'funding', 'developer-tools'],
};

test('dedupes exact URLs and near-identical stories on the same host', () => {
    const results = [
        result('https://example.com/one', 'Acme launches a coding agent'),
        result('https://example.com/one', 'Duplicate URL'),
        result('https://example.com/two', 'Acme launches a coding agent for developers'),
        result('https://other.example/two', 'Acme launches a coding agent'),
    ];
    expect(dedupeResults(results).map((item) => item.url)).toEqual([
        'https://example.com/one',
        'https://other.example/two',
    ]);
});

test('rejects hallucinated source URLs and thin results', () => {
    expect(() => validateNewsOutput({ ...validOutput, items: validOutput.items.slice(0, 2) }, [])).toThrow(/between 3 and 7/);
    expect(() => validateNewsOutput(validOutput, validOutput.items.map((item) => result(item.sourceUrl, item.headline)))).not.toThrow();
    expect(() => validateNewsOutput(validOutput, [result('https://example.com/not-used', 'Other story')])).toThrow(/not present in Exa results/);
});

test('escapes MDX expression and HTML delimiters', () => {
    expect(escapeMdxText('use {value} <Component> & compare')).toBe('use &#123;value&#125; &lt;Component&gt; &amp; compare');
    const post = renderNewsPost({
        ...validOutput,
        items: validOutput.items.map((item) => ({ ...item, headline: 'Safe {headline} <tag>' })),
    }, '2026-08-21');
    expect(post).toContain('## Safe &#123;headline&#125; &lt;tag&gt;');
    expect(post).not.toContain('## Safe {headline}');
});

test('generates and parses the dated slug/frontmatter', () => {
    expect(slugForDate('2026-08-21')).toBe('today-in-ai-2026-08-21');
    const frontmatter = createFrontmatter(validOutput, '2026-08-21');
    expect(parseFrontmatter(`${frontmatter}\n\nBody\n`).tags).toContain('news');
});
