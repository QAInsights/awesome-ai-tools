/**
 * Astro API Route: /api/rebuild
 *
 * Vercel Cron Job — triggered daily at 02:00 UTC (see vercel.json).
 * Calls the Vercel REST API to create a new production deployment,
 * which rebuilds the site with fresh enriched data.
 *
 * Required env vars (set in Vercel Dashboard → Project → Environment Variables):
 *   CRON_SECRET       — from Vercel Dashboard → Project → Settings → Cron Jobs
 *   VERCEL_TOKEN      — https://vercel.com/account/tokens
 *   VERCEL_PROJECT_ID — Project Settings → General → Project ID
 *
 * Security note: Never log or return the raw secret values.
 */
import type { APIRoute } from 'astro';

// This route must NOT be statically pre-rendered — it is a live serverless function.
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
    const headers = request.headers;
    const userAgent = headers.get('user-agent') ?? '';
    const signature = headers.get('x-vercel-cron-secret');

    // ── 1. Verify Vercel Cron User-Agent ─────────────────────────────────────
    if (!userAgent.includes('vercel-cron/1.0')) {
        console.warn('[rebuild] Unauthorized — invalid User-Agent:', userAgent);
        return json({ error: 'Unauthorized' }, 401);
    }

    // ── 2. Validate CRON_SECRET is configured (prevent undefined === undefined) ──
    const cronSecret = import.meta.env.CRON_SECRET;
    if (!cronSecret) {
        console.error('[rebuild] CRON_SECRET not configured');
        return json({ error: 'Server configuration error' }, 500);
    }

    // ── 3. Validate signature ────────────────────────────────────────────────
    if (!signature || signature !== cronSecret) {
        console.warn('[rebuild] Unauthorized — invalid or missing cron secret');
        return json({ error: 'Unauthorized' }, 401);
    }

    // ── 4. Validate required env vars ────────────────────────────────────────
    const vercelToken = import.meta.env.VERCEL_TOKEN;
    const vercelProjectId = import.meta.env.VERCEL_PROJECT_ID;

    if (!vercelToken || !vercelProjectId) {
        console.error('[rebuild] Missing VERCEL_TOKEN or VERCEL_PROJECT_ID');
        return json({ error: 'Server configuration error' }, 500);
    }

    // ── 5. Trigger Vercel deployment ─────────────────────────────────────────
    try {
        console.log('[rebuild] Daily rebuild triggered at', new Date().toISOString());

        const resp = await fetch(
            `https://api.vercel.com/v9/projects/${vercelProjectId}/deployments`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${vercelToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    target: 'production',
                    gitSource: {
                        type: 'github',
                        ref: 'main',
                    },
                }),
            }
        );

        if (!resp.ok) {
            const error = await resp.text();
            console.error('[rebuild] Vercel API error:', error);
            return json({ error: `Failed to trigger rebuild: ${error}` }, 500);
        }

        const data = await resp.json() as { id?: string; url?: string };
        console.log('[rebuild] Deployment triggered:', data.id ?? data.url);

        return json({
            success: true,
            message: 'Rebuild triggered successfully',
            deploymentId: data.id,
            timestamp: new Date().toISOString(),
        }, 200);

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[rebuild] Error:', message);
        return json({ error: 'Rebuild failed', message }, 500);
    }
};

// ── Helper ────────────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
