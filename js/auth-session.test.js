import { describe, expect, test } from 'bun:test';
import {
    AUTH_RETURN_PATHS,
    AUTH_SESSION_TTL_MS,
    resolveAuthReturnPath,
} from '../src/lib/auth-session.js';

describe('auth session configuration', () => {
    test('uses a 24-hour server-session TTL', () => {
        expect(AUTH_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('shares an exact allowlist for post-auth return paths', () => {
        expect(AUTH_RETURN_PATHS).toContain('/favorites');
        expect(resolveAuthReturnPath('/favorites')).toBe('/favorites');
        expect(resolveAuthReturnPath('/blog')).toBe('/blog');
        expect(resolveAuthReturnPath('/news')).toBe('/news');
        expect(resolveAuthReturnPath('/tools/cursor')).toBe('/');
        expect(resolveAuthReturnPath('https://evil.example')).toBe('/');
        expect(resolveAuthReturnPath(null)).toBe('/');
    });
});
