import { serve } from "bun";
import { readFileSync } from "fs";

// Load .env.local for local development (Bun only auto-loads .env)
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
            process.env[key] = val;
        }
    } catch {}
}
loadEnvLocal();

const PORT = 3000;

const ROOT = import.meta.dir;
const FAVICON_PATH = `${ROOT}/images/icons/favicon.ico`;

async function isRegularFile(path: string): Promise<boolean> {
    try {
        const stat = await Bun.file(path).stat();
        return stat.isFile();
    } catch {
        return false;
    }
}

async function resolveFile(pathname: string): Promise<Response> {
    const candidates = [
        `${ROOT}${pathname}`,
        `${ROOT}${pathname}.html`,
        `${ROOT}${pathname}/index.html`,
    ];

    for (const filePath of candidates) {
        if (await isRegularFile(filePath)) {
            return new Response(Bun.file(filePath));
        }
    }

    return new Response('Not Found', { status: 404 });
}

const server = serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        let pathname = url.pathname;

        // --- GitHub OAuth Local Handler ---
        if (pathname === '/api/auth/github') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');

            if (!code) {
                return new Response('No code provided', { status: 400 });
            }

            try {
                // 1. Exchange code for access token
                const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: process.env.GITHUB_CLIENT_ID,
                        client_secret: process.env.GITHUB_CLIENT_SECRET,
                        code: code,
                    }),
                });

                const tokenData = await tokenResponse.json() as any;

                if (tokenData.error) {
                    return new Response(JSON.stringify(tokenData), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 2. Get user profile
                const userResponse = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${tokenData.access_token}`,
                        'User-Agent': 'Awesome-AI-Tools-Local'
                    },
                });

                const userData = await userResponse.json() as any;

                // 3. Return user data formatted for AuthManager
                const userProfile = {
                    id: userData.id,
                    name: userData.name || userData.login,
                    email: userData.email,
                    picture: userData.avatar_url,
                    githubUsername: userData.login,
                    provider: 'github'
                };

                // Redirect back to origin with the user data in base64url format
                const base64Data = Buffer.from(JSON.stringify(userProfile)).toString('base64url');

                // Always redirect back to the home page with the auth payload and returned state
                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': `/?github_auth=${base64Data}&state=${state || ''}`
                    }
                });

            } catch (error) {
                console.error('Local OAuth Error:', error);
                return new Response('Internal Server Error', { status: 500 });
            }
        }
        // ------------------------------------

        if (pathname === '/') pathname = '/index.html';

        if (pathname === '/favicon.ico') {
            if (await isRegularFile(FAVICON_PATH)) return new Response(Bun.file(FAVICON_PATH));
            return new Response('Not Found', { status: 404 });
        }

        return resolveFile(pathname);
    },
});

console.log(`Server running at http://localhost:${server.port}`);
