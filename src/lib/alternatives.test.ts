import { describe, expect, test } from 'bun:test';
import { getAllTools, getAlternativesFor, type Tool } from './tools';
import { getAlternativesPageTools, getTopComparedTools, hasAlternativesPage } from './compare';
import { blogPostsLinkingTo, buildAlternativesSeo, openSourceLabel, rankAlternatives, switchReason, whySwitch } from './alternatives';

function makeTool(slug: string, enriched: Partial<NonNullable<Tool['enriched']>> | null = {}, notes = 'A coding tool.'): Tool {
    return {
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        company: 'Acme',
        category: 'Terminal & CLI Agents',
        categoryClean: 'Terminal & CLI Agents',
        categoryShort: 'CLI Agents',
        notes,
        url: 'https://example.com',
        enriched: enriched === null ? null : { slug, ...enriched },
    };
}

describe('alternatives pages', () => {
    test('every tool with a same-category alternative gets a page, most-compared first', () => {
        const pages = getAlternativesPageTools();
        const expected = getAllTools().filter(t => getAlternativesFor(t).length > 0);
        expect(pages.length).toBe(expected.length);
        expect(new Set(pages.map(t => t.slug)).size).toBe(pages.length);
        const top = getTopComparedTools();
        expect(pages.slice(0, top.length).map(t => t.slug)).toEqual(top.map(t => t.slug));
        for (const t of expected) expect(hasAlternativesPage(t.slug)).toBe(true);
        expect(hasAlternativesPage('not-a-tool')).toBe(false);
    });

    test('ranking puts tools with a compare page first and keeps order otherwise', () => {
        const alts = ['a', 'b', 'c', 'd'].map(s => makeTool(s));
        expect(rankAlternatives(alts, new Set(['c', 'a'])).map(t => t.slug)).toEqual(['a', 'c', 'b', 'd']);
    });

    test('why-switch copy comes only from bestFor / notIdealFor', () => {
        expect(whySwitch(makeTool('a', { bestFor: 'Teams that live in the terminal.' }))).toBe('Teams that live in the terminal.');
        expect(whySwitch(makeTool('a', null))).toBe('');
        expect(switchReason(makeTool('widget', { name: 'Widget', notIdealFor: 'Users who want a GUI.' }))).toBe('Widget is not ideal for users who want a GUI.');
        expect(switchReason(makeTool('widget', {}))).toBe('');
    });

    test('open source from pricing, tags, or seed notes', () => {
        expect(openSourceLabel(makeTool('a', { pricing: 'open-source' }))).toBe('Yes');
        expect(openSourceLabel(makeTool('a', { pricing: 'free', tags: ['Open Source'] }))).toBe('Yes');
        expect(openSourceLabel(makeTool('a', null, 'Open-source (MIT) terminal agent.'))).toBe('Yes');
        expect(openSourceLabel(makeTool('a', { pricing: 'paid' }))).toBe('No');
    });

    test('SEO targets "best X alternative" and "X alternatives" within length limits', () => {
        const alts = ['cursor', 'cline', 'aider', 'zed', 'void'].map(s => makeTool(s));
        const { title, description } = buildAlternativesSeo(makeTool('opencode', { name: 'OpenCode' }), alts, 2026);
        expect(title).toBe('Best OpenCode Alternatives (2026): 5 Tools Compared');
        expect(description).toStartWith('Looking for the best OpenCode alternative? Compare Cursor, Cline, Aider and 2 more');
        expect(description.length).toBeLessThanOrEqual(155);

        const long = buildAlternativesSeo(makeTool('x', { name: 'A Very Long Product Name For Testing Titles' }), alts, 2026);
        expect(long.title.length).toBeLessThanOrEqual(65);
        expect(long.title).toContain('Alternatives');
    });

    test('real alternatives pages stay within SEO limits', () => {
        for (const tool of getAlternativesPageTools()) {
            const { title, description } = buildAlternativesSeo(tool, getAlternativesFor(tool), 2026);
            expect(title).toContain('Alternatives');
            expect(description.length).toBeLessThanOrEqual(155);
        }
    });

    test('blog cross-links match exact slugs, evergreen posts first', () => {
        const post = (id: string, body: string, tags: string[] = [], day = 1) => ({ id, body, data: { title: id, pubDate: new Date(Date.UTC(2026, 0, day)), tags } });
        const posts = [
            post('news', 'See [Aider](/tools/aider).', ['news'], 9),
            post('guide', '[Aider](/tools/aider) and [again](/tools/aider/alternatives)', [], 2),
            post('other', '[Aider desk](/tools/aider-desk)', [], 3),
            post('recent', '[Aider](/tools/aider)', [], 5),
        ];
        expect(blogPostsLinkingTo(posts, 'aider').map(p => p.id)).toEqual(['guide', 'recent', 'news']);
        expect(blogPostsLinkingTo(posts, 'aider', 1).map(p => p.id)).toEqual(['guide']);
        expect(blogPostsLinkingTo(posts, 'cursor')).toEqual([]);
    });
});
