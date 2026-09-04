import { describe, expect, test } from 'bun:test';
import { renderDigest } from './digest';

describe('digest email template', () => {
    test('renders escaped tool updates in html and text', () => {
        const result = renderDigest({
            userName: 'Ada <script>',
            tools: [{
                slug: 'cursor',
                name: 'Cursor & Co',
                description: 'A <great> editor',
                recentUpdates: ['Added "agents"'],
                lastUpdated: '2026-09-01',
            }],
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc',
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(result.subject).toBe('Updates for 1 tools you follow on ai.dosa.dev');
        expect(result.html).toContain('ai.dosa.dev');
        expect(result.html).toContain('Cursor &amp; Co');
        expect(result.html).toContain('A &lt;great&gt; editor');
        expect(result.html).toContain('href="https://ai.dosa.dev/settings"');
        expect(result.html).toContain('href="https://ai.dosa.dev/tools/cursor"');
        expect(result.html).toContain('Unsubscribe');
        expect(result.html).toContain('Ada &lt;script&gt;');
        expect(result.text).toContain('Added "agents"');
        expect(result.text).toContain('https://ai.dosa.dev/settings');
        expect(result.text).toContain('https://ai.dosa.dev/tools/cursor');
        expect(result.text).toContain('https://ai.dosa.dev/unsubscribe?token=abc');
        expect(`${result.html}${result.text}`).not.toContain(String.fromCodePoint(0x2014));
    });

    test('omits optional update lines when a tool has no updates', () => {
        const result = renderDigest({
            userName: 'Ada',
            tools: [{
                slug: 'cursor',
                name: 'Cursor',
                description: 'A tool',
                recentUpdates: [],
                lastUpdated: '2026-09-01',
            }],
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc',
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(result.html).not.toContain('<ul');
        expect(result.text).not.toContain('\n- ');
    });
});
