import { describe, expect, test } from 'bun:test';
import { getSignInModalOrder } from './auth-manager.js';

describe('sign-in modal layout order', () => {
    test('puts email before OAuth for email-first triggers', () => {
        expect(getSignInModalOrder(true)).toEqual([
            'emailSignInFlow',
            'emailOauthDivider',
            'oauthSignInGroup',
        ]);
    });

    test('restores the default OAuth-first order on close', () => {
        expect(getSignInModalOrder(false)).toEqual([
            'oauthSignInGroup',
            'emailOauthDivider',
            'emailSignInFlow',
        ]);
    });
});
