export interface PricingPlan {
    name: string;
    price: string;
    unit: string;
    note: string;
}

export interface PricingSegment {
    text: string;
    price: boolean;
}

export interface PricingBreakdown {
    headline: string;
    headlineCaption: string;
    plans: PricingPlan[];
    signals: string[];
    points: PricingSegment[][];
}

const NAME = String.raw`[A-Z][\w+]*(?:\s+(?:\d+x|[A-Z][\w+]*))?`;
const AMOUNT = String.raw`\$\d+(?:,\d{3})*(?:\.\d+)?`;
const PRICE = String.raw`${AMOUNT}(?:\s*[-\u2013]\s*${AMOUNT})?`;
const UNIT = String.raw`(?:\s*\/\s*[a-z]+)*`;

const NAMED_PAREN = new RegExp(String.raw`(${NAME})\s*\(\s*(${PRICE})(${UNIT})([^)]*)\)`, 'g');
const PRICE_PAREN = new RegExp(String.raw`(${PRICE})(${UNIT})\s*\((${NAME})\)`, 'g');
const NAMED_AT = new RegExp(String.raw`(${NAME})(?:\s+plans?)?\s+(?:is|at|costs)\s+(${PRICE})(${UNIT})`, 'g');
const NAMED_BARE = new RegExp(String.raw`(${NAME})\s+(${PRICE})(${UNIT})`, 'g');
const STARTS_AT = new RegExp(String.raw`(?:starting at|starts at|starting from|from)\s+(${AMOUNT})(${UNIT})`, 'i');
const PRICE_TOKEN = new RegExp(String.raw`(${AMOUNT}${UNIT})`, 'g');

const NOT_PLAN_NAMES = new Set([
    'A', 'An', 'And', 'API', 'Approximately', 'At', 'Costs', 'From', 'Includes', 'Included', 'Only', 'Or',
    'Paid', 'Plans', 'Price', 'Pricing', 'Starting', 'Starts', 'The', 'Then', 'Usage', 'USD',
]);

const LICENSE = /\b(MIT|Apache(?:[ -]2\.0)?|AGPL(?:-?v?3(?:\.0)?)?|LGPL(?:-?v?3(?:\.0)?)?|GPL(?:-?v?[23](?:\.0)?)?|GNU GPLv?3|BSD(?:-\d-Clause)?|MPL(?:-?2\.0)?)\b/;

function normalizeUnit(raw: string): string {
    const parts = raw.split('/').map(p => p.trim().toLowerCase()).filter(Boolean);
    return parts
        .map(p => ({ month: 'mo', monthly: 'mo', mo: 'mo', year: 'yr', yr: 'yr', annually: 'yr', seat: 'seat', user: 'user' } as Record<string, string>)[p] ?? p)
        .map(p => `/${p}`)
        .join('');
}

function cleanName(raw: string): string | null {
    const words = raw.trim().split(/\s+/);
    while (words[0] !== undefined && NOT_PLAN_NAMES.has(words[0])) words.shift();
    if (!words.length) return null;
    if (words.length === 2 && NOT_PLAN_NAMES.has(words[1] ?? '')) words.pop();
    return words.join(' ');
}

function priceValue(price: string): number {
    return Number((price.split(/[-\u2013]/)[0] ?? '').replace(/[$,\s]/g, ''));
}

export function extractPlans(detail: string): PricingPlan[] {
    const found: { index: number; plan: PricingPlan }[] = [];
    const seen = new Set<string>();
    const add = (index: number, rawName = '', price = '', unit = '', note = '') => {
        const name = cleanName(rawName);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        found.push({ index, plan: { name, price, unit: normalizeUnit(unit), note: note.replace(/^[\s,;]+/, '').trim() } });
    };
    for (const m of detail.matchAll(NAMED_PAREN)) add(m.index ?? 0, m[1], m[2], m[3], m[4]);
    for (const m of detail.matchAll(PRICE_PAREN)) add(m.index ?? 0, m[3], m[1], m[2]);
    for (const m of detail.matchAll(NAMED_AT)) add(m.index ?? 0, m[1], m[2], m[3]);
    for (const m of detail.matchAll(NAMED_BARE)) add(m.index ?? 0, m[1], m[2], m[3]);
    return found.sort((a, b) => a.index - b.index).map(f => f.plan);
}

export function pricingSignals(detail: string): string[] {
    const signals: string[] = [];
    const license = detail.match(LICENSE);
    if (license) signals.push(`Open source (${license[1]})`);
    else if (/open[- ]source/i.test(detail)) signals.push('Open source');
    if (!license && /free (?:tier|plan|hobby|version)|free for individuals|free to (?:use|download)|\bis free\b|\$0(?![.\d])/i.test(detail)) {
        signals.push('Free tier');
    }
    const trial = detail.match(/(\d+)-day free trial/i);
    if (trial) signals.push(`${trial[1]}-day free trial`);
    else if (/free trial/i.test(detail)) signals.push('Free trial');
    if (/\b(?:API|tokens?|credits?|pay-as-you-go|usage-based|metered|overages?)\b/i.test(detail)) signals.push('Usage-based costs');
    if (/billed (?:annually|yearly)|annual (?:plan|subscription|billing)/i.test(detail)) signals.push('Annual billing');
    if (/\b(?:enterprise|teams?)\b[^.]*\bcustom\b|\bcustom\b[^.]*\benterprise\b/i.test(detail)) signals.push('Custom enterprise pricing');
    else if (/custom pricing/i.test(detail)) signals.push('Custom pricing');
    return signals;
}

export function splitPricePoints(detail: string): PricingSegment[][] {
    return detail
        .split(/(?<=[.;])\s+(?=[A-Z])/)
        .map(s => s.trim().replace(/[.;]$/, ''))
        .filter(Boolean)
        .map(sentence => sentence
            .split(PRICE_TOKEN)
            .filter(Boolean)
            .map(text => ({ text, price: /^\$\d/.test(text) })));
}

function headlineFor(pricing: string, plans: PricingPlan[], detail: string): { headline: string; caption: string } {
    const paid = plans.filter(p => priceValue(p.price) > 0).sort((a, b) => priceValue(a.price) - priceValue(b.price));
    const cheapest = paid[0];
    if (cheapest) return { headline: `${cheapest.price}${cheapest.unit}`, caption: 'Lowest listed paid plan' };
    const [, startPrice = '', startUnit = ''] = detail.match(STARTS_AT) ?? [];
    if (startPrice && priceValue(startPrice) > 0) return { headline: `${startPrice}${normalizeUnit(startUnit)}`, caption: 'Starting price' };
    const model = pricing.toLowerCase();
    if (model === 'free' || model === 'open-source' || model === 'open_source' || model === 'oss') {
        return { headline: 'Free', caption: model === 'free' ? 'Free to use' : 'Open source, no license fee' };
    }
    if (model === 'freemium') return { headline: 'Free to start', caption: 'Paid plans available' };
    if (model === 'paid' || model === 'enterprise') return { headline: 'Paid', caption: 'See plan details below' };
    return { headline: 'See details', caption: '' };
}

export function buildPricingBreakdown(pricing: string | undefined, detail: string | undefined): PricingBreakdown {
    const text = (detail ?? '').trim();
    const plans = extractPlans(text);
    const { headline, caption } = headlineFor(pricing ?? '', plans, text);
    return {
        headline,
        headlineCaption: caption,
        plans,
        signals: pricingSignals(text),
        points: text ? splitPricePoints(text) : [],
    };
}
