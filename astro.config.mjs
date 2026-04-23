import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://ai.dosa.dev',
    output: 'static',
    adapter: vercel(),
    integrations: [
        sitemap(),
    ],
    vite: {
        css: {
            // Tailwind v4 is loaded via @import in the global CSS file
        },
    },
});
