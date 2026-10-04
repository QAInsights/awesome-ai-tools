import type { RateLimit } from '@cloudflare/workers-types';

export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

export async function enforceRateLimit(limiter: RateLimit | undefined, key: string): Promise<Response | null> {
    if (!limiter) return null;

    try {
        const outcome = await limiter.limit({ key });
        if (outcome.success) return null;
        return Response.json(
            { error: 'rate_limited' },
            {
                status: 429,
                headers: {
                    'Cache-Control': 'private, no-store',
                    'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS),
                },
            },
        );
    } catch {
        console.warn('[Rate limit] Limiter unavailable; allowing request.');
        return null;
    }
}
