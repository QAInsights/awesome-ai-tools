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

    test('loads the Cloudflare AI Search chat bubble against the instance origin', () => {
        const source = readFileSync(new URL('./BaseLayout.astro', import.meta.url), 'utf8');

        expect(source).toContain("const aiSearchApiUrl = 'https://b3dd0976-27cf-4735-8aa3-279f275b235f.search.ai.cloudflare.com';");
        expect(source).toContain('/assets/v0.0.40/search-snippet.es.js');
        expect(source).toContain('integrity={aiSearchSnippetIntegrity}');
        expect(source).toContain('fetchpriority="low"');
        expect(source).toContain('api-url={aiSearchApiUrl}');
        expect(source).toContain('hide-branding="true"');
        expect(source).toContain('placeholder="Ask about AI coding tools..."');
        expect(source).toContain('translations={aiSearchTranslations}');
        expect(source).toContain("--search-snippet-primary-color: #f2c040;");
        expect(source).not.toContain('chat/completions/chat/completions');
    });
});
