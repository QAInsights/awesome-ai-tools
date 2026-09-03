import rss from '@astrojs/rss';
import { getAllTools } from '../../lib/tools';

export function GET(context) {
    const items = [...getAllTools()]
        .sort((a, b) => {
            const aParsed = a.enriched?.lastUpdated ? Date.parse(a.enriched.lastUpdated) : Number.NEGATIVE_INFINITY;
            const bParsed = b.enriched?.lastUpdated ? Date.parse(b.enriched.lastUpdated) : Number.NEGATIVE_INFINITY;
            const aTime = Number.isNaN(aParsed) ? Number.NEGATIVE_INFINITY : aParsed;
            const bTime = Number.isNaN(bParsed) ? Number.NEGATIVE_INFINITY : bParsed;
            return bTime - aTime || a.name.localeCompare(b.name);
        })
        .map(tool => ({
            title: tool.name,
            link: `/tools/${tool.slug}`,
            description: tool.enriched?.description ?? tool.notes ?? '',
            ...(tool.enriched?.recentUpdates ? { content: tool.enriched.recentUpdates } : {}),
            categories: [...new Set([tool.categoryClean, ...(tool.enriched?.tags ?? [])])],
            ...(tool.enriched?.lastUpdated ? { pubDate: new Date(tool.enriched.lastUpdated) } : {}),
        }));

    return rss({
        title: 'AI developer tools on ai.dosa.dev',
        description: 'Every tool in the directory, most recently updated first, with the latest enrichment summary.',
        site: context.site,
        items,
        customData: '<language>en-us</language>',
    });
}
