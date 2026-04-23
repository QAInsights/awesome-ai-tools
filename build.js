import { build } from "bun";
import { readFileSync } from "fs";
import { generateToolPages } from "./scripts/generate-tool-pages.js";

// Load .env.local for local development (Bun only auto-loads .env by default)
// Parse and set env vars so they override system env vars for local dev
function loadEnvLocal() {
    try {
        const content = readFileSync(".env.local", "utf-8");
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
            // .env.local overrides system env — that's the point of local dev overrides
            process.env[key] = val;
        }
    } catch {}
}
loadEnvLocal();

// Read from the active environment (e.g. Vercel) or fallback for local
const enableVoting = process.env.ENABLE_VOTING || 'true';
const cfSiteKey = process.env.CF_SITEKEY || '1x00000000000000000000AA';
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8080';
const googleClientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id-here';
// NOTE: Only the client_id is injected — client_secret stays in Vercel env vars only
const githubClientId = process.env.GITHUB_CLIENT_ID || '';

const result = await build({
    entrypoints: [
        './js/app.js',
        './js/compare.js',
        // Utility pages — bundled as separate ES modules served at /dist/
        './js/token-counter.js',
        './js/hallucination-scorer.js',
    ],
    outdir: './public/dist',
    define: {
        'process.env.ENABLE_VOTING': JSON.stringify(enableVoting),
        'process.env.CF_SITEKEY': JSON.stringify(cfSiteKey),
        'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
        'process.env.GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
        'process.env.GITHUB_CLIENT_ID': JSON.stringify(githubClientId),
    }
});

if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
        console.error(message);
    }
    process.exit(1);
} else {
    console.log("Build successful - public/dist/app.js updated!");
}


// Regenerate per-tool detail pages + sitemap from README.md
try {
    const { count } = await generateToolPages();
    console.log(`Generated ${count} tool detail pages and updated sitemap.xml`);
} catch (err) {
    console.error("Tool page generation failed:", err);
    process.exit(1);
}
