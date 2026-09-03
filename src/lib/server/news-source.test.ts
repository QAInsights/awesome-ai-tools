import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseNewsPost, renderNewsPostHtml, utcDateString } from './news-source';

const source = readFileSync(new URL('../../content/blog/today-in-ai-2026-09-02.mdx', import.meta.url), 'utf8');

describe('news source', () => {
    test('parses the published Today in AI post', () => {
        const post = parseNewsPost('today-in-ai-2026-09-02', source);
        expect(post).not.toBeNull();
        expect(post?.date).toBe('2026-09-02');
        expect(post?.title).toContain('Anthropic');
        expect(post?.intro).toHaveLength(2);
        expect(post?.items).toHaveLength(7);
        expect(post?.items[0]).toMatchObject({
            heading: 'Anthropic debuts Fable 5.1, Mythos 5.1',
            sourceLabel: 'AWS',
            sourceUrl: 'https://aws.amazon.com/blogs/machine-learning/introducing-claude-fable-5-1-on-aws/',
        });
    });

    test('returns null for draft posts', () => {
        expect(parseNewsPost('today-in-ai-2026-09-03', `---
title: "Draft"
description: "Not ready"
draft: true
---

Intro`)).toBeNull();
    });

    test('parses posts without sections or sources', () => {
        const post = parseNewsPost('today-in-ai-2026-09-04', `---
title: "Plain *title*"
description: "A **description**"
draft: false
---

First paragraph.

Second paragraph.`);
        expect(post).toMatchObject({
            title: 'Plain title',
            description: 'A description',
            intro: ['First paragraph.', 'Second paragraph.'],
            items: [],
        });

        const item = parseNewsPost('today-in-ai-2026-09-05', `---
title: "One item"
description: "Description"
draft: false
---

## A heading

**What happened:** A *release* happened.

**Why it matters:** It matters.
`)?.items[0];
        expect(item).toMatchObject({
            heading: 'A heading',
            whatHappened: 'A release happened.',
            whyItMatters: 'It matters.',
            sourceLabel: '',
            sourceUrl: '',
        });
    });

    test('formats UTC dates', () => {
        expect(utcDateString(Date.parse('2026-09-02T23:59:59.000Z'))).toBe('2026-09-02');
        expect(utcDateString(Date.parse('2026-09-03T00:00:00.000Z'))).toBe('2026-09-03');
    });

    test('escapes rendered headings and source labels', () => {
        const html = renderNewsPostHtml({
            id: 'today-in-ai-2026-09-02',
            date: '2026-09-02',
            title: 'Brief',
            description: 'Description',
            intro: [],
            items: [{
                heading: '<script>alert(1)</script>',
                whatHappened: 'A release happened.',
                whyItMatters: 'It matters.',
                sourceLabel: 'A & B',
                sourceUrl: 'https://example.com/source?a=1&b=2',
            }],
        });

        expect(html).toContain('<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>');
        expect(html).toContain('Source: A &amp; B');
        expect(html).toContain('href="https://example.com/source?a=1&amp;b=2"');
    });
});
