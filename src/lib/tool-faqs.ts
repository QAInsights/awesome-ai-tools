/**
 * Tool-page FAQ builder (AEO).
 *
 * Answers the "Is X free / open source / how much" questions strictly from
 * enriched data - every question is omitted when its data is missing, so
 * nothing is ever invented. Pure functions shared by the tool detail page
 * and the standalone pricing page.
 */

import { humanizePricing } from './compare';
import type { EnrichedTool, Tool } from './tools';

export interface ToolFaq {
    q: string;
    a: string;
}

const KNOWN_FREE = new Set(['free', 'open-source', 'open_source', 'oss']);
const OPEN_SOURCE = new Set(['open-source', 'open_source', 'oss']);

export function isKnownFree(pricing?: string): boolean {
    return KNOWN_FREE.has((pricing ?? '').toLowerCase());
}

export function isOpenSource(enriched?: EnrichedTool | null): boolean {
    if (!enriched) return false;
    if (OPEN_SOURCE.has((enriched.pricing ?? '').toLowerCase())) return true;
    return (enriched.tags ?? []).some(tag => /open[- ]source/i.test(tag));
}

export function buildToolFaqs(tool: Tool, alternatives: Tool[]): ToolFaq[] {
    const { enriched } = tool;
    const name = enriched?.name ?? tool.name;
    const company = enriched?.company ?? tool.company;
    const faqs: ToolFaq[] = [];

    if (enriched?.pricing) {
        const detail = enriched.pricingDetail ? ` ${enriched.pricingDetail}` : '';
        faqs.push({
            q: `Is ${name} free?`,
            a: isKnownFree(enriched.pricing)
                ? `Yes - ${name} is ${humanizePricing(enriched.pricing)}.${detail}`
                : `${name} is ${humanizePricing(enriched.pricing)}.${detail} Check the official site for current plans.`,
        });

        faqs.push({
            q: `Is ${name} open source?`,
            a: isOpenSource(enriched)
                ? `Yes - ${name} is open source.${detail}`
                : `${name} is not listed as open source on ai.dosa.dev - it is ${humanizePricing(enriched.pricing)}.`,
        });
    }

    if (enriched?.pricingDetail && !isKnownFree(enriched.pricing)) {
        faqs.push({
            q: `How much does ${name} cost?`,
            a: `${enriched.pricingDetail} Pricing changes often - verify on the official site.`,
        });
    }

    if (enriched?.bestFor) {
        faqs.push({ q: `Who is ${name} best for?`, a: enriched.bestFor });
    }

    if (enriched?.notIdealFor) {
        faqs.push({ q: `Who is ${name} not ideal for?`, a: enriched.notIdealFor });
    }

    if (alternatives.length > 0) {
        const enrichedAlts = alternatives.filter(t => t.enriched);
        const topNames = (enrichedAlts.length > 0 ? enrichedAlts : alternatives)
            .slice(0, 3)
            .map(t => t.enriched?.name ?? t.name);
        faqs.push({
            q: `What are the best ${name} alternatives?`,
            a: `The closest ${name} alternatives on ai.dosa.dev are ${topNames.join(', ')} - all listed under ${tool.categoryClean}.`,
        });
    }

    if (company) {
        faqs.push({
            q: `Who makes ${name}?`,
            a: `${name} is developed by ${company}. It is listed in the ${tool.categoryClean} category on ai.dosa.dev.`,
        });
    }

    return faqs;
}
