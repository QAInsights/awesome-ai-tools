import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('BaseLayout SEO title escaping', () => {
    test('passes an escaped title into astro-seo without changing social titles', () => {
        const source = readFileSync(new URL('./BaseLayout.astro', import.meta.url), 'utf8');

        expect(source).toContain('const seoTitle = escapeHtml(title);');
        expect(source).toContain('title={seoTitle}');
        expect(source).toContain('title: resolvedOgTitle');
        expect(source).toContain('title: resolvedTwitterTitle');
    });
});
