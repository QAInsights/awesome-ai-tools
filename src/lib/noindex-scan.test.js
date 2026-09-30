import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectNoindexedPaths, hasNoindexMeta, htmlFileToPath, normalizePath } from './noindex-scan.js';

describe('hasNoindexMeta', () => {
    test('detects robots noindex regardless of attribute order and quoting', () => {
        expect(hasNoindexMeta('<meta name="robots" content="noindex, follow">')).toBe(true);
        expect(hasNoindexMeta("<meta content='NOINDEX,nofollow' name='Robots'>")).toBe(true);
    });

    test('ignores indexable robots and unrelated meta', () => {
        expect(hasNoindexMeta('<meta name="robots" content="index, follow, max-snippet:-1">')).toBe(false);
        expect(hasNoindexMeta('<meta name="description" content="how to noindex a page">')).toBe(false);
        expect(hasNoindexMeta('<p>noindex</p>')).toBe(false);
    });
});

describe('paths', () => {
    test('maps built files to site paths', () => {
        expect(htmlFileToPath('index.html')).toBe('/');
        expect(htmlFileToPath(join('tools', 'cursor', 'index.html'))).toBe('/tools/cursor');
        expect(htmlFileToPath('404.html')).toBe('/404');
        expect(normalizePath('/compare/a-vs-b/')).toBe('/compare/a-vs-b');
        expect(normalizePath('/')).toBe('/');
    });
});

describe('collectNoindexedPaths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'noindex-scan-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test('returns only noindexed pages', () => {
        mkdirSync(join(dir, 'tools', 'thin'), { recursive: true });
        mkdirSync(join(dir, 'tools', 'rich'), { recursive: true });
        writeFileSync(join(dir, 'index.html'), '<meta name="robots" content="index, follow">');
        writeFileSync(join(dir, 'tools', 'thin', 'index.html'), '<meta name="robots" content="noindex, follow">');
        writeFileSync(join(dir, 'tools', 'rich', 'index.html'), '<meta name="robots" content="index, follow">');
        writeFileSync(join(dir, 'tools', 'thin', 'data.json'), '<meta name="robots" content="noindex">');
        expect([...collectNoindexedPaths(dir)]).toEqual(['/tools/thin']);
    });
});
