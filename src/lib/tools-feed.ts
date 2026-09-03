import type { Tool } from './tools';

export interface ToolsFeedItem {
    id: string;
    url: string;
    external_url?: string;
    title: string;
    summary: string;
    content_text: string;
    date_modified?: string;
    tags: string[];
}

export interface ToolsFeed {
    version: 'https://jsonfeed.org/version/1.1';
    title: string;
    home_page_url: string;
    feed_url: string;
    description: string;
    language: 'en';
    items: ToolsFeedItem[];
}

function updateTime(value?: string): number {
    if (!value) return -Infinity;
    const time = Date.parse(value);
    return Number.isNaN(time) ? -Infinity : time;
}

export function buildToolsFeed(tools: Tool[], site: string): ToolsFeed {
    const base = site.replace(/\/+$/, '');
    const items = [...tools]
        .sort((a, b) => {
            const updateDifference = updateTime(b.enriched?.lastUpdated) - updateTime(a.enriched?.lastUpdated);
            return updateDifference || a.name.localeCompare(b.name);
        })
        .map(tool => {
            const summary = tool.enriched?.description ?? tool.notes ?? '';
            const contentText = tool.enriched?.recentUpdates ?? summary;
            const tags = [...new Set([tool.categoryClean, ...(tool.enriched?.tags ?? [])].filter(Boolean))];
            return {
                id: `${base}/tools/${tool.slug}`,
                url: `${base}/tools/${tool.slug}`,
                ...(tool.url ? { external_url: tool.url } : {}),
                title: tool.name,
                summary,
                content_text: contentText,
                ...(tool.enriched?.lastUpdated
                    ? { date_modified: `${tool.enriched.lastUpdated}T00:00:00Z` }
                    : {}),
                tags,
            };
        });

    return {
        version: 'https://jsonfeed.org/version/1.1',
        title: 'AI developer tools on ai.dosa.dev',
        home_page_url: `${base}/`,
        feed_url: `${base}/tools/feed.json`,
        description: 'Every tool in the directory, most recently updated first. Each item carries the latest enrichment summary.',
        language: 'en',
        items,
    };
}
