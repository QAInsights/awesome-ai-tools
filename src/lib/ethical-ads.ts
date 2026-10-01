/**
 * EthicalAds (https://www.ethicalads.io) placement config.
 *
 * Ads use DEFAULT_ETHICAL_ADS_PUBLISHER. PUBLIC_ETHICALADS_PUBLISHER overrides
 * it at build time; set it to "off" (or empty) to disable ads. EthicalAds
 * allows one ad per page, so BaseLayout renders a single floating <EthicalAd />.
 */

export const ETHICAL_ADS_CLIENT_SRC = 'https://media.ethicalads.io/media/client/ethicalads.min.js';

/** Paid campaigns, falling back to our own house ads (never EthicalAds' free house ads). */
export const ETHICAL_ADS_CAMPAIGN_TYPES = 'paid|publisher-house';

export const MAX_AD_KEYWORDS = 8;

export const DEFAULT_ETHICAL_ADS_PUBLISHER = 'qainsightscom';

/** Viewports where EthicalAds' StickyBox floats; below this it renders inline. */
export const FLOATING_AD_WIDE_QUERY = '(min-width: 1301px)';

export interface FloatingAdPlacement {
    id: string;
    type: 'image' | 'text';
    style: 'stickybox' | 'fixedfooter';
}

/**
 * Wide screens get the image StickyBox in the bottom-right corner. Narrower
 * screens get the text FixedFooter, the only EthicalAds style that floats there.
 */
export const FLOATING_AD_PLACEMENTS: { wide: FloatingAdPlacement; narrow: FloatingAdPlacement } = {
    wide: { id: 'float-stickybox', type: 'image', style: 'stickybox' },
    narrow: { id: 'float-footer', type: 'text', style: 'fixedfooter' },
};

const PUBLISHER_ID = /^[a-z0-9][a-z0-9_-]*$/i;

export function ethicalAdsPublisher(value: string | undefined | null): string | null {
    const id = value?.trim() ?? '';
    return PUBLISHER_ID.test(id) ? id : null;
}

/** Publisher for this build: the env override when set, else the default. */
export function resolveEthicalAdsPublisher(override: string | undefined): string | null {
    if (override === undefined) return DEFAULT_ETHICAL_ADS_PUBLISHER;
    if (override.trim().toLowerCase() === 'off') return null;
    return ethicalAdsPublisher(override);
}

/** Topics for contextual targeting: article tags, else the page's meta keywords. */
export function pageAdTopics(tags: readonly string[] | undefined, metaKeywords: string): string[] {
    return tags?.length ? [...tags] : metaKeywords.split(',');
}

/** Normalises page topics into EthicalAds' pipe-separated `data-ea-keywords` value. */
export function adKeywords(values: readonly (string | undefined | null)[]): string {
    const keywords = new Set<string>();
    for (const value of values) {
        const keyword = (value ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (keyword) keywords.add(keyword);
        if (keywords.size === MAX_AD_KEYWORDS) break;
    }
    return [...keywords].join('|');
}
