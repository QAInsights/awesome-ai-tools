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

    test('preserves the existing post-auth return paths', () => {
        expect(AUTH_RETURN_PATHS).toContain('/favorites');
        expect(resolveAuthReturnPath('/favorites')).toBe('/favorites');
        expect(resolveAuthReturnPath('/blog')).toBe('/blog');
        expect(resolveAuthReturnPath('/news')).toBe('/news');
    });

    test('returns readers to tool and category pages after auth', () => {
        expect(resolveAuthReturnPath('/tools/cursor')).toBe('/tools/cursor');
        expect(resolveAuthReturnPath('/category/ai-ides/')).toBe('/category/ai-ides');
    });

    test('rejects external, encoded, nested, and noncanonical return paths', () => {
        for (const path of [
            'https://evil.example', '//evil.example', '/\\evil.example', '/tools/../cursor',
            '/tools/cursor/pricing', '/tools/%2F%2Fevil.example', '/tools/cursor?auth_error=x',
            '/category/ai-ides#fragment', '/category/ai-ides\n', `/tools/${'a'.repeat(129)}`, null,
        ]) expect(resolveAuthReturnPath(path)).toBe('/');
    });
});
