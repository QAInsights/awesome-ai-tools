import type { Tool } from './tools';
import type {
    OwnedStack,
    PublicStack,
    PublicStackResult,
    SitemapStack,
    StackItem,
    StackSummary,
} from './server/stacks-repository';
import type { UsernameUser } from './server/username-repository';

export interface VisibleStackItem {
    item: StackItem;
    tool: Tool;
}

export interface StackAccount {
    user: UsernameUser;
    redirectTo?: string;
}

export function getUsernameCaseRedirect(username: string, slug?: string): string | null {
    const canonicalUsername = username.toLowerCase();
    if (canonicalUsername === username) return null;
    const path = `/u/${encodeURIComponent(canonicalUsername)}`;
    return slug === undefined ? path : `${path}/${encodeURIComponent(slug)}`;
}

export type StackPageRoute =
    | { type: 'redirect'; url: string }
    | { type: 'not_found' }
    | {
        type: 'render';
        stack: OwnedStack | PublicStack;
        username: string;
        displayName: string;
        isOwner: boolean;
        isPrivate: boolean;
    };

export function resolveStackPage(input: {
    publicResult: PublicStackResult;
    account: StackAccount | null;
    ownedStack?: OwnedStack | null;
    viewerId?: string | null;
    requestedSlug: string;
}): StackPageRoute {
    const { account, publicResult, requestedSlug, viewerId } = input;
    if (publicResult.status === 'redirect') {
        return {
            type: 'redirect',
            url: `/u/${encodeURIComponent(publicResult.username)}/${encodeURIComponent(publicResult.slug)}`,
        };
    }

    const isAccountOwner = Boolean(account && viewerId === account.user.id);
    const stack = publicResult.status === 'found'
        ? publicResult.stack
        : isAccountOwner ? input.ownedStack ?? null : null;

    if (!stack && account?.redirectTo) {
        return {
            type: 'redirect',
            url: `/u/${encodeURIComponent(account.redirectTo)}/${encodeURIComponent(requestedSlug)}`,
        };
    }
    if (!stack) return { type: 'not_found' };

    const isOwner = viewerId === stack.userId;
    const isPrivate = !stack.isPublic;
    if (isPrivate && !isOwner) return { type: 'not_found' };
    const username = publicResult.status === 'found'
        ? publicResult.stack.username
        : account?.user.username ?? '';
    const displayName = publicResult.status === 'found'
        ? publicResult.stack.displayName
        : account?.user.displayName || account?.user.githubUsername || username;
    return { type: 'render', stack, username, displayName, isOwner, isPrivate };
}

export function getVisibleStackItems(
    items: StackItem[],
    lookupTool: (slug: string) => Tool | undefined,
): VisibleStackItem[] {
    return items.flatMap(item => {
        if (!item.enabled) return [];
        const tool = lookupTool(item.slug);
        return tool ? [{ item, tool }] : [];
    });
}

