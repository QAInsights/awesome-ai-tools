/**
 * Reads robots directives back out of the built HTML so the sitemap can
 * never list a page that tells crawlers not to index it. Plain JS so
 * astro.config.mjs can import it under Node.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const META_TAG = /<meta\b[^>]*>/gi;

function attr(tag, name) {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** True when the document carries a `<meta name="robots">` with noindex. */
export function hasNoindexMeta(html) {
    for (const tag of html.match(META_TAG) ?? []) {
        if ((attr(tag, 'name') ?? '').toLowerCase() !== 'robots') continue;
        if (/\bnoindex\b/i.test(attr(tag, 'content') ?? '')) return true;
    }
    return false;
}

/** Site path without trailing slash; the root stays "/". */
export function normalizePath(pathname) {
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
}

/** "tools/x/index.html" -> "/tools/x", "404.html" -> "/404". */
export function htmlFileToPath(relativeFile) {
    const posix = relativeFile.split(sep).join('/');
    return normalizePath(`/${posix.replace(/(?:^|\/)index\.html$/, '').replace(/\.html$/, '')}`);
}

function* walkHtml(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) yield* walkHtml(full);
        else if (entry.isFile() && entry.name.endsWith('.html')) yield full;
    }
}

/** Paths of every built HTML page under `dir` that is marked noindex. */
export function collectNoindexedPaths(dir) {
    const paths = new Set();
    for (const file of walkHtml(dir)) {
        if (hasNoindexMeta(readFileSync(file, 'utf8'))) paths.add(htmlFileToPath(relative(dir, file)));
    }
    return paths;
}
