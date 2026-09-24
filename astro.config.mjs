import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { remarkReadingTime } from './remark-reading-time.mjs';
import { readFileSync, readdirSync } from 'node:fs';

// Honest per-URL <lastmod> for the sitemap: tool pages use the enrichment
// pipeline's lastUpdated stamp, blog posts use their pubDate. Anything else
// is left without lastmod rather than stamped with the build date.
function loadLastmodMap() {
    const map = new Map();
    try {
        const enriched = JSON.parse(readFileSync(new URL('./public/data/enriched-tools.json', import.meta.url), 'utf8'));
        for (const t of enriched) {
            if (!t?.slug || !t?.lastUpdated || isNaN(Date.parse(t.lastUpdated))) continue;
            map.set(`/tools/${t.slug}`, t.lastUpdated);
            map.set(`/tools/${t.slug}/alternatives`, t.lastUpdated);
        }
    } catch { /* enriched data optional */ }
    try {
        const blogDir = new URL('./src/content/blog/', import.meta.url);
        for (const file of readdirSync(blogDir)) {
            if (!file.endsWith('.mdx')) continue;
            const src = readFileSync(new URL(file, blogDir), 'utf8');
            const m = src.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})/m);
            if (m) map.set(`/blog/${file.replace(/\.mdx$/, '')}`, m[1]);
        }
    } catch { /* blog optional */ }
    return map;
}
const lastmodMap = loadLastmodMap();

// https://astro.build/config
export default defineConfig({
    site: 'https://ai.dosa.dev',
    // In Astro 6, output:'static' is the unified mode.
    // Pages are statically pre-rendered by default.
    // Server API routes opt into SSR with `export const prerender = false`.
    output: 'static',
    session: {
        driver: sessionDrivers.null(),
    },
    adapter: cloudflare({
        platformProxy: { enabled: true },
        imageService: 'compile',
    }),
    integrations: [
        sitemap({
            // User-only pages are noindexed — keep them out of the sitemap too
            filter: (page) => !page.includes('/settings') && !page.includes('/favorites') && !page.includes('/zap') && !page.includes('/admin'),
            serialize(item) {
                const url = item.url;
                const path = new URL(url).pathname.replace(/\/$/, '');
                const lastmod = lastmodMap.get(path);
                if (lastmod) item.lastmod = new Date(lastmod).toISOString();
                if (/\/compare\/[^/]+\/$/.test(url) || /\/compare\/[^/]+$/.test(url)) {
                    item.priority = 0.8;
                    item.changefreq = 'weekly';
                } else if (/\/tools\/[^/]+\/alternatives\/?$/.test(url)) {
                    item.priority = 0.7;
                    item.changefreq = 'weekly';
                } else if (/\/tools\/[^/]+\/$/.test(url) || /\/tools\/[^/]+$/.test(url)) {
                    item.priority = 0.7;
                    item.changefreq = 'weekly';
                } else if (url === 'https://ai.dosa.dev/') {
                    item.priority = 1.0;
                    item.changefreq = 'daily';
                } else if (url === 'https://ai.dosa.dev/news/' || url === 'https://ai.dosa.dev/news') {
                    item.priority = 0.8;
                    item.changefreq = 'daily';
                } else if (/\/blog\/today-in-ai-\d{4}-\d{2}-\d{2}\/?$/.test(url)) {
                    item.priority = 0.7;
                    item.changefreq = 'daily';
                } else if (url.includes('/blog/')) {
                    item.priority = 0.6;
                    item.changefreq = 'monthly';
                }
                return item;
            },
        }),
        mdx(),
    ],
    markdown: {
        shikiConfig: {
            theme: 'github-dark',
        },
        remarkPlugins: [remarkReadingTime],
    },
    vite: {
        css: {
            // Tailwind v4 is loaded via @import in the global CSS file
        },
    },
});
