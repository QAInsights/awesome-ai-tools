/**
 * Astro API Route: /api/auth/github
 *
 * GitHub OAuth Authorization Code callback handler.
 *
 * Flow:
 *   1. GitHub redirects here with ?code=&state= after user grants permission
 *   2. We exchange the code for an access token (server-side, secret stays safe)
 *   3. We fetch the user's GitHub profile + primary email
 *   4. We encode the normalized user object as base64url and redirect to the
 *      original page with ?github_auth=<encoded> so the client JS can restore
 *      the session without a full page reload.
 *
 * Required env vars:
 *   GITHUB_CLIENT_ID     — from GitHub OAuth App settings (also baked into JS bundle)
 *   GITHUB_CLIENT_SECRET — NEVER exposed client-side
 *
 * Registered callback URL in GitHub OAuth App: https://ai.dosa.dev/api/auth/github
 */
import type { APIRoute } from 'astro';

export const prerender = false;

// Pages that may receive the post-auth redirect.
// Must match the paths used by auth.js _getCurrentOriginPath().
// NOTE: No .html extensions — Astro uses clean URLs.
const ALLOWED_ORIGINS = [
    '/',
    '/settings',
    '/zap',
    '/help',
    '/tools/token-counter',
    '/tools/hallucination-scorer',
];

function resolveOrigin(originParam: string | null): string {
    if (originParam && ALLOWED_ORIGINS.includes(originParam)) {
        return originParam;
    }
    return '/';
}

export const GET: APIRoute = async ({ request, redirect }) => {
    const url = new URL(request.url);
    const code   = url.searchParams.get('code');
    const state  = url.searchParams.get('state');
    const error  = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');
    const origin = url.searchParams.get('origin');

    const redirectOrigin = resolveOrigin(origin);

    // ── 1. GitHub denied authorization ───────────────────────────────────────
    if (error) {
        const msg = encodeURIComponent(errorDesc ?? error ?? 'Authorization denied');
        return redirect(`${redirectOrigin}?auth_error=${msg}`);
    }

    // ── 2. Missing OAuth params ───────────────────────────────────────────────
    if (!code || !state) {
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Missing OAuth parameters')}`);
    }

    // ── 3. Verify server-side config ─────────────────────────────────────────
    // Using process.env as fallback for robust serverless environments
    const clientId     = import.meta.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const clientSecret = import.meta.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[GitHub OAuth] Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Server configuration error')}`);
    }

    try {
        // ── 4. Exchange code for access token ─────────────────────────────────
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        });

        if (!tokenRes.ok) {
            throw new Error(`Token exchange failed: ${tokenRes.status}`);
        }

        const tokenData = await tokenRes.json() as {
            access_token?: string;
            error?: string;
            error_description?: string;
        };

        if (tokenData.error) {
            throw new Error(tokenData.error_description ?? tokenData.error);
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            throw new Error('No access token received from GitHub');
        }

        // ── 5. Fetch user profile + emails in parallel ────────────────────────
        const ghHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };

        const [profileRes, emailsRes] = await Promise.all([
            fetch('https://api.github.com/user',         { headers: ghHeaders }),
            fetch('https://api.github.com/user/emails',  { headers: ghHeaders }),
        ]);

        if (!profileRes.ok) {
            throw new Error(`Failed to fetch GitHub profile: ${profileRes.status}`);
        }

        const profile = await profileRes.json() as {
            id: number;
            login: string;
            name: string | null;
            email: string | null;
            avatar_url: string;
        };

        // Resolve the primary verified email (GitHub users can have private emails)
        let primaryEmail = profile.email;
        if (!primaryEmail && emailsRes.ok) {
            const emails = await emailsRes.json() as Array<{
                email: string; primary: boolean; verified: boolean;
            }>;
            const primary = emails.find(e => e.primary && e.verified);
            primaryEmail = primary?.email ?? emails[0]?.email ?? null;
        }

        // ── 6. Build normalized user object (matches Google provider shape) ───
        const userData = {
            provider: 'github',
            id: String(profile.id),
            name: profile.name ?? profile.login,
            email: primaryEmail,
            picture: profile.avatar_url,
            githubUsername: profile.login,
            emailVerified: true, // GitHub emails are verified at account level
        };

        // ── 7. Encode and redirect back to client ─────────────────────────────
        // Buffer is available in Vercel's Node.js runtime (Node 18+).
        const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
        return redirect(`${redirectOrigin}?github_auth=${encoded}&state=${encodeURIComponent(state)}`);

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[GitHub OAuth] Token exchange error:', message);
        return redirect(`${redirectOrigin}?auth_error=${encodeURIComponent('Authentication failed. Please try again.')}`);
    }
};
