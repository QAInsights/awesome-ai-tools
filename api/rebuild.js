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

export default async function handler(req, res) {
    // Verify request is from Vercel Cron (check both User-Agent and secret)
    const userAgent = req.headers['user-agent'] || '';
    const signature = req.headers['x-vercel-cron-secret'];
    
    if (!userAgent.includes('vercel-cron/1.0')) {
        console.warn('[rebuild] Unauthorized request - invalid User-Agent:', userAgent);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Validate CRON_SECRET is configured (prevent undefined === undefined bypass)
    if (!process.env.CRON_SECRET) {
        console.error('[rebuild] CRON_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Validate signature exists and matches
    if (!signature || signature !== process.env.CRON_SECRET) {
        console.warn('[rebuild] Unauthorized request - invalid or missing cron secret');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate required env vars
    if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
        console.error('[rebuild] Missing required environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        console.log('[rebuild] Daily rebuild triggered at', new Date().toISOString());

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
            return res.status(500).json({ error: `Failed to trigger rebuild: ${error}` });
        }

        const data = await resp.json();
        console.log('[rebuild] Deployment triggered:', data.id || data.url);

        return res.status(200).json({
            success: true,
            message: 'Rebuild triggered successfully',
            deploymentId: data.id,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[rebuild] Error during rebuild:', errorMessage);
        return res.status(500).json({ 
            error: 'Rebuild failed',
            message: errorMessage 
        });
    }
}
