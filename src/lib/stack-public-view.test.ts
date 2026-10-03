import { describe, expect, test } from 'bun:test';
import {
    buildStackSitemapXml,
    createStackPageData,
    createStackProfilePageData,
    getUsernameCaseRedirect,
    getVisibleStackItems,
    resolveStackPage,
    resolveStackProfile,
} from './stack-public-view';
import type { Tool } from './tools';
import type { OwnedStack, PublicStack } from './server/stacks-repository';
import type { StackAccount } from './stack-public-view';

const tools: Tool[] = [
    {
        slug: 'cursor',
        name: 'Cursor',
        company: 'Anysphere',
        category: 'AI IDEs',
        categoryClean: 'AI IDEs',
        categoryShort: 'AI IDEs',
        notes: '',
        url: 'https://cursor.com',
        enriched: { slug: 'cursor', name: 'Cursor', pricing: 'freemium' },
    },
    {
        slug: 'zed',
        name: 'Zed',
        company: 'Zed',
        category: 'Editors',
        categoryClean: 'Editors',
        categoryShort: 'Editors',
        notes: '',
        url: 'https://zed.dev',
        enriched: { slug: 'zed', pricing: 'free' },
    },
];

const account: StackAccount = {
    user: {
        id: 'user-1',
        username: 'ada',
        displayName: 'Ada Lovelace',
        githubUsername: 'ada-l',
    },
};

function stack(overrides: Partial<OwnedStack> = {}): OwnedStack {
    return {
        id: 'stack-1',
        userId: 'user-1',
        slug: 'my-stack',
        title: 'My stack',
        description: 'A useful collection',
        isPublic: true,
        createdAt: 10,
        updatedAt: 20,
        itemCount: 3,
        enabledItemCount: 2,
        items: [
            { slug: 'cursor', position: 0, purpose: 'Build', usageNotes: 'Plan first', enabled: true },
            { slug: 'zed', position: 1, purpose: 'Review', usageNotes: null, enabled: false },
            { slug: 'removed-tool', position: 2, purpose: 'Legacy', usageNotes: null, enabled: true },
        ],
        ...overrides,
    };
}

describe('public stack page data', () => {
    test('keeps only enabled catalog tools and excludes removed slugs', () => {
        const visible = getVisibleStackItems(stack().items, slug => tools.find(tool => tool.slug === slug));

        expect(visible.map(({ item, tool }) => [item.slug, tool.slug])).toEqual([['cursor', 'cursor']]);
    });

    test('shapes stack facts, JSON-LD, and indexability', () => {
        const visibleItems = getVisibleStackItems(stack().items, slug => tools.find(tool => tool.slug === slug));
        const page = createStackPageData({
            stack: stack(),
            username: 'ada',
            displayName: 'Ada Lovelace',
            visibleItems,
            isPrivate: false,
            formatDate: () => 'Jan 1, 1970',
        });
        const graph = JSON.parse(page.jsonLd)['@graph'];

        expect(page.pageUrl).toBe('https://ai.dosa.dev/u/ada/my-stack');
        expect(page.pageTitle).toBe("My stack — Ada Lovelace's AI tool stack | ai.dosa.dev");
        expect(page.pageDescription).toBe('A useful collection');
        expect(page.facts).toEqual([
            { key: 'Tools', value: '1' },
            { key: 'Free tier or open source', value: '1' },
            { key: 'Categories', value: '1' },
            { key: 'Updated', value: 'Jan 1, 1970' },
        ]);
        expect(page.noindex).toBe(false);
        expect(page.robots).toBeUndefined();
        expect(graph[0].author).toEqual({ '@type': 'Person', name: 'Ada Lovelace' });
        expect(graph[1].itemListElement).toEqual([{
            '@type': 'ListItem',
            position: 1,
            name: 'Cursor',
            url: 'https://ai.dosa.dev/tools/cursor',
        }]);
        expect(graph[2]['@type']).toBe('BreadcrumbList');
    });

    test('noindexes stacks without any visible catalog tools and private stacks', () => {
        const emptyItems = getVisibleStackItems(
            stack().items.map(item => ({ ...item, enabled: false })),
            slug => tools.find(tool => tool.slug === slug),
        );
        const emptyPage = createStackPageData({
            stack: stack(),
            username: 'ada',
            displayName: 'Ada Lovelace',
            visibleItems: emptyItems,
            isPrivate: false,
            formatDate: () => 'Jan 1, 1970',
        });
        const privatePage = createStackPageData({
            stack: stack(),
            username: 'ada',
            displayName: 'Ada Lovelace',
            visibleItems: getVisibleStackItems(stack().items, slug => tools.find(tool => tool.slug === slug)),
            isPrivate: true,
            formatDate: () => 'Jan 1, 1970',
        });

        expect(emptyPage.noindex).toBe(true);
        expect(emptyPage.robots).toBe('noindex, nofollow');
        expect(JSON.parse(emptyPage.jsonLd)['@graph'][1].numberOfItems).toBe(0);
        expect(privatePage.robots).toBe('noindex, nofollow');
    });
});

