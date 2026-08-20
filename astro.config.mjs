import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { remarkReadingTime } from './remark-reading-time.mjs';

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
            filter: (page) => !page.includes('/settings') && !page.includes('/zap'),
            serialize(item) {
                const url = item.url;
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
