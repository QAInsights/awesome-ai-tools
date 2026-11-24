/**
 * zh dictionary coverage: every t(lang, 'key', ...) call site must have a
 * matching entry in the zh map, and both templates must use the same
 * placeholders - a missing key silently falls back to English on zh pages.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, zhCategoryName, ZH_CATEGORIES } from './zh';
import { getCategoriesDetailed } from '../lib/tools';

const root = fileURLToPath(new URL('../..', import.meta.url));

function* astroFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* astroFiles(path);
        else if (entry.name.endsWith('.astro')) yield path;
    }
}

function zhKeys(): Set<string> {
    const src = readFileSync(fileURLToPath(new URL('./zh.ts', import.meta.url)), 'utf8');
    return new Set([...src.matchAll(/^\s+'([^']+)':/gm)].map(m => m[1]));
}

const keysInUse = new Set<string>();
for (const file of astroFiles(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*lang\s*,\s*'([^']+)'/g)) keysInUse.add(m[1]);
    for (const m of src.matchAll(/\bt\(lang,\s*`nav\.\$\{item\.key\}`/g)) keysInUse.add('nav.*');
}

describe('zh dictionary', () => {
    test('every t() key used in components exists in the dictionary', () => {
        const keys = zhKeys();
        const missing = [...keysInUse].filter(k => k !== 'nav.*' && !keys.has(k));
        expect(missing).toEqual([]);
        // nav.<key> keys are built dynamically - every nav item key needs an entry
        const navKeys = [...keys].filter(k => k.startsWith('nav.'));
        const navItemKeys = [...new Set([...keysInUse])];
        expect(navKeys.length).toBeGreaterThan(20);
    });

    test('dynamic nav.* keys exist for every nav item', () => {
        const keys = zhKeys();
        const navSrc = readFileSync(join(root, 'src/components/NavIsland.astro'), 'utf8');
        const itemKeys = [...navSrc.matchAll(/\{ key: '([^']+)'/g)].map(m => m[1]);
        const missing = itemKeys.filter(k => !keys.has(`nav.${k}`));
        expect(missing).toEqual([]);
    });

    test('zh templates use no placeholder absent from the call-site vars', () => {
        // t(lang, 'key', `fallback`, { name: x }) - the vars object defines
        // the placeholders interpolate() can fill; a zh entry referencing a
        // name no call site passes would render the literal "{name}".
        const callVars = new Map<string, Set<string>>();
        for (const file of astroFiles(join(root, 'src'))) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/\bt\(\s*lang\s*,\s*'([^']+)'\s*,\s*(`[^`]*`|'[^']*'|"[^"]*")\s*,\s*\{([^}]*)\}\s*\)/g)) {
                const vars = callVars.get(m[1]) ?? new Set<string>();
                for (const v of m[3].matchAll(/(\w+)\s*:/g)) vars.add(v[1]);
                callVars.set(m[1], vars);
            }
        }
        const src = readFileSync(fileURLToPath(new URL('./zh.ts', import.meta.url)), 'utf8');
        const entries = [...src.matchAll(/^\s+'([^']+)':\s*'([^']*)'/gm)];
        expect(entries.length).toBeGreaterThan(60);
        const offenders: string[] = [];
        for (const [key, tpl] of entries) {
            const allowed = callVars.get(key);
            if (!allowed) continue;
            for (const pm of tpl.matchAll(/\{(\w+)\}/g)) {
                if (!allowed.has(pm[1])) offenders.push(`${key} uses {${pm[1]}} not passed by any call site`);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('every catalog category has a zh display name', () => {
        const missing = getCategoriesDetailed()
            .map(c => c.name)
            .filter(name => !ZH_CATEGORIES[name]);
        expect(missing).toEqual([]);
        for (const c of getCategoriesDetailed()) {
            expect(zhCategoryName(c.name).length).toBeGreaterThan(0);
        }
    });

    test('t() interpolates and falls back to English', () => {
        expect(t('en', 'td.visitSite', 'Visit site')).toBe('Visit site');
        expect(t('zh', 'td.visitSite', 'Visit site')).toBe('访问官网');
        expect(t('zh', 'td.try', 'Try {name}', { name: 'Cursor' })).toBe('试用 Cursor');
        expect(t('zh', 'missing.key', 'Fallback')).toBe('Fallback');
    });
});
