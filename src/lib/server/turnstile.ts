const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResponse {
    success?: boolean;
    'error-codes'?: string[];
}

export async function verifyTurnstile(
    token: string,
    secret: string,
    remoteIp: string | null,
    fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
    if (!token || !secret) return false;

    try {
        const body = new URLSearchParams({ secret, response: token });
        if (remoteIp) body.set('remoteip', remoteIp);

        const response = await fetchImpl(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok) {
            console.warn('[Turnstile] siteverify request failed:', response.status);
            return false;
        }

        const json = await response.json() as SiteverifyResponse;
        if (json.success === true) return true;
        console.warn('[Turnstile] verification failed:', (json['error-codes'] ?? []).join(',') || 'unknown');
        return false;
    } catch (error) {
        console.warn('[Turnstile] siteverify error:', error instanceof Error ? error.message : String(error));
        return false;
    }
}
