import { describe, expect, test } from 'bun:test';
import { renderLayout } from './layout';

describe('email layout', () => {
    test('escapes the document title and uses absolute footer links', () => {
        const html = renderLayout({
            title: 'Updates <today>',
            content: '<p>Content</p>',
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc',
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(html).toContain('<title>Updates &lt;today&gt;</title>');
        expect(html).toContain('href="https://ai.dosa.dev/settings"');
        expect(html).toContain('href="https://ai.dosa.dev/unsubscribe?token=abc"');
    });
});
