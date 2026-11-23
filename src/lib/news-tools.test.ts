import { describe, expect, test } from 'bun:test';
import { matchNewsTools } from './news-tools';

const tool = (name: string, slug = name.toLowerCase().replace(/ /g, '-')) => ({ name, slug });
const slugs = (body: string, catalog: ReturnType<typeof tool>[], override?: string[]) => matchNewsTools(body, catalog, override).map(tool => tool.slug);

describe('news tool matching', () => {
    test('matches distinctive single-word brands case-sensitively at word boundaries', () => {
        expect(slugs('Supercursor is not Cursor. Try Cline, then cursor and CLINE.', [tool('Cline'), tool('Cursor')])).toEqual(['cursor', 'cline']);
        expect(slugs('cursor and CLINE', [tool('Cline'), tool('Cursor')])).toEqual([]);
        expect(slugs('éCursor Cursorish _Cursor Cursor2', [tool('Cursor')])).toEqual([]);
    });

    test('does not link the unrelated Fern and Rune in the October 31 brief', () => {
        const catalog = [tool('Fern'), tool('Rune')];
        expect(slugs("Mirendil's Fern launches. Salesforce buys Rune Technologies. Fern has a 10M-token window.", catalog)).toEqual([]);
    });

    test('excludes generic phrases and ambiguous projects found in the full news audit', () => {
        expect(slugs('Packaged agent skills enable parallel code generation. NVIDIA published Agent Substrate.', [
            tool('Agent Skills'), tool('Parallel Code'), tool('Agent Substrate'),
        ])).toEqual([]);
    });

    test('recognizes distinctive brands in product extensions and possessive phrases', () => {
        const catalog = [tool('Claude'), tool('Gemini')];
        expect(slugs('Gemini API previews Tool Retrieval. Replit tests Claude Opus 5.5.', catalog)).toEqual(['gemini', 'claude']);
        expect(slugs("Google's Gemini and Anthropic’s Claude.", catalog)).toEqual(['gemini', 'claude']);
    });

    test('keeps multi-word names case-insensitive without the brand restrictions', () => {
        expect(slugs("Mirendil's CLAUDE CODE Templates and claude code.", [tool('Claude Code')])).toEqual(['claude-code']);
    });

    test('prefers the longest overlapping name without losing later mentions', () => {
        const catalog = [tool('Claude'), tool('Claude Code'), tool('Claude Code Templates')];
        expect(slugs('Claude Code Templates, Claude Code, Claude.', catalog)).toEqual(['claude-code-templates', 'claude-code', 'claude']);
        expect(slugs('Claude Code Templates only.', catalog)).toEqual(['claude-code-templates']);
    });

    test('skips short and common names but accepts explicit aliases', () => {
        expect(slugs('Continue with zero traces in space. Pi and v0. VS Code and Warp terminal.', [
            tool('Continue'), tool('Zero'), tool('Traces'), tool('SPACE'), tool('Pi'), tool('v0'), tool('Visual Studio Code'), tool('Warp'),
        ])).toEqual(['visual-studio-code', 'warp']);
    });

    test('escapes punctuation and ignores URLs and code', () => {
        expect(slugs('`Cursor` https://example.com/cline [Bolt.new](https://example.com/cursor) vs BoltXnew', [tool('Cursor'), tool('Cline'), tool('Bolt.new')])).toEqual(['bolt.new']);
    });

    test('deduplicates tools and caps results at six', () => {
        const catalog = Array.from({ length: 8 }, (_, i) => tool(`Tool ${i}`));
        expect(slugs('Tool 0 Tool 0 Tool 1 Tool 2 Tool 3 Tool 4 Tool 5 Tool 6 Tool 7', catalog)).toEqual(catalog.slice(0, 6).map(tool => tool.slug));
    });

    test('explicit slugs replace matching, ignore invalid slugs and preserve order', () => {
        const catalog = [tool('Cursor'), tool('Cline'), tool('Continue')];
        expect(slugs('Cursor', catalog, ['missing', 'continue', 'cline', 'cline'])).toEqual(['continue', 'cline']);
        expect(slugs('Cursor', catalog, [])).toEqual([]);
        expect(slugs('Cursor', catalog, ['missing'])).toEqual([]);
    });

    test('handles empty content and catalog', () => {
        expect(slugs('', [tool('Cursor')])).toEqual([]);
        expect(slugs('Cursor', [])).toEqual([]);
    });
});
