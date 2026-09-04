import { describe, expect, test } from 'bun:test';
import { renderNewsEmail } from './news';

describe('news email template', () => {
    test('escapes content and includes article links', () => {
        const result = renderNewsEmail({
            userName: 'Ada',
            post: {
                id: 'today-in-ai-2026-09-02',
                date: '2026-09-02',
                title: 'A daily brief',
                description: 'A summary',
                intro: ['An intro'],
                items: [{
                    heading: '<script>alert(1)</script>',
                    whatHappened: 'A release',
                    whyItMatters: 'It matters',
                    sourceLabel: 'Example',
                    sourceUrl: 'https://example.com/story',
                }],
            },
            postUrl: 'https://ai.dosa.dev/blog/today-in-ai-2026-09-02',
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc&kind=news',
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(result.subject).toBe('Today in AI: A daily brief');
        expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(result.html).not.toContain('<script>alert(1)</script>');
        expect(result.html).toContain('https://example.com/story');
        expect(result.html).toContain('https://ai.dosa.dev/blog/today-in-ai-2026-09-02');
        expect(result.html).toContain('https://ai.dosa.dev/unsubscribe?token=abc&amp;kind=news');
        expect(result.html).toContain('https://ai.dosa.dev/settings');
        expect(result.text).toContain('Read the full brief: https://ai.dosa.dev/blog/today-in-ai-2026-09-02');
        expect(result.text).toContain('https://ai.dosa.dev/unsubscribe?token=abc&kind=news');
        expect(`${result.html}${result.text}`).not.toContain(String.fromCodePoint(0x2014));
    });

    test('omits optional item fields without leaving labels behind', () => {
        const result = renderNewsEmail({
            userName: 'Ada',
            post: {
                id: 'today-in-ai-2026-09-02',
                date: '2026-09-02',
                title: 'A daily brief',
                description: 'A summary',
                intro: [],
                items: [{
                    heading: 'A headline',
                    whatHappened: '',
                    whyItMatters: '',
                    sourceLabel: '',
                    sourceUrl: '',
                }],
            },
            postUrl: 'https://ai.dosa.dev/blog/today-in-ai-2026-09-02',
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc&kind=news',
            siteOrigin: 'https://ai.dosa.dev',
        });

        expect(result.html).not.toContain('What happened');
        expect(result.html).not.toContain('Source:');
        expect(result.text).not.toContain('What happened');
        expect(result.text).not.toContain('Source:');
    });
});
