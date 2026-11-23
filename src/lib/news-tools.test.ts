import { describe, expect, test } from 'bun:test';
import { matchNewsTools } from './news-tools';

const tool = (name: string, slug = name.toLowerCase().replace(/ /g, '-')) => ({ name, slug });
const slugs = (body: string, catalog: ReturnType<typeof tool>[], override?: string[]) => matchNewsTools(body, catalog, override).map(tool => tool.slug);

describe('news tool matching', () => {
    test('matches case-insensitively at word boundaries, in first-mention order', () => {
        expect(slugs('Supercursor is not Cursor. Try CLINE, then cursor.', [tool('Cline'), tool('Cursor')])).toEqual(['cursor', 'cline']);
        expect(slugs('éCursor Cursorish _Cursor Cursor2', [tool('Cursor')])).toEqual([]);
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
        expect(slugs('`Cursor` https://example.com/cline [Bolt.new](https://example.com/cursor) BoltXnew', [tool('Cursor'), tool('Cline'), tool('Bolt.new')])).toEqual(['bolt.new']);
    });

    test('deduplicates tools and caps results at six', () => {
        const catalog = Array.from({ length: 8 }, (_, i) => tool(`Tool${i}`));
        expect(slugs('Tool0 Tool0 Tool1 Tool2 Tool3 Tool4 Tool5 Tool6 Tool7', catalog)).toEqual(catalog.slice(0, 6).map(tool => tool.slug));
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
