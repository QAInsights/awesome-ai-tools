import { build } from "bun";

// Read from the active environment (e.g. Vercel) or fallback for local
const enableVoting = process.env.ENABLE_VOTING || 'true';
const cfSiteKey = process.env.CF_SITEKEY || '1x00000000000000000000AA';
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8080';
const googleClientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id-here';

const result = await build({
    entrypoints: ['./js/app.js'],
    outdir: './dist',
    define: {
        'process.env.ENABLE_VOTING': JSON.stringify(enableVoting),
        'process.env.CF_SITEKEY': JSON.stringify(cfSiteKey),
        'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
        'process.env.GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
    }
});

if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
        console.error(message);
    }
    process.exit(1);
} else {
    console.log("Build successful - dist/app.js updated!");
}