describe('stack profile and redirect data', () => {
    test('resolves public stack redirects, owner-private views, and missing stacks', () => {
        const publicStack = {
            ...stack(),
            username: 'ada',
            displayName: 'Ada Lovelace',
        } satisfies PublicStack;
        const ownedStack = stack({ isPublic: false });

        expect(resolveStackPage({
            publicResult: { status: 'redirect', username: 'ada-new', slug: 'my-stack-new' },
            account,
            requestedSlug: 'old-stack',
        })).toEqual({ type: 'redirect', url: '/u/ada-new/my-stack-new' });
        expect(resolveStackPage({
            publicResult: { status: 'not_found' },
            account,
            ownedStack,
            viewerId: 'user-1',
            requestedSlug: 'my-stack',
        })).toMatchObject({ type: 'render', isOwner: true, isPrivate: true });
        expect(resolveStackPage({
            publicResult: { status: 'found', stack: publicStack },
            account,
            viewerId: 'other-user',
            requestedSlug: 'my-stack',
        })).toMatchObject({ type: 'render', isOwner: false, isPrivate: false });
        expect(resolveStackPage({
            publicResult: { status: 'not_found' },
            account,
            requestedSlug: 'missing',
        })).toEqual({ type: 'not_found' });
        expect(resolveStackPage({
            publicResult: { status: 'not_found' },
            account: { ...account, redirectTo: 'ada-new' },
            requestedSlug: 'my-stack',
        })).toEqual({ type: 'redirect', url: '/u/ada-new/my-stack' });
    });

    test('redirects historical profile names and noindexes profiles without public stacks', () => {
        expect(resolveStackProfile({ ...account, redirectTo: 'ada-new' }))
            .toEqual({ type: 'redirect', url: '/u/ada-new' });
        expect(resolveStackProfile(null)).toEqual({ type: 'not_found' });

        const emptyProfile = createStackProfilePageData({
            username: 'ada',
            displayName: 'Ada Lovelace',
            stacks: [],
        });
        const profile = createStackProfilePageData({
            username: 'ada',
            displayName: 'Ada Lovelace',
            stacks: [{
                slug: 'my-stack',
                title: 'My stack',
                description: null,
                enabledItemCount: 1,
            }],
        });
        const emptyVisibleProfile = createStackProfilePageData({
            username: 'ada',
            displayName: 'Ada Lovelace',
            stacks: [{
                slug: 'empty-stack',
                title: 'Empty stack',
                description: null,
                enabledItemCount: 0,
            }],
        });
        expect(emptyProfile.robots).toBe('noindex, nofollow');
        expect(JSON.parse(emptyProfile.jsonLd)['@graph'][1].numberOfItems).toBe(0);
        expect(emptyVisibleProfile.robots).toBe('noindex, nofollow');
        expect(profile.robots).toBeUndefined();
        expect(JSON.parse(profile.jsonLd)['@graph'][1].itemListElement[0].url)
            .toBe('https://ai.dosa.dev/u/ada/my-stack');
    });

    test('redirects mixed-case usernames to lowercase profile and stack paths', () => {
        expect(getUsernameCaseRedirect('Some-User')).toBe('/u/some-user');
        expect(getUsernameCaseRedirect('Some-User', 'My-Stack')).toBe('/u/some-user/My-Stack');
        expect(getUsernameCaseRedirect('some-user', 'my-stack')).toBeNull();
    });

    test('builds profile and public-stack sitemap URLs with lastmod', () => {
        const xml = buildStackSitemapXml(
            [{ username: 'ada', slug: 'my-stack', updatedAt: 0 }],
            ['ada'],
        );

        expect(xml).toContain('<loc>https://ai.dosa.dev/u/ada</loc>');
        expect(xml).toContain('<loc>https://ai.dosa.dev/u/ada/my-stack</loc>');
        expect(xml).toContain('<lastmod>1970-01-01T00:00:00.000Z</lastmod>');
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });
});
