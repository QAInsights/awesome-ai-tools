import { describe, expect, test } from 'bun:test';
import { AUTH_TRIGGERS } from '../src/lib/analytics-events.js';
import { DEFAULT_SIGN_IN_COPY, getSignInCopy } from './signin-copy.js';

describe('sign-in modal copy', () => {
    test('matches the trigger the visitor clicked', () => {
        expect(getSignInCopy('favorite_heart').headline).toBe('Save tools to your favorites');
        expect(getSignInCopy('browse_gate').headline).toBe('Unlock the full index');
    });

    test('falls back to the default copy for generic or unknown triggers', () => {
        expect(getSignInCopy('sidebar')).toBe(DEFAULT_SIGN_IN_COPY);
        expect(getSignInCopy('settings')).toBe(DEFAULT_SIGN_IN_COPY);
        expect(getSignInCopy(undefined)).toBe(DEFAULT_SIGN_IN_COPY);
    });

    test('every trigger gets three benefits with no em dashes', () => {
        for (const trigger of AUTH_TRIGGERS) {
            const { headline, benefits } = getSignInCopy(trigger);
            expect(benefits).toHaveLength(3);
            for (const text of [headline, ...benefits]) expect(text).not.toContain('\u2014');
        }
    });
});
