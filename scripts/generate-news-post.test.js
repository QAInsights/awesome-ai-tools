import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { extractNewsCitations } from '../src/lib/news-citations.js';
import {
    createFrontmatter,
    dedupeResults,
    escapeMdxText,
    generateNewsPost,
    inspectNewsOutput,
    isQuietDayOutput,
    parseFrontmatter,
    renderNewsPost,
    sanitizeNewsText,
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

test('treats the exact empty-items response as a quiet day', async () => {
    expect(isQuietDayOutput({ items: [] })).toBe(true);
    expect(isQuietDayOutput({ title: 'No news', items: [] })).toBe(false);
    const result = await generateNewsPost({
        dryRun: true,
        fixture: { results: [], output: { items: [] } },
        now: new Date('2026-08-21T12:00:00Z'),
    });
    expect(result).toMatchObject({ created: false, quiet: true });
});

test('retries one live LLM response when validation fails, then recovers', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-retry-`);
    const firstOutput = {
        ...validOutput,
        title: validOutput.title.padEnd(71, '!'),
    };
    const responses = [firstOutput, validOutput];
    const messages = [];
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async (request) => {
                messages.push(request);
                return responses.shift();
            },
        });
        expect(generated.created).toBe(true);
        expect(messages).toHaveLength(2);
        expect(messages[1].at(-1).content).toContain('SOFT: title exceeds soft target of 70 characters');
    } finally {
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('publishes with a warning after the single retry still has a soft violation', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-retry-`);
    const invalidOutput = {
        ...validOutput,
        title: validOutput.title.padEnd(71, '!'),
    };
    let calls = 0;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async () => {
                calls++;
                return invalidOutput;
            },
        });
        expect(generated.created).toBe(true);
        expect(calls).toBe(2);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('SOFT validation warnings');
        expect(warnings[0]).toContain('title exceeds soft target of 70 characters');
    } finally {
        console.warn = originalWarn;
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('retries an over-target description and publishes after a soft-only retry failure', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-description-`);
    const longDescriptionOutput = { ...validOutput, description: 'x'.repeat(161) };
    const responses = [longDescriptionOutput, longDescriptionOutput];
    const messages = [];
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async (request) => {
                messages.push(request);
                return responses.shift();
            },
        });
        expect(generated.created).toBe(true);
        expect(messages).toHaveLength(2);
        expect(messages[1].at(-1).content).toContain('SOFT: description exceeds soft target of 160 characters');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('description exceeds soft target of 160 characters');
    } finally {
        console.warn = originalWarn;
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('publishes an over-target headline after the single retry with a soft warning', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-headline-`);
    const longHeadlineOutput = {
        ...validOutput,
        items: validOutput.items.map((item, index) =>
            index === 0 ? { ...item, headline: item.headline.padEnd(72, '!') } : item
        ),
    };
    const responses = [longHeadlineOutput, longHeadlineOutput];
    const warnings = [];
    let calls = 0;
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async () => {
                calls++;
                return responses.shift();
            },
        });
        expect(generated.created).toBe(true);
        expect(calls).toBe(2);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('SOFT validation warnings');
        expect(warnings[0]).toContain('items[0].headline exceeds soft target of 70 characters');
    } finally {
        console.warn = originalWarn;
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('publishes a short description without enforcing the removed lower bound', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-short-description-`);
    const shortDescriptionOutput = { ...validOutput, description: 'x'.repeat(100) };
    let calls = 0;
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async () => {
                calls++;
                return shortDescriptionOutput;
            },
        });
        expect(generated.created).toBe(true);
        expect(calls).toBe(1);
        expect(inspectNewsOutput(shortDescriptionOutput, validOutput.items).softWarnings).toEqual([]);
    } finally {
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('aborts hard source URL failures after one retry', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-hard-source-`);
    const invalidOutput = {
        ...validOutput,
        items: validOutput.items.map((item, index) =>
            index === 0 ? { ...item, sourceUrl: 'https://hallucinated.example/story' } : item
        ),
    };
    let calls = 0;
    try {
        await expect(generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async () => {
                calls++;
                return invalidOutput;
            },
        })).rejects.toThrow(/HARD validation failed.*not present in Exa results/s);
        expect(calls).toBe(2);
    } finally {
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('escapes MDX expression and HTML delimiters', () => {
    expect(escapeMdxText('use {value} <Component> & compare')).toBe('use &#123;value&#125; &lt;Component&gt; &amp; compare');
    const post = renderNewsPost({
        ...validOutput,
        items: validOutput.items.map((item) => ({ ...item, headline: 'Safe {headline} <tag>' })),
    }, '2026-08-21');
    expect(post).toContain('This brief covers AI news from 2026-08-21 UTC.');
    expect(post).toContain('## Safe &#123;headline&#125; &lt;tag&gt;');
    expect(post).not.toContain('## Safe {headline}');
});

test('sanitizes dash punctuation without changing hyphens, URLs, or slugs', () => {
    expect(sanitizeNewsText('Models — for builders')).toBe('Models, for builders');
    expect(sanitizeNewsText('Model versions 1–3')).toBe('Model versions 1 to 3');
    expect(sanitizeNewsText('Use ai-tools, https://example.com/a-b, and today-in-ai')).toBe(
        'Use ai-tools, https://example.com/a-b, and today-in-ai'
    );
    expect(sanitizeNewsText('Models —, — ship')).toBe('Models, ship');
    expect(sanitizeNewsText('Models —. Ship')).toBe('Models. Ship');
});

test('soft-validates dashes and sanitizes them from rendered MDX', async () => {
    const outputDir = mkdtempSync(`${tmpdir()}/today-in-ai-dashes-`);
    const dashedOutput = {
        ...validOutput,
        title: 'Primary model release — now available',
        description: 'Builders can use model versions 1–3 in production workflows.',
        leadIn: 'Today brings practical updates — for teams shipping AI products.',
        items: validOutput.items.map((item, index) => index === 0 ? {
            ...item,
            headline: 'Acme ships model updates — faster',
            whatHappened: 'Acme released versions 1–3 — with expanded API access.',
            whyItMatters: 'Teams can test more capable models — without changing providers.',
            sourceName: 'Example News — Wire',
        } : item),
    };
    const responses = [dashedOutput, dashedOutput];
    const warnings = [];
    let calls = 0;
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        const generated = await generateNewsPost({
            now: new Date('2026-08-21T12:00:00Z'),
            outputDir,
            searchImpl: async () => validOutput.items.map((item) => result(item.sourceUrl, item.headline)),
            llmImpl: async () => {
                calls++;
                return responses.shift();
            },
        });
        expect(generated.created).toBe(true);
        expect(calls).toBe(2);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('SOFT validation warnings');
        expect(generated.post).not.toMatch(/[–—]/);
        expect(generated.post).toContain('versions 1 to 3');
        expect(generated.post).toContain('Acme ships model updates, faster');
        expect(generated.post).toContain('Example News, Wire');
        expect(generated.post).toContain('https://example.com/a');
    } finally {
        console.warn = originalWarn;
        rmSync(outputDir, { recursive: true, force: true });
    }
});

