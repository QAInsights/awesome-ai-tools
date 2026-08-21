import { describe, expect, test } from 'bun:test';
import { addOutboundUtmParams } from '../src/lib/outbound-utm.js';

describe('addOutboundUtmParams', () => {
    test('adds source and medium to absolute HTTP and HTTPS URLs', () => {
        expect(addOutboundUtmParams('https://example.com/tool')).toBe(
            'https://example.com/tool?utm_source=ai.dosa.dev&utm_medium=referral'
        );
        expect(addOutboundUtmParams('http://example.com/tool')).toBe(
            'http://example.com/tool?utm_source=ai.dosa.dev&utm_medium=referral'
        );
    });

    test('preserves existing query params and hash fragments', () => {
        expect(addOutboundUtmParams('https://example.com/tool?plan=free#pricing')).toBe(
            'https://example.com/tool?plan=free&utm_source=ai.dosa.dev&utm_medium=referral#pricing'
        );
        expect(addOutboundUtmParams('https://example.com/tool?#pricing')).toBe(
            'https://example.com/tool?&utm_source=ai.dosa.dev&utm_medium=referral#pricing'
        );
    });

    test('leaves URLs with an existing utm_source unchanged', () => {
        const url = 'https://example.com/tool?utm_source=vendor&utm_medium=email#pricing';
        expect(addOutboundUtmParams(url)).toBe(url);
    });

    test('leaves non-http URLs, invalid values, and missing values unchanged', () => {
        for (const value of [
            '#section',
            '',
            undefined,
            'mailto:hello@example.com',
            '/tools/example',
            'ftp://example.com/tool',
            'https:example.com/tool',
            'not a URL',
            'https://[invalid',
        ]) {
            expect(addOutboundUtmParams(value)).toBe(value);
        }
    });
});
