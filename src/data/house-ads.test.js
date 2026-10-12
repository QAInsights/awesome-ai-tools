import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import houseAds from './house-ads.json';

describe('house ads', () => {
    test('every entry has the required non-empty fields', () => {
        for (const ad of houseAds) {
            for (const field of ['id', 'label', 'name', 'tagline', 'cta', 'url', 'icon']) {
                expect(ad[field].trim()).not.toBe('');
            }
        }
    });

    test('ids are unique', () => {
        const ids = houseAds.map(ad => ad.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('urls use HTTPS', () => {
        for (const ad of houseAds) expect(ad.url.startsWith('https://')).toBe(true);
    });

    test('every icon exists under public', () => {
        for (const ad of houseAds) {
            expect(existsSync(resolve(process.cwd(), 'public', ad.icon.replace(/^\/+/, '')))).toBe(true);
        }
    });

    test('names and taglines do not contain em dashes', () => {
        for (const ad of houseAds) {
            expect(ad.name).not.toContain('\u2014');
            expect(ad.tagline).not.toContain('\u2014');
        }
    });
});