export function createStackPageData(input: {
    stack: Pick<StackSummary, 'title' | 'slug' | 'description' | 'updatedAt'>;
    username: string;
    displayName: string;
    visibleItems: VisibleStackItem[];
    isPrivate: boolean;
    formatDate: (iso: string) => string;
}) {
    const { displayName, formatDate, isPrivate, stack, username, visibleItems } = input;
    const pageUrl = `https://ai.dosa.dev/u/${encodeURIComponent(username)}/${encodeURIComponent(stack.slug)}`;
    const pageTitle = `${stack.title} — ${displayName}'s AI tool stack | ai.dosa.dev`;
    const pageDescription = stack.description
        || `${visibleItems.length} AI tools used by ${displayName} in this curated tool stack.`;
    const updatedIso = new Date(stack.updatedAt).toISOString();
    const freeCount = visibleItems.filter(({ tool }) => (
        /free|freemium|open[-_ ]?source|^oss$/i.test(tool.enriched?.pricing ?? '')
    )).length;
    const categoryCount = new Set(visibleItems.map(({ tool }) => tool.categoryShort)).size;
    const facts = [
        { key: 'Tools', value: String(visibleItems.length) },
        { key: 'Free tier or open source', value: String(freeCount) },
        { key: 'Categories', value: String(categoryCount) },
        { key: 'Updated', value: formatDate(updatedIso) },
    ];
    const noindex = isPrivate || visibleItems.length === 0;
    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                '@id': `${pageUrl}#collection`,
                url: pageUrl,
                name: stack.title,
                description: pageDescription,
                inLanguage: 'en',
                dateModified: updatedIso,
                author: { '@type': 'Person', name: displayName },
                mainEntity: { '@id': `${pageUrl}#items` },
                isPartOf: {
                    '@type': 'WebSite',
                    '@id': 'https://ai.dosa.dev/#website',
                    url: 'https://ai.dosa.dev',
                    name: 'ai.dosa.dev - Awesome AI Tools',
                },
            },
            {
                '@type': 'ItemList',
                '@id': `${pageUrl}#items`,
                name: stack.title,
                itemListOrder: 'https://schema.org/ItemListOrderAscending',
                numberOfItems: visibleItems.length,
                itemListElement: visibleItems.map(({ tool }, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: tool.enriched?.name ?? tool.name,
                    url: `https://ai.dosa.dev/tools/${tool.slug}`,
                })),
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai.dosa.dev' },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: `${displayName}'s tool stacks`,
                        item: `https://ai.dosa.dev/u/${encodeURIComponent(username)}`,
                    },
                    { '@type': 'ListItem', position: 3, name: stack.title, item: pageUrl },
                ],
            },
        ],
    });

    return {
        pageUrl,
        pageTitle,
        pageDescription,
        updatedIso,
        facts,
        jsonLd,
        noindex,
        robots: noindex ? 'noindex, nofollow' : undefined,
    };
}

export type StackProfileRoute =
    | { type: 'redirect'; url: string }
    | { type: 'not_found' }
    | { type: 'render'; username: string; displayName: string };

export function resolveStackProfile(account: StackAccount | null): StackProfileRoute {
    if (!account) return { type: 'not_found' };
    if (account.redirectTo) {
        return { type: 'redirect', url: `/u/${encodeURIComponent(account.redirectTo)}` };
    }
    const username = account.user.username ?? '';
    const displayName = account.user.displayName || account.user.githubUsername || username;
    return { type: 'render', username, displayName };
}

export function createStackProfilePageData(input: {
    username: string;
    displayName: string;
    stacks: Pick<StackSummary, 'slug' | 'title' | 'description' | 'enabledItemCount'>[];
}) {
    const { displayName, stacks, username } = input;
    const pageUrl = `https://ai.dosa.dev/u/${encodeURIComponent(username)}`;
    const title = `${displayName}'s AI tool stacks | ai.dosa.dev`;
    const hasIndexableStack = stacks.some(stack => stack.enabledItemCount > 0);
    const description = stacks.length
        ? `${displayName}'s public collections of AI tools and notes on how they are used.`
        : `${displayName}'s public AI tool profile.`;
    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                '@id': `${pageUrl}#profile`,
                url: pageUrl,
                name: title,
                description,
                author: { '@type': 'Person', name: displayName },
                mainEntity: { '@id': `${pageUrl}#stacks` },
            },
            {
                '@type': 'ItemList',
                '@id': `${pageUrl}#stacks`,
                numberOfItems: stacks.length,
                itemListElement: stacks.map((stack, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: stack.title,
                    url: `https://ai.dosa.dev/u/${encodeURIComponent(username)}/${encodeURIComponent(stack.slug)}`,
                })),
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai.dosa.dev' },
                    { '@type': 'ListItem', position: 2, name: `${displayName}'s tool stacks`, item: pageUrl },
                ],
            },
        ],
    });
    return {
        pageUrl,
        title,
        description,
        robots: hasIndexableStack ? undefined : 'noindex, nofollow',
        jsonLd,
    };
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function buildStackSitemapXml(stacks: SitemapStack[], usernames: string[]): string {
    const urls = new Map<string, string | null>();
    usernames.forEach(username => urls.set(`https://ai.dosa.dev/u/${encodeURIComponent(username)}`, null));
    stacks.forEach(stack => {
        urls.set(
            `https://ai.dosa.dev/u/${encodeURIComponent(stack.username)}/${encodeURIComponent(stack.slug)}`,
            new Date(stack.updatedAt).toISOString(),
        );
    });
    const entries = [...urls.entries()].map(([loc, lastmod]) => `
    <url>
        <loc>${escapeXml(loc)}</loc>${lastmod ? `
        <lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
    </url>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</urlset>`;
}
