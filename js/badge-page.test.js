import { describe, expect, test } from 'bun:test';
import { buildSnippets } from './badge-page.js';

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
