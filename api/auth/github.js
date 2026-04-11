/**
 * Vercel Serverless Function: GitHub OAuth Callback Handler
 *
 * Receives the authorization code from GitHub, exchanges it for an access
 * token (using the secret server-side), fetches the user profile, then
 * redirects back to the client with the normalized user data.
 *
 * Route: /api/auth/github
 * Registered callback in GitHub OAuth App: https://ai.dosa.dev/api/auth/github
 */

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Origin pages that can receive the auth redirect.
// Should only ever be pages on the same domain.
const ALLOWED_ORIGINS = [
    '/',
    '/settings.html',
    '/zap.html',
    '/help.html',
    '/tools/token-counter.html',
    '/tools/hallucination-scorer.html',
];

/**
 * Determine a safe redirect origin from the `origin` query param.
 * Falls back to '/' if the param is missing or not in the allowlist.
 */
function resolveOrigin(originParam) {
    if (originParam && ALLOWED_ORIGINS.includes(originParam)) {
        return originParam;
    }
    return '/';
}

export default async function handler(req, res) {
    const { code, state, error, error_description, origin } = req.query;
    const redirectOrigin = resolveOrigin(origin);

    // --- GitHub denied authorization ---
    if (error) {
        const msg = encodeURIComponent(error_description || error || 'Authorization denied');
        return res.redirect(302, `${redirectOrigin}?auth_error=${msg}`);
    }

    // --- Missing code or state ---
    if (!code || !state) {
        return res.redirect(302, `${redirectOrigin}?auth_error=${encodeURIComponent('Missing OAuth parameters')}`);
    }

    // --- Missing server-side configuration ---
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        console.error('[GitHub OAuth] Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET env variables');
        return res.redirect(302, `${redirectOrigin}?auth_error=${encodeURIComponent('Server configuration error')}`);
    }

    try {
        // Step 1: Exchange authorization code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        if (!tokenResponse.ok) {
            throw new Error(`Token exchange failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            throw new Error(tokenData.error_description || tokenData.error);
        }

        const accessToken = tokenData.access_token;

        if (!accessToken) {
            throw new Error('No access token received from GitHub');
        }

        // Step 2: Fetch user profile
        const [profileResponse, emailsResponse] = await Promise.all([
            fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }),
            fetch('https://api.github.com/user/emails', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }),
        ]);

        if (!profileResponse.ok) {
            throw new Error(`Failed to fetch GitHub profile: ${profileResponse.status}`);
        }

        const profile = await profileResponse.json();

        // Resolve the primary verified email (GitHub users can have private emails)
        let primaryEmail = profile.email;
        if (!primaryEmail && emailsResponse.ok) {
            const emails = await emailsResponse.json();
            const primary = emails.find(e => e.primary && e.verified);
            primaryEmail = primary?.email || emails[0]?.email || null;
        }

        // Step 3: Build normalized user object (matches shape used by Google provider)
        const userData = {
            provider: 'github',
            id: String(profile.id),
            name: profile.name || profile.login,
            email: primaryEmail,
            picture: profile.avatar_url,
            githubUsername: profile.login,
            emailVerified: true, // GitHub emails are verified at the account level
        };

        // Step 4: Encode and redirect back to client
        const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
        return res.redirect(302, `${redirectOrigin}?github_auth=${encoded}&state=${encodeURIComponent(state)}`);

    } catch (err) {
        console.error('[GitHub OAuth] Error during token exchange:', err.message);
        const msg = encodeURIComponent('Authentication failed. Please try again.');
        return res.redirect(302, `${redirectOrigin}?auth_error=${msg}`);
    }
}
