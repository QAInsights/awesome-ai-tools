/** Sign-in modal headline and benefits, matched to what the visitor clicked. */
const FULL_INDEX = 'Browse the full index of tools, ad-free';
const FOLLOW = 'Follow tools and get an email when they change';

export const DEFAULT_SIGN_IN_COPY = Object.freeze({
    headline: 'Join ai.dosa.dev free',
    benefits: Object.freeze([FULL_INDEX, FOLLOW, 'Keep favorites, Zaps and stacks in sync across devices']),
});

const SIGN_IN_COPY = Object.freeze({
    favorite_heart: {
        headline: 'Save tools to your favorites',
        benefits: ['Keep a shortlist on your Favorites page', 'Synced on every device you sign in on', FULL_INDEX],
    },
    zap_btn: {
        headline: 'Zap the tools you rate',
        benefits: ['Your Zap adds to the public vote count', 'See every tool you backed on your Zaps page', FULL_INDEX],
    },
    ad_close: {
        headline: 'Browse ad-free as a member',
        benefits: ['Members never see ads on ai.dosa.dev', 'Browse the full index of tools', FOLLOW],
    },
    stack_add: {
        headline: 'Save your AI stack',
        benefits: ['Keep every stack on your Stacks page', 'Edit, fork and share stacks by link', FULL_INDEX],
    },
    browse_gate: {
        headline: 'Unlock the full index',
        benefits: ['Browse every tool, not just the free preview', 'No ads anywhere on the site', FOLLOW],
    },
});

export function getSignInCopy(trigger) {
    return SIGN_IN_COPY[trigger] ?? DEFAULT_SIGN_IN_COPY;
}
