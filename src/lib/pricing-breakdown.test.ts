import { describe, expect, test } from 'bun:test';

import { priceSummary, unitWords } from './folio';
import { buildPricingBreakdown, extractPlans, pricingSignals, splitPricePoints } from './pricing-breakdown';

describe('extractPlans', () => {
    test('reads "Name ($price/unit)" plans in order, keeping trailing notes', () => {
        expect(extractPlans('Paid plans include Pro ($20/month), Max ($200/month), and Teams ($80/month base plus $40/seat).')).toEqual([
            { name: 'Pro', price: '$20', unit: '/mo', note: '' },
            { name: 'Max', price: '$200', unit: '/mo', note: '' },
            { name: 'Teams', price: '$80', unit: '/mo', note: 'base plus $40/seat' },
        ]);
    });

    test('parses "per user/mo" units and merges duplicate-price ticks on the scale', () => {
        const detail =
            'Offers a free tier with limited functionality for individual developers. Paid individual plans include Copilot Pro ($10/mo), Pro+ ($39/mo), and Max ($100/mo). Organizational plans include Copilot Business ($19 per user/mo) and Enterprise ($39 per user/mo), with additional usage billed via AI credits at $0.01 per credit.';
        const summary = priceSummary('freemium', detail);

        expect(summary.plans.map(p => `${p.name} ${p.price} ${unitWords(p.unit)}`)).toEqual([
            'Copilot Pro $10 per month',
            'Pro+ $39 per month',
            'Max $100 per month',
            'Copilot Business $19 per user / month',
            'Enterprise $39 per user / month',
        ]);
        expect(summary.scale.map(s => `${s.p.name} ${s.p.price}`)).toEqual([
            'Copilot Pro $10',
            'Copilot Business $19',
            'Pro+ · Enterprise $39',
            'Max $100',
        ]);
    });

    test('reads "$price (Name)", "Name is $price" and bare "Name $price" forms', () => {
        expect(extractPlans('Starts at $20/mo (Pro). Business is $50/user/month.').map(p => `${p.name} ${p.price}${p.unit}`))
            .toEqual(['Pro $20/mo', 'Business $50/user/mo']);
        expect(extractPlans('Token Plans (Plus $20, Max $50, Ultra $120).').map(p => `${p.name} ${p.price}`))
            .toEqual(['Plus $20', 'Max $50', 'Ultra $120']);
    });

    test('keeps multi-word names, ranges and thousands separators', () => {
        expect(extractPlans('Max 5x ($100/mo), Pro ($100-$200/month), Solo ($1,000/month)').map(p => `${p.name} ${p.price}`))
            .toEqual(['Max 5x $100', 'Pro $100-$200', 'Solo $1,000']);
    });

    test('reads "Name subscription at $price/unit" plans', () => {
        expect(extractPlans('Offers a free tier for autocomplete inference and a Pro subscription at $10 per month per user, which includes a 1 million token context window.'))
            .toEqual([expect.objectContaining({ name: 'Pro', price: '$10', unit: '/mo/user' })]);
    });

    test('reads usage-multiplier tier names such as "Strong 2.5x"', () => {
        expect(extractPlans('Subscribe to Strong 1x ($100/month), Strong 2.5x ($200/month) or Strong 7x ($500/month).')).toEqual([
            { name: 'Strong 1x', price: '$100', unit: '/mo', note: '' },
            { name: 'Strong 2.5x', price: '$200', unit: '/mo', note: '' },
            { name: 'Strong 7x', price: '$500', unit: '/mo', note: '' },
        ]);
    });

    test('ignores lead-in words and prose without plans', () => {
        expect(extractPlans('Starting at $10/month for everyone.')).toEqual([]);
        expect(extractPlans('Free and open-source under the MIT License.')).toEqual([]);
    });
});

describe('pricingSignals', () => {
    test('detects licence, free tier, trial, usage and enterprise terms', () => {
        expect(pricingSignals('Free and open-source under the MIT License. Users pay for their own API usage.'))
            .toEqual(['Open source (MIT)', 'Usage-based costs']);
        expect(pricingSignals('Free tier available. 7-day free trial. Billed annually. Enterprise pricing is custom.'))
            .toEqual(['Free tier', '7-day free trial', 'Annual billing', 'Custom enterprise pricing']);
    });

    test('does not read $0.01 as a free tier', () => {
        expect(pricingSignals('1 credit = $0.01 USD')).toEqual(['Usage-based costs']);
    });
});

test('splitPricePoints turns sentences into rows with amounts marked', () => {
    expect(splitPricePoints('Pro is $20/month. Enterprise is custom.')).toEqual([
        [{ text: 'Pro is ', price: false }, { text: '$20/month', price: true }],
        [{ text: 'Enterprise is custom', price: false }],
    ]);
});

describe('buildPricingBreakdown headline', () => {
    test('uses the cheapest paid plan', () => {
        const b = buildPricingBreakdown('freemium', 'Free ($0/month). Max ($200/month) and Pro ($20/month).');
        expect([b.headline, b.headlineCaption]).toEqual(['$20/mo', 'Lowest listed paid plan']);
    });

    test('falls back to a "starting at" price, then the pricing model', () => {
        expect(buildPricingBreakdown('freemium', 'Paid tiers starting at $10/month.').headline).toBe('$10/mo');
        expect(buildPricingBreakdown('open-source', 'MIT licensed.').headline).toBe('Free');
        expect(buildPricingBreakdown('freemium', 'Paid plans unlock more.').headline).toBe('Free to start');
        expect(buildPricingBreakdown(undefined, undefined).points).toEqual([]);
    });
});
