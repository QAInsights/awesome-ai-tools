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
        expect(source).toContain("customElements.whenDefined('chat-bubble-snippet').then(applyCompatibilityFixes);");
        expect(source).toContain("chat.translations = JSON.parse(chat.getAttribute('translations') || '{}');");
        expect(source).toContain('max-height: calc(100dvh - var(--chat-bubble-button-bottom) - 12px - env(safe-area-inset-top, 0px));');
        expect(source).toContain('visibility: hidden;');
        expect(source).toContain('visibility: visible;');
        expect(source).toContain('chatWindow.inert = !expanded;');
        expect(source).toContain("chatWindow.querySelectorAll('.chat-content, .powered-by')");
        expect(source).toContain('bubbleButton.inert = bubbleButton.classList.contains(\'hidden\');');
        expect(source).toContain("chatWidgetObserver.observe(chatWidget, { attributes: true, subtree: true, attributeFilter: ['class'] });");
        expect(source).toContain("chat.shadowRoot.addEventListener('compositionend'");
        expect(source).toContain("chat.shadowRoot.addEventListener('keydown'");
        expect(source).toContain('event.isComposing || event.keyCode === 229 || endedCompositionJustNow');
        expect(source).toContain('event.stopImmediatePropagation();');
        expect(source).toContain('new MutationObserver(() => patchShadowDom(chat)).observe(chat.shadowRoot, { childList: true });');
        expect(source).toContain("--search-snippet-primary-color: var(--color-gold);");
        expect(source).toContain("--chat-bubble-button-z-index: 20;");
        expect(source).toContain('body:has([data-ea-style="fixedfooter"].loaded) chat-bubble-snippet');
        expect(source).toContain('body:has([data-ea-style="stickybox"].loaded) chat-bubble-snippet');
        expect(source).toContain('body:has(#compareFloatingBar[data-visible="true"]) chat-bubble-snippet');
        expect(source).not.toContain('chat/completions/chat/completions');
    });
});
