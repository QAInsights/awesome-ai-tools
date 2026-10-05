/**
 * Alternatives page helpers - ranking, "why switch" copy, SEO metadata, and
 * blog cross-links for /tools/[slug]/alternatives. Copy is derived strictly
 * from enriched data (bestFor / notIdealFor), never invented.
 */

import { truncate } from './compare';
import { isOpenSource } from './tool-faqs';
import type { Tool } from './tools';

const MAX_TITLE = 65;
const MAX_DESCRIPTION = 155;

function nameOf(tool: Tool): string {
    return tool.enriched?.name?.trim() || tool.name;
}

function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
}

function stripPeriod(text: string): string {
    return text.replace(/[.\s]+$/, '');
}

/** Alternatives with a head-to-head compare page first, otherwise input order (enriched-first). */
export function rankAlternatives(alternatives: Tool[], comparedSlugs: ReadonlySet<string>): Tool[] {
    return [...alternatives].sort((a, b) => Number(comparedSlugs.has(b.slug)) - Number(comparedSlugs.has(a.slug)));
}

/** "Why switch" line for one alternative, from its bestFor. Empty when not enriched. */
export function whySwitch(alt: Tool, max = 160): string {
    const bestFor = alt.enriched?.bestFor?.trim();
    return bestFor ? truncate(bestFor, max) : '';
}

/** Why people look past the subject tool, from its notIdealFor. Empty when not enriched. */
export function switchReason(tool: Tool, max = 200): string {
    const notIdealFor = tool.enriched?.notIdealFor?.trim();
    return notIdealFor ? `${nameOf(tool)} is not ideal for ${lowerFirst(stripPeriod(truncate(notIdealFor, max)))}.` : '';
}

export function openSourceLabel(tool: Tool): 'Yes' | 'No' {
    return isOpenSource(tool.enriched) || /\bopen[- ]source\b/i.test(tool.notes) ? 'Yes' : 'No';
}

/** Title/description targeting "best {X} alternative" and "{X} alternatives" queries. */
export function buildAlternativesSeo(tool: Tool, alternatives: Tool[], year = new Date().getUTCFullYear()): { title: string; description: string } {
    const name = nameOf(tool);
    const count = alternatives.length;
    const title = [
        `Best ${name} Alternatives (${year}): ${count} Tools Compared`,
        `Best ${name} Alternatives (${year}): Top ${Math.min(count, 5)}`,
        `Best ${name} Alternatives (${year})`,
    ].find(candidate => candidate.length <= MAX_TITLE) ?? `${name} Alternatives (${year})`;

    const names = alternatives.slice(0, 3).map(nameOf);
    const tail = ` by pricing, open source, and best fit.`;
    let description = '';
    while (names.length) {
        const more = count - names.length;
        const list = more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ');
        description = `Looking for the best ${name} alternative? Compare ${list}${tail}`;
        if (description.length <= MAX_DESCRIPTION) break;
        names.pop();
        description = '';
    }
    if (!description) description = truncate(`Looking for the best ${name} alternative? Compare ${count} ${tool.categoryShort} tools${tail}`, MAX_DESCRIPTION);
    return { title, description };
}

export interface BlogPostRef {
    id: string;
    body?: string;
    data: { title: string; pubDate: Date; tags?: string[] };
}

/**
 * Blog posts that link to /tools/{slug} (or its sub-pages), evergreen posts
 * before news, then by number of links and recency.
 */
export function blogPostsLinkingTo<T extends BlogPostRef>(posts: T[], slug: string, limit = 3): T[] {
    const pattern = new RegExp(`/tools/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`, 'g');
    return posts
        .map(post => ({ post, links: (post.body ?? '').match(pattern)?.length ?? 0, news: (post.data.tags ?? []).includes('news') }))
        .filter(entry => entry.links > 0)
        .sort((a, b) => Number(a.news) - Number(b.news) || b.links - a.links || b.post.data.pubDate.getTime() - a.post.data.pubDate.getTime())
        .slice(0, limit)
        .map(entry => entry.post);
}
