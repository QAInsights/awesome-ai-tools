import { describe, expect, test } from 'bun:test';
import { buildStackEmbedSnippets, renderStackSvg } from './stack-svg';
import type { VisibleStackItem } from './stack-public-view';

function makeVisibleItem(slug: string, name: string, purpose: string): VisibleStackItem {
    return {
        item: {
            slug,
            position: 0,
            purpose,
            usageNotes: null,
            enabled: true,
        },
        tool: {
            slug,
            name,
            company: 'Acme',
            url: 'https://example.com',
            notes: 'Notes',
            category: 'AI IDEs',
            categoryClean: 'AI IDEs',
            categoryShort: 'AI IDEs',
            enriched: null,
        },
    };
}

describe('stack-svg', () => {
    test('builds markdown and html embed snippets with badge referral param', () => {
        const snippets = buildStackEmbedSnippets('naveen', 'daily-drivers', 'Daily [Drivers]');
        expect(snippets.svgUrl).toBe('https://ai.dosa.dev/u/naveen/daily-drivers.svg');
        expect(snippets.linkUrl).toBe('https://ai.dosa.dev/u/naveen/daily-drivers?ref=badge');
        expect(snippets.markdown).toBe(
            '[![Daily Drivers — ai.dosa.dev](https://ai.dosa.dev/u/naveen/daily-drivers.svg)](https://ai.dosa.dev/u/naveen/daily-drivers?ref=badge)',
        );
        expect(snippets.html).toContain('width="480"');
    });

    test('renders valid SVG with escaped tool names and overflow counter', () => {
        const items = [
            makeVisibleItem('cursor', 'Cursor & <Friends>', 'Primary IDE'),
            makeVisibleItem('claude-code', 'Claude Code', 'Terminal Agent'),
            makeVisibleItem('aider', 'Aider', 'Git Pair'),
            makeVisibleItem('zed', 'Zed', 'Fast Editor'),
            makeVisibleItem('cline', 'Cline', 'Extension'),
            makeVisibleItem('goose', 'Goose', 'Local Agent'),
            makeVisibleItem('devin', 'Devin', 'Async Agent'),
        ];
        const svg = renderStackSvg({
            title: 'My <Stack>',
            username: 'naveen',
            displayName: 'Naveen',
            items,
        });
        expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('My &lt;Stack&gt;');
        expect(svg).toContain('Cursor &amp; &lt;Friends&gt;');
        expect(svg).toContain('7 TOOLS');
        expect(svg).toContain('+1 more tool on ai.dosa.dev');
        expect(svg).not.toContain('>Devin<');
    });
});
