import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { remarkReadingTime } from './remark-reading-time.mjs';

// https://astro.build/config
export default defineConfig({
    site: 'https://ai.dosa.dev',
    // In Astro 6, output:'static' is the unified mode.
    // Pages are statically pre-rendered by default.
    // Server API routes opt into SSR with `export const prerender = false`
    // and are deployed as Vercel serverless functions via @astrojs/vercel.
    output: 'static',
    adapter: vercel(),
    integrations: [
        sitemap(),
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
