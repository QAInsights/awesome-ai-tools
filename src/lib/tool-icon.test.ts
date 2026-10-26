import { describe, expect, test } from 'bun:test';
import { toolIconUpstreamUrl } from './tool-icon';

describe('toolIconUpstreamUrl', () => {
    test('uses the hostname for HTTPS URLs', () => {
        expect(toolIconUpstreamUrl('https://www.example.com/path')).toBe(
            'https://www.google.com/s2/favicons?domain=www.example.com&sz=128',
        );
    });

    test('uses the hostname for HTTP URLs', () => {
        expect(toolIconUpstreamUrl('http://example.com/path')).toBe(
            'https://www.google.com/s2/favicons?domain=example.com&sz=128',
        );
    });

    test.each(['#', 'mailto:hello@example.com', 'garbage', ''])('rejects invalid URL %j', (url) => {
        expect(toolIconUpstreamUrl(url)).toBeNull();
    });

    test('rejects an undefined URL', () => {
        expect(toolIconUpstreamUrl(undefined)).toBeNull();
    });
});