test('renders one ordered Sources entry per unique URL', () => {
    const output = {
        ...validOutput,
        items: [
            { ...validOutput.items[0], sourceName: 'First Publication' },
            { ...validOutput.items[1], sourceUrl: validOutput.items[0].sourceUrl, sourceName: 'Second Publication' },
            { ...validOutput.items[2], sourceName: 'Third Publication' },
        ],
    };
    const post = renderNewsPost(output, '2026-08-21');
    const sourcesSection = post.split('\n## Sources\n')[1];
    expect(sourcesSection).toContain('- [First Publication](<https://example.com/a>)');
    expect(sourcesSection).not.toContain('Second Publication');
    expect(sourcesSection).toContain('- [Third Publication](<https://example.com/c>)');
    expect(sourcesSection.match(/https:\/\/example\.com\/[abc]/g)).toEqual([
        'https://example.com/a',
        'https://example.com/c',
    ]);
});

test('dedupes NewsArticle citations from repeated per-item source links', () => {
    const output = {
        ...validOutput,
        items: [
            validOutput.items[0],
            { ...validOutput.items[1], sourceUrl: validOutput.items[0].sourceUrl },
            validOutput.items[2],
        ],
    };
    const post = renderNewsPost(output, '2026-08-21');
    expect(extractNewsCitations(post)).toEqual([
        'https://example.com/a',
        'https://example.com/c',
    ]);
});

test('generates and parses the dated slug/frontmatter', () => {
    expect(slugForDate('2026-08-21')).toBe('today-in-ai-2026-08-21');
    const frontmatter = createFrontmatter(validOutput, '2026-08-21');
    expect(parseFrontmatter(`${frontmatter}\n\nBody\n`).tags).toContain('news');
});
