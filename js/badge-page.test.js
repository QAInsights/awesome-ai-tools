import { describe, expect, test } from 'bun:test';
import { buildSnippets, resolvePreselectedSlug } from './badge-page.js';

describe('buildSnippets', () => {
    test('builds directory snippets', () => {
        expect(buildSnippets('')).toEqual({
            markdown: '[![Featured on ai.dosa.dev](https://ai.dosa.dev/badge/featured.svg)](https://ai.dosa.dev/?ref=badge)',
            html: '<a href="https://ai.dosa.dev/?ref=badge" target="_blank" rel="noopener"><img src="https://ai.dosa.dev/badge/featured.svg" alt="Featured on ai.dosa.dev" width="212" height="44"></a>',
        });
    });

    test('builds tool snippets', () => {
        expect(buildSnippets('cursor')).toEqual({
            markdown: '[![Featured on ai.dosa.dev](https://ai.dosa.dev/badge/featured.svg)](https://ai.dosa.dev/tools/cursor?ref=badge)',
            html: '<a href="https://ai.dosa.dev/tools/cursor?ref=badge" target="_blank" rel="noopener"><img src="https://ai.dosa.dev/badge/featured.svg" alt="Featured on ai.dosa.dev" width="212" height="44"></a>',
        });
    });
});

describe('resolvePreselectedSlug', () => {
    const available = ['', 'cursor', 'devin'];

    test('returns the tool slug when it is a select option', () => {
        expect(resolvePreselectedSlug('?tool=cursor', available)).toBe('cursor');
        expect(resolvePreselectedSlug('?foo=1&tool=devin', available)).toBe('devin');
    });

    test('returns empty when missing or not an option', () => {
        expect(resolvePreselectedSlug('', available)).toBe('');
        expect(resolvePreselectedSlug('?tool=', available)).toBe('');
        expect(resolvePreselectedSlug('?tool=unknown-tool', available)).toBe('');
    });
});
