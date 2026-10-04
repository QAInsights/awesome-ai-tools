import { describe, expect, test } from 'bun:test';
import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
    test('escapes HTML-sensitive characters', () => {
        expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    });
});
