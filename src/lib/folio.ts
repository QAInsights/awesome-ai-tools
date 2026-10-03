import type { Tool } from './tools';
import { humanizePricing } from './compare';
import { buildPricingBreakdown, type PricingPlan } from './pricing-breakdown';

/** Lowest listed price of a plan normalised to a monthly figure. */
export function monthly(p: PricingPlan): number {
    const v = Number((p.price.split(/[-\u2013]/)[0] ?? '').replace(/[$,\s]/g, ''));
    return /\/yr/.test(p.unit) ? v / 12 : v;
}

export function unitWords(unit: string): string {
    const parts = unit.split('/').filter(Boolean).map(u => ({ mo: 'month', yr: 'year' } as Record<string, string>)[u] ?? u);
    return parts.length ? `per ${parts.join(' / ')}` : 'one-time';
}

export interface PriceSummary {
    plans: PricingPlan[];
    paid: PricingPlan[];
    entry: PricingPlan | null;
    freeTier: boolean;
    main: string;
    unit: string;
    model: string;
    scale: { p: PricingPlan; x: number }[];
}

export function priceSummary(pricing?: string, detail?: string): PriceSummary {
    const plans = buildPricingBreakdown(pricing, detail).plans.filter(p => Number.isFinite(monthly(p)));
    const paid = plans.filter(p => monthly(p) > 0).sort((a, b) => monthly(a) - monthly(b));
    const entry = paid[0] ?? null;
    const freeTier = /free|open-source|freemium/i.test(pricing ?? '') || plans.some(p => monthly(p) === 0);
    const main = entry ? entry.price : freeTier ? 'Free' : pricing ? 'Custom' : '—';
    const unit = entry
        ? unitWords(entry.unit)
        : freeTier
            ? (/open-source/i.test(pricing ?? '') ? 'open source' : 'free to use')
            : pricing ? 'pricing on request' : 'pricing not yet listed';
    const min = paid.length ? Math.min(...paid.map(monthly)) : 0;
    const max = paid.length ? Math.max(...paid.map(monthly)) : 0;
    const span = Math.log(max) - Math.log(min || 1);
    const scale = paid.map(p => ({ p, x: span > 0 ? (Math.log(monthly(p)) - Math.log(min)) / span : 0 }));
    return { plans, paid, entry, freeTier, main, unit, model: humanizePricing(pricing) || 'Unlisted', scale };
}

/** Short entry-price label for list rows, e.g. "$20/mo" or "Free". */
export function entryLabel(t: Tool): string {
    const first = priceSummary(t.enriched?.pricing, t.enriched?.pricingDetail).entry;
    if (first) return `${first.price}${first.unit}`;
    const m = (t.enriched?.pricing ?? '').toLowerCase();
    return m === 'free' || m === 'open-source' ? 'Free' : humanizePricing(t.enriched?.pricing) || 'Unlisted';
}

export type TitleSize = 'xl' | 'lg' | 'md';

const TITLE_CAPS: Record<TitleSize, { vw: number; px: number; min: number }> = {
    xl: { vw: 11.5, px: 184, min: 40 },
    lg: { vw: 8.5, px: 132, min: 36 },
    md: { vw: 6.2, px: 92, min: 32 },
};

/** CSS font-size for a Folio title, scaled so its longest word fits the column. */
export function titleFontSize(text: string, size: TitleSize = 'xl'): string {
    const longest = Math.max(...text.split(/\s+/).filter(Boolean).map(w => w.length), 1);
    const cap = TITLE_CAPS[size];
    const vw = Math.min(cap.vw, 76 / longest).toFixed(2);
    const px = Math.round(Math.min(cap.px, 1280 / longest));
    return `clamp(${cap.min}px, ${vw}vw, ${px}px)`;
}
