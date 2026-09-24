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
    const parseDate = (value) => {
        const time = Date.parse(value ?? '');
        return Number.isNaN(time) ? null : value;
    };
    const maxDate = (values) => values
        .map(parseDate)
        .filter(Boolean)
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .at(-1);
    const categoryMapping = {
        'AI-Native IDEs & Editors': 'AI IDEs',
        'IDE Extensions & Plugins': 'IDE Plugins',
        'Terminal & CLI Agents': 'CLI Agents',
        'AI-Native Terminals': 'AI Terminals',
        'Autonomous & Async Agents': 'Async Agents',
        'Browser-Based & App Builders': 'Web Builders',
        'AI Code Review & Security': 'Code Review',
        'AI Testing & Quality Assurance': 'QA & Testing',
        'General-Purpose AI Assistants (with Strong Coding Capability)': 'General AI',
        'AI Codebase Knowledge & Generation': 'Codebase AI',
        'Developer Productivity & Workflow': 'Productivity',
        'Editor Platforms with Native AI Features': 'Native Editors',
        'Hardware & Edge AI': 'Hardware & Edge',
    };
    const categorySlug = (category) => (categoryMapping[category] ?? category)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let enriched = [];
    try {
        enriched = JSON.parse(readFileSync(new URL('./public/data/enriched-tools.json', import.meta.url), 'utf8'));
        for (const t of enriched) {
            if (!t?.slug || !t?.lastUpdated || isNaN(Date.parse(t.lastUpdated))) continue;
            map.set(`/tools/${t.slug}`, t.lastUpdated);
            map.set(`/tools/${t.slug}/alternatives`, t.lastUpdated);
        }
    } catch { /* enriched data optional */ }
    try {
        const slugs = JSON.parse(readFileSync(new URL('./data/slugs.json', import.meta.url), 'utf8'));
        const updatesBySlug = new Map(enriched.map(t => [t.slug, t.lastUpdated]));
        const updatesByCategory = new Map();
        for (const tool of slugs) {
            const updated = updatesBySlug.get(tool.slug);
            if (!updated) continue;
            const slug = categorySlug(tool.category);
            updatesByCategory.set(slug, [...(updatesByCategory.get(slug) ?? []), updated]);
        }
        for (const [slug, dates] of updatesByCategory) {
            const latest = maxDate(dates);
            if (latest) map.set(`/category/${slug}`, latest);
        }
    } catch { /* category data optional */ }
    try {
        const comparisons = JSON.parse(readFileSync(new URL('./data/comparisons.json', import.meta.url), 'utf8'));
        const updatesBySlug = new Map(enriched.map(t => [t.slug, t.lastUpdated]));
        for (const comparison of comparisons) {
            const latest = maxDate([updatesBySlug.get(comparison.a), updatesBySlug.get(comparison.b)]);
            if (latest) map.set(`/compare/${comparison.slug}`, latest);
        }
    } catch { /* comparison data optional */ }
    try {
        const blogDir = new URL('./src/content/blog/', import.meta.url);
        const blogDates = [];
        const newsDates = [];
        for (const file of readdirSync(blogDir)) {
            if (!file.endsWith('.mdx')) continue;
            const src = readFileSync(new URL(file, blogDir), 'utf8');
            if (/^draft:\s*true\b/m.test(src)) continue;
            const m = src.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})/m);
            if (!m) continue;
            map.set(`/blog/${file.replace(/\.mdx$/, '')}`, m[1]);
            blogDates.push(m[1]);
            if (/^tags:\s*\[[^\]]*\bnews\b[^\]]*\]/m.test(src)) newsDates.push(m[1]);
        }
        const latestBlog = maxDate(blogDates);
        const latestNews = maxDate(newsDates);
        if (latestBlog) map.set('/blog', latestBlog);
        if (latestNews) map.set('/news', latestNews);
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
