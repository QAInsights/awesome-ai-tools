/**
 * Build-time catalog for the AI Coding Stack Matcher.
 *
 * Every catalog tool in a matcher-relevant category (see
 * CATEGORY_SLOT_DEFAULTS in js/stack-matcher-data.js) becomes a scoring
 * candidate; curated slugs act as a capability override layer on top.
 * Pricing, free-tier, open-source, and BYOK signals come from the same
 * buildCalculatorToolCatalog used by the cost calculator.
 */
import { buildCalculatorToolCatalog } from './cost-calculator';
import { CATEGORY_SLOT_DEFAULTS, CURATED_SLUGS } from '../../js/stack-matcher-data.js';
import type { Tool } from './tools';

export interface StackMatcherPlan {
    name: string;
    monthlyAmount: number;
    unit: string;
}

export interface StackMatcherCatalogEntry {
    slug: string;
    name: string;
    company: string;
    categoryShort: string;
    description: string;
    url: string;
    plans: StackMatcherPlan[];
    freeTier: boolean;
    openSource: boolean;
    byokFriendly: boolean;
    enterprisePlan: boolean;
    localHint: boolean;
}

const ENTERPRISE_PLAN_RE = /business|team|enterprise|org/i;
const RECURRING_UNIT_RE = /\/(mo|month|yr|year)\b/i;
const ORG_UNIT_RE = /\/(org|organization|team|company|workspace)\b/i;
const LOCAL_HINT_RE =
    /\b(local(ly|-first)?|offline|self-host(ed)?|air-gap(ped)?|on-device|ollama|llama\.cpp|lm studio)\b/i;

const SLOT_CATEGORIES = CATEGORY_SLOT_DEFAULTS as Record<string, unknown>;

function truncateOnWordBoundary(str: string, max: number): string {
    const s = String(str ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const idx = cut.lastIndexOf(' ');
    return (idx > 0 ? cut.slice(0, idx) : cut).trimEnd() + '…';
}

export function buildStackMatcherCatalog(
    tools: ReadonlyArray<Tool>,
): Record<string, StackMatcherCatalogEntry> {
    const calculatorBySlug = new Map(buildCalculatorToolCatalog(tools).map(t => [t.slug, t]));
    const curated = new Set(CURATED_SLUGS);
    const catalog: Record<string, StackMatcherCatalogEntry> = {};

    for (const tool of tools) {
        if (!SLOT_CATEGORIES[tool.categoryShort] && !curated.has(tool.slug)) continue;
        if ((tool.enriched?.status ?? '').toLowerCase() === 'discontinued') continue;

        const enriched = tool.enriched;
        const calculatorEntry = calculatorBySlug.get(tool.slug);
        const plans = (calculatorEntry?.plans ?? [])
            .filter(
                p =>
                    p.monthlyAmount >= 1 &&
                    p.perSeat === true &&
                    RECURRING_UNIT_RE.test(p.unit) &&
                    !ORG_UNIT_RE.test(p.unit),
            )
            .map(p => ({ name: p.name, monthlyAmount: p.monthlyAmount, unit: p.unit }));
        const description = truncateOnWordBoundary(enriched?.description ?? tool.notes ?? '', 140);
        const enterprisePlan =
            plans.some(p => ENTERPRISE_PLAN_RE.test(p.name)) ||
            /enterprise/i.test(enriched?.pricingDetail ?? '');
        const localCorpus = `${description} ${tool.notes ?? ''} ${(enriched?.tags ?? []).join(' ')}`;

        catalog[tool.slug] = {
            slug: tool.slug,
            name: enriched?.name ?? tool.name,
            company: enriched?.company ?? tool.company ?? '',
            categoryShort: tool.categoryShort ?? '',
            description,
            url: `/tools/${tool.slug}`,
            plans,
            freeTier: calculatorEntry?.freeTier ?? false,
            openSource: calculatorEntry?.openSource ?? false,
            byokFriendly: calculatorEntry?.byokFriendly ?? false,
            enterprisePlan,
            localHint: LOCAL_HINT_RE.test(localCorpus),
        };
    }

    return catalog;
}
