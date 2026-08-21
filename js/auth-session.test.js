import { describe, expect, test } from 'bun:test';
import {
    AUTH_SESSION_KEY,
    AUTH_SESSION_TTL_MS,
    isValidAuthSession,
} from '../src/lib/auth-session.js';

describe('auth session helpers', () => {
    test('defines the shared storage key and 24-hour TTL', () => {
        expect(AUTH_SESSION_KEY).toBe('auth_session');
        expect(AUTH_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('validates sessions with a user within the TTL', () => {
        const now = 1_000_000;

        expect(isValidAuthSession({ user: { id: 'user-1' }, timestamp: now }, now)).toBe(true);
        expect(isValidAuthSession({
            user: { id: 'user-1' },
            timestamp: now - AUTH_SESSION_TTL_MS - 1,
        }, now)).toBe(false);
        expect(isValidAuthSession({ timestamp: now }, now)).toBe(false);
        expect(isValidAuthSession({ user: { id: 'user-1' } }, now)).toBe(false);
    });
});
