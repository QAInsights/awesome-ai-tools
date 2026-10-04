import { describe, expect, mock, test } from 'bun:test';
import type { RateLimit } from '@cloudflare/workers-types';
import { enforceRateLimit, RATE_LIMIT_RETRY_AFTER_SECONDS } from './rate-limit';

describe('enforceRateLimit', () => {
    test('allows requests when no limiter is configured', async () => {
        expect(await enforceRateLimit(undefined, 'github:user-1')).toBeNull();
    });

    test('passes the user key to the limiter and allows successful outcomes', async () => {
        const limit = mock(async (_options: { key: string }) => ({ success: true }));
        const limiter: RateLimit = { limit };

        expect(await enforceRateLimit(limiter, 'github:user-1')).toBeNull();
        expect(limit).toHaveBeenCalledWith({ key: 'github:user-1' });
    });

    test('returns a private 429 response when the limit is exceeded', async () => {
        const limiter: RateLimit = {
            limit: async () => ({ success: false }),
        };

        const response = await enforceRateLimit(limiter, 'github:user-1');

        if (!response) throw new Error('Expected a rate-limit response');
        const body = await response.json() as { error?: string };
        expect(response.status).toBe(429);
        expect(body.error).toBe('rate_limited');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('Retry-After')).toBe(String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    });

    test('fails open and warns when the limiter throws', async () => {
        const originalWarn = console.warn;
        const warning = mock(() => {});
        console.warn = warning;
        try {
            const limiter: RateLimit = {
                limit: async () => {
                    throw new Error('unavailable');
                },
            };

            expect(await enforceRateLimit(limiter, 'github:user-1')).toBeNull();
            expect(warning).toHaveBeenCalledTimes(1);
            expect(warning).toHaveBeenCalledWith('[Rate limit] Limiter unavailable; allowing request.');
        } finally {
            console.warn = originalWarn;
        }
    });
});
