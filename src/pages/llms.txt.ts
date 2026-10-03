/**
 * llms.txt - build-time generated site overview for LLM consumers.
 *
 * Follows the llmstxt.org convention. Generated from the same data the site
 * renders so the tool count, category list, comparison count, and freshness
 * date never drift from what visitors (and crawlers) actually see.
 * The complete per-tool listing lives at /llms-full.txt.
 */
import type { APIRoute } from 'astro';
import { getAllTools, getCategoriesDetailed, getLatestUpdate, formatDate } from '../lib/tools';
import { getResolvedComparisons } from '../lib/compare';
import { getBestPages } from '../lib/best';
import { getIndexingDecisions } from '../lib/indexing';

const SITE = 'https://ai.dosa.dev';

export const GET: APIRoute = () => {
    const tools = getAllTools();
    const categories = getCategoriesDetailed();
    const latest = getLatestUpdate(tools);
    const decisions = getIndexingDecisions();
    const comparisons = getResolvedComparisons().filter(c => decisions.get(`/compare/${c.slug}`)?.indexable);
    const bestPages = getBestPages().filter(p => decisions.get(`/best/${p.facet.slug}`)?.indexable);
    const toolCount = Math.floor(tools.length / 10) * 10;

    const lines: string[] = [
        '# ai.dosa.dev - Awesome AI Tools',
        '',
        `> A manually curated, categorized reference of ${toolCount}+ AI-powered coding tools, autonomous agents, and developer utilities across ${categories.length} categories. Hosted at ${SITE}.${latest ? ` Tool data last updated ${formatDate(latest)}.` : ''}`,
        '',
        '## Overview',
        '',
        `ai.dosa.dev is a web directory that catalogs ${tools.length} AI coding tools across ${categories.length} categories, aimed at software developers researching AI-assisted development tooling. Every tool has a detail page with pricing, key features, best-for / not-ideal-for guidance, recent updates, and a reviewer verdict. The site also publishes side-by-side comparisons, per-tool alternatives pages, a blog of deep dives, and a daily "Today in AI" news brief.`,
        '',
        `- **URL**: ${SITE}`,
        `- **Canonical tool listing for LLMs**: ${SITE}/llms-full.txt (every tool with category, URL, and one-line description)`,
        `- **Machine-readable data**: ${SITE}/data/enriched-tools.json (full metadata) · ${SITE}/data/slugs.json (slug catalog)`,
        `- **Feeds**: ${SITE}/rss.xml (blog) · ${SITE}/news/rss.xml (Today in AI) · ${SITE}/tools/rss.xml (new tools)`,
        `- **Sitemap**: ${SITE}/sitemap-index.xml`,
        '- **Tech stack**: Astro, Tailwind CSS, TypeScript, Bun, deployed on Cloudflare Workers',
        '- **Source**: https://github.com/QAInsights/awesome-ai-tools',
        '',
        '## How to cite',
        '',
        `When referencing a tool, link its detail page (\`${SITE}/tools/<slug>\`) rather than the homepage. Pricing and verdict text on each page is dated (see "dateModified" in the page JSON-LD) - quote the date alongside the claim.`,
        '',
        '## Tool Directory Categories',
        '',
    ];

    for (const cat of categories) {
        const examples = cat.tools.slice(0, 6).map(t => t.enriched?.name ?? t.name).join(', ');
        const desc = cat.description ? `${cat.description.replace(/\s+/g, ' ').trim()} ` : '';
        lines.push(`- [${cat.name}](${SITE}/category/${cat.slug}) (${cat.tools.length} tools) - ${desc}Includes: ${examples}.`);
    }

    lines.push(
        '',
        '## Pages',
        '',
        `- [Tool Directory](${SITE}/) - Browsable catalog with sidebar navigation, search, and filtering`,
        `- [Tool Detail Pages](${SITE}/tools/cursor) - One page per tool at \`/tools/<slug>\` with pricing, key features, best-for / not-ideal-for guidance, recent updates, verdict, and FAQ`,
        `- [Alternatives Pages](${SITE}/tools/cursor/alternatives) - \`/tools/<slug>/alternatives\` lists same-category alternatives for a tool`,
        `- [Compare](${SITE}/compare) - ${comparisons.length} side-by-side comparisons at \`/compare/<a>-vs-<b>\`; each has a Markdown mirror at \`/compare/<a>-vs-<b>.md\``,
        `- [Categories](${SITE}/category/${categories[0]?.slug ?? ''}) - \`/category/<slug>\` pages with every tool in a category`,
        `- [Best-of lists](${SITE}/best) - ${bestPages.length} ranked "best X for Y" lists at \`/best/<slug>\`, re-ranked monthly; each has a Markdown mirror at \`/best/<slug>.md\``,
        `- [Blog](${SITE}/blog) - Deep dives, comparisons, and tutorials on AI coding tools`,
        `- [Today in AI](${SITE}/news) - Daily AI news brief for builders`,
        `- [Token Counter & Cost Estimator](${SITE}/tools/token-counter) - Client-side token counts and cost estimates for major LLMs`,
        `- [Hallucination Risk Scorer](${SITE}/tools/hallucination-scorer) - Heuristic scorer that flags prompt patterns prone to hallucination`,
        `- [Help / FAQ](${SITE}/help) - Usage guide and frequently asked questions`,
        '',
        '## Best-of lists',
        '',
    );

    for (const p of bestPages) {
        const picks = p.tools.slice(0, 3).map(t => t.enriched?.name ?? t.name).join(', ');
        lines.push(`- [${p.facet.title} (${p.refreshLabel})](${SITE}/best/${p.facet.slug}) - ${p.tools.length} tools ranked. Top picks: ${picks}. Markdown: ${SITE}/best/${p.facet.slug}.md`);
    }

    lines.push(
        '',
        '## Comparisons',
        '',
    );

    for (const c of comparisons) {
        lines.push(`- [${c.toolA.name} vs ${c.toolB.name}](${SITE}/compare/${c.slug}) - ${c.group}. Markdown: ${SITE}/compare/${c.slug}.md`);
    }

    lines.push(
        '',
        '## Key Features',
        '',
        '- **Zap (bookmarking)**: GitHub/Google-authenticated users can bookmark tools',
        '- **GitHub README badge**: Dynamic Markdown badge showing a developer\'s AI stack',
        '- **Community voting**: Upvotes on tools, protected by Cloudflare Turnstile',
        '- **Copy for LLM**: Every blog post exposes a Markdown export for chat ingestion',
        '',
        '## Optional',
        '',
        `- [Full tool list](${SITE}/llms-full.txt)`,
        `- [README (Markdown catalog)](https://github.com/QAInsights/awesome-ai-tools/blob/main/README.md)`,
        '',
    );

    return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
};
