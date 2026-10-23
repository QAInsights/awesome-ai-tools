import { describe, expect, test } from 'bun:test';
import { getSignInModalOrder, shouldOfferOneTap } from './auth-manager.js';

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

describe('Google One Tap eligibility', () => {
    test('offers One Tap to signed-out visitors on public pages', () => {
        expect(shouldOfferOneTap({ pathname: '/' })).toBe(true);
        expect(shouldOfferOneTap({ pathname: '/tools/cursor' })).toBe(true);
        expect(shouldOfferOneTap({ pathname: '/settings-guide' })).toBe(true);
    });

    test('skips signed-in visitors, an open modal, and account pages', () => {
        expect(shouldOfferOneTap({ pathname: '/', signedIn: true })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/', modalOpen: true })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/admin/funnel' })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/settings' })).toBe(false);
        expect(shouldOfferOneTap({ pathname: '/unsubscribe' })).toBe(false);
    });
});
