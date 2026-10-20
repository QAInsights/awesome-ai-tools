import { getComparisonsForTool, hasAlternativesPage, hasPricingPage, humanizePricing, resolveComparison } from './compare';
import { buildToolFaqs } from './tool-faqs';
import { formatDate, getAlternativesFor, getCategorySlug, getToolBySlug, maxLastUpdated, type CategoryInfo, type Tool } from './tools';

const SITE = 'https://ai.dosa.dev';
const oneLine = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
const escapeCell = (s?: string) => oneLine(s).replace(/\|/g, '\\|');

/** Markdown mirror of a tool detail page (/tools/<slug>.md) for LLM and answer-engine consumers. */
export function toolPageMarkdown(tool: Tool): string {
    const e = tool.enriched;
    const displayName = e?.name ?? tool.name;
    const company = e?.company ?? tool.company;
    const pricing = humanizePricing(e?.pricing);
    const description = oneLine(e?.description ?? tool.notes);
    const updated = e?.lastUpdated ? formatDate(e.lastUpdated) : null;
    const alternatives = getAlternativesFor(tool).slice(0, 6);
    const comparisons = getComparisonsForTool(tool.slug)
        .map(resolveComparison)
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .slice(0, 6);
    const faqs = buildToolFaqs(tool, alternatives);

    const lines: string[] = [
        `# ${displayName} — AI Coding Tool Review & Pricing`,
        '',
        `> ${description}`,
        '',
        `Source: ${SITE}/tools/${tool.slug}${updated ? ` · Updated ${updated}` : ''} · Category: ${tool.categoryClean} · Published by dosa.dev`,
        '',
        '## At a glance',
        '',
        `- **Tool**: ${displayName}`,
        `- **Company**: ${company || 'Unlisted'}`,
        `- **Category**: [${tool.categoryClean}](${SITE}/category/${getCategorySlug(tool.categoryShort)})`,
        `- **Pricing model**: ${pricing}`,
    ];

    if (typeof tool.url === 'string' && /^https?:\/\//i.test(tool.url)) {
        lines.push(`- **Official website**: ${tool.url}`);
    }
    if (e?.status) {
        lines.push(`- **Status**: ${e.status}`);
    }
    if (e?.successor) {
        const successor = getToolBySlug(e.successor);
        const successorName = successor?.enriched?.name ?? successor?.name ?? e.successor;
        lines.push(`- **Successor**: [${successorName}](${SITE}/tools/${e.successor})`);
    }
    lines.push('');

    if (e?.keyFeatures?.length) {
        lines.push('## Key features', '');
        for (const feature of e.keyFeatures) {
            lines.push(`- ${oneLine(feature)}`);
        }
        lines.push('');
    }

    if (e?.pricing || e?.pricingDetail) {
        lines.push('## Pricing', '', `**Model**: ${pricing}`);
        if (e?.pricingDetail) {
            lines.push('', oneLine(e.pricingDetail));
        }
        if (hasPricingPage(tool.slug)) {
            lines.push('', `Full pricing breakdown: ${SITE}/tools/${tool.slug}/pricing`);
        }
        lines.push('');
    }

    if (e?.bestFor || e?.notIdealFor) {
        lines.push('## Who it is for', '');
        if (e?.bestFor) lines.push(`- **Best for**: ${oneLine(e.bestFor)}`);
        if (e?.notIdealFor) lines.push(`- **Not ideal for**: ${oneLine(e.notIdealFor)}`);
        lines.push('');
    }

    if (e?.verdict) {
        lines.push('## Verdict', '', oneLine(e.verdict), '');
    }

    if (e?.recentUpdates) {
        lines.push('## Recent updates', '', oneLine(e.recentUpdates), '');
    }

    if (faqs.length > 0) {
        lines.push('## Frequently asked questions', '');
        for (const faq of faqs) {
            lines.push(`### ${oneLine(faq.q)}`, '', oneLine(faq.a), '');
        }
    }

    if (alternatives.length > 0) {
        lines.push('## Top alternatives', '');
        for (const alt of alternatives) {
            const altName = alt.enriched?.name ?? alt.name;
            lines.push(`- [${altName}](${SITE}/tools/${alt.slug}) (${humanizePricing(alt.enriched?.pricing)}) — ${oneLine(alt.enriched?.bestFor ?? alt.enriched?.description ?? alt.notes)}`);
        }
        if (hasAlternativesPage(tool.slug)) {
            lines.push(`- Full alternatives guide: ${SITE}/tools/${tool.slug}/alternatives`);
        }
        lines.push('');
    }

    if (comparisons.length > 0) {
        lines.push('## Head-to-head comparisons', '');
        for (const c of comparisons) {
            lines.push(`- [${c.toolA.name} vs ${c.toolB.name}](${SITE}/compare/${c.slug}) (Markdown: ${SITE}/compare/${c.slug}.md)`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Markdown mirror of a category page (/category/<slug>.md) for LLM and answer-engine consumers. */
export function categoryPageMarkdown(category: CategoryInfo): string {
    const lastUpdated = maxLastUpdated(category.tools.map(t => t.enriched?.lastUpdated));
    const updatedLabel = lastUpdated ? formatDate(lastUpdated) : null;
    const lines: string[] = [
        `# ${category.name} — AI Coding Tools Directory`,
        '',
        `> ${oneLine(category.description || `${category.tools.length} curated ${category.name} tools with pricing, features, and verdicts.`)}`,
        '',
        `Source: ${SITE}/category/${category.slug}${updatedLabel ? ` · Updated ${updatedLabel}` : ''} · ${category.tools.length} tools · Published by dosa.dev`,
        '',
        '## Comparison table',
        '',
        '| # | Tool | Company | Pricing | Summary |',
        '|---|---|---|---|---|',
    ];

    category.tools.forEach((t, idx) => {
        const name = escapeCell(t.enriched?.name ?? t.name);
        const company = escapeCell(t.enriched?.company ?? t.company);
        const pricing = humanizePricing(t.enriched?.pricing);
        const summary = escapeCell(t.enriched?.bestFor ?? t.enriched?.description ?? t.notes);
        lines.push(`| ${idx + 1} | [${name}](${SITE}/tools/${t.slug}) | ${company} | ${pricing} | ${summary} |`);
    });

    lines.push('', '## Tools in this category', '');
    category.tools.forEach((t, idx) => {
        const name = t.enriched?.name ?? t.name;
        const body = oneLine(t.enriched?.verdict ?? t.enriched?.description ?? t.notes);
        lines.push(
            `### ${idx + 1}. ${name}`,
            '',
            body,
            '',
            `- Review: ${SITE}/tools/${t.slug} (Markdown: ${SITE}/tools/${t.slug}.md)`,
        );
        if (hasPricingPage(t.slug)) lines.push(`- Pricing: ${SITE}/tools/${t.slug}/pricing`);
        if (hasAlternativesPage(t.slug)) lines.push(`- Alternatives: ${SITE}/tools/${t.slug}/alternatives`);
        lines.push('');
    });

    return lines.join('\n');
}
