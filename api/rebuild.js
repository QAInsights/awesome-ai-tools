/**
 * Vercel Cron Job - Daily rebuild trigger
 * 
 * Triggered by Vercel Cron at 9 AM UTC daily (after midnight data update).
 * Calls Vercel REST API to create a new production deployment,
 * which rebuilds the site with fresh enriched data from public/data/enriched-tools.json
 * 
 * Required Environment Variables:
 * - CRON_SECRET: From Vercel Dashboard → Project → Settings → Cron Jobs
 * - VERCEL_TOKEN: Create at https://vercel.com/account/tokens
 * - VERCEL_PROJECT_ID: From Project Settings → General → Project ID
 */

export default async function handler(req) {
    // Verify request is from Vercel Cron
    const signature = req.headers.get('x-vercel-signature');
    if (signature !== process.env.CRON_SECRET) {
        console.warn('[rebuild] Unauthorized request - invalid or missing signature');
        return new Response('Unauthorized', { status: 401 });
    }

    // Validate required env vars
    if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
        console.error('[rebuild] Missing required environment variables');
        return new Response('Server configuration error', { status: 500 });
    }

    try {
        console.log('[rebuild] Triggering production deployment...');

        const resp = await fetch(
            `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/deployments`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    target: 'production',
                    gitSource: {
                        type: 'github',
                        ref: 'main'
                    }
                })
            }
        );

        if (!resp.ok) {
            const error = await resp.text();
            console.error('[rebuild] Vercel API error:', error);
            return new Response(`Failed to trigger rebuild: ${error}`, { status: 500 });
        }

        const data = await resp.json();
        console.log('[rebuild] Deployment triggered:', data.id || data.url);

        return new Response(JSON.stringify({
            success: true,
            message: 'Rebuild triggered',
            deploymentId: data.id
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('[rebuild] Error triggering deployment:', err);
        return new Response(`Internal error: ${err.message}`, { status: 500 });
    }
}
