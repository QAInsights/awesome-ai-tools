import { humanizePricing } from './compare';
import type { Tool } from './tools';

const MAX_DESCRIPTION = 155;

function shorten(text: string, max: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const prefix = clean.slice(0, max - 1);
    const boundary = prefix.lastIndexOf(' ');
    return `${(boundary > max / 2 ? prefix.slice(0, boundary) : prefix).replace(/[.,;:!?-]+$/, '').trimEnd()}…`;
}

function sentence(text: string): string {
    return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function completePhrase(text: string, max: number, allowComma = true): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    const firstSentence = clean.split(/[.!?](?:\s|$)/)[0] ?? '';
    const boundaries = [
        [firstSentence],
        Array.from(firstSentence.matchAll(/\b(?:who|that|which)\b/gi), match => firstSentence.slice(0, match.index).trim()),
        allowComma ? Array.from(firstSentence.matchAll(/,/g), match => firstSentence.slice(0, match.index).trim()) : [],
    ];
    for (const candidates of boundaries) {
        const complete = candidates.filter(candidate => candidate.length >= 20 && candidate.length <= max && !/\b(?:a|an|the|to|for|with|and|in|of)$/i.test(candidate));
        if (complete.length) return sentence(complete.at(-1)!.replace(/[,;:]$/, ''));
    }
    return '';
}

export function buildToolSeo(tool: Tool, alternatives: Tool[], year = new Date().getUTCFullYear()): { title: string; description: string } {
    const name = tool.enriched?.name?.trim() || tool.name;
    const { enriched } = tool;
    const nameSlug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    const titleName = tool.slug.startsWith(`${nameSlug}-`) ? `${name} (${tool.categoryShort})` : name;
    const core = [enriched?.pricing && 'Pricing', enriched?.verdict && 'Review'].filter(Boolean);
    const alternativesLabel = alternatives.length ? `${alternatives.length} Alternatives` : '';
    const descriptors = [
        core.length === 2 && alternativesLabel
            ? `${core.join(', ')} & ${alternativesLabel}`
            : [...core, alternativesLabel].filter(Boolean).join(' & '),
        core.join(' & '),
        enriched?.verdict ? 'Review' : enriched?.pricing ? 'Pricing' : '',
    ].filter(Boolean);
    const title = [...descriptors.map(descriptor => `${titleName}: ${descriptor} (${year})`), `${titleName} (${year})`]
        .find(candidate => candidate.length <= 65)
        ?? `${shorten(titleName, 65 - String(year).length - 3)} (${year})`;

    let prefix: string;
    if (enriched?.pricing) {
        const pricing = enriched.pricing.toLowerCase();
        prefix = pricing === 'free'
            ? `Is ${name} free? Yes, free.`
            : ['open-source', 'open_source', 'oss'].includes(pricing)
                ? `${name} pricing: ${humanizePricing(enriched.pricing)}.`
                : `Is ${name} free? ${humanizePricing(enriched.pricing)} pricing.`;
    } else {
        prefix = `${name}: ${shorten(enriched?.description || tool.notes, 75)}`;
        prefix = sentence(prefix);
    }

    const parts = [prefix];
    const related = alternatives.slice(0, 3).map(item => item.enriched?.name || item.name);
    const reserved = related.length ? Math.min(30, `Compare with ${related[0]}.`.length + 1) : 0;
    if (enriched?.verdict) {
        const phrase = completePhrase(enriched.verdict, Math.min(95, MAX_DESCRIPTION - prefix.length - reserved - 1));
        if (phrase) parts.push(phrase);
    }
    if (enriched?.bestFor) {
        const budget = MAX_DESCRIPTION - parts.join(' ').length - reserved - ' Best for '.length;
        const phrase = completePhrase(enriched.bestFor, budget, false);
        if (phrase) parts.push(`Best for ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`);
    }
    while (related.length && parts.join(' ').length + ` Compare with ${related.join(', ')}.`.length > MAX_DESCRIPTION) related.pop();
    if (related.length) parts.push(`Compare with ${related.join(', ')}.`);
    return { title, description: shorten(parts.join(' '), MAX_DESCRIPTION) };
}

export function buildToolReview(tool: Tool): Record<string, unknown> | null {
    const verdict = tool.enriched?.verdict?.trim();
    if (!verdict) return null;
    return {
        '@type': 'Review',
        author: { '@type': 'Organization', '@id': 'https://ai.dosa.dev/#organization', name: 'dosa.dev' },
        itemReviewed: { '@type': 'SoftwareApplication', '@id': `https://ai.dosa.dev/tools/${tool.slug}#app`, name: tool.enriched?.name || tool.name },
        reviewBody: verdict,
    };
}
