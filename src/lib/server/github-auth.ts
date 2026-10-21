import type { IdentityProfile } from './user-session';

type GitHubRequest = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

interface GitHubProfile {
    id: number | string;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
}

interface GitHubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
}

export function githubApiHeaders(accessToken: string) {
    return {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ai.dosa.dev',
    };
}

export function normalizeGitHubIdentity(
    profile: GitHubProfile,
    emails: GitHubEmail[] = [],
): IdentityProfile {
    if ((typeof profile.id !== 'number' && typeof profile.id !== 'string') || !profile.login) {
        throw new Error('GitHub profile is missing required identity fields');
    }
    const verifiedEmails = emails.filter(email => email.verified);
    const profileEmail = profile.email;
    const profileEmailIsVerified = profileEmail !== null && verifiedEmails.some(
        email => email.email.toLowerCase() === profileEmail.toLowerCase(),
    );
    const email = profileEmailIsVerified
        ? profileEmail
        : verifiedEmails.find(address => address.primary)?.email ?? verifiedEmails[0]?.email ?? profileEmail ?? null;
    return {
        provider: 'github',
        providerUserId: String(profile.id),
        name: profile.name ?? profile.login,
        email,
        picture: profile.avatar_url,
        githubUsername: profile.login,
        emailVerified: email !== null && verifiedEmails.some(
            address => address.email.toLowerCase() === email.toLowerCase(),
        ),
    };
}

export async function fetchGitHubIdentity(
    code: string,
    clientId: string,
    clientSecret: string,
    request: GitHubRequest = fetch,
): Promise<IdentityProfile> {
    const tokenResponse = await request('https://github.com/login/oauth/access_token', {
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
    if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${tokenResponse.status}`);

    const tokenData = await tokenResponse.json() as {
        access_token?: string;
        error?: string;
        error_description?: string;
    };
    if (tokenData.error) throw new Error(tokenData.error_description ?? tokenData.error);
    if (!tokenData.access_token) throw new Error('No access token received from GitHub');

    const headers = githubApiHeaders(tokenData.access_token);
    const [profileResponse, emailsResponse] = await Promise.all([
        request('https://api.github.com/user', { headers }),
        request('https://api.github.com/user/emails', { headers }),
    ]);
    if (!profileResponse.ok) {
        throw new Error(`Failed to fetch GitHub profile: ${profileResponse.status}`);
    }

    const profile = await profileResponse.json() as GitHubProfile;
    const emails = emailsResponse.ok
        ? await emailsResponse.json() as GitHubEmail[]
        : [];
    return normalizeGitHubIdentity(profile, emails);
}
