interface BriefEntry {
    id: string;
    data: { pubDate: Date; draft?: boolean; tags?: string[] };
}

export function getBriefNavigation<T extends BriefEntry>(entries: T[], currentId: string): { previous?: T; next?: T } {
    const briefs = entries
        .filter(entry => !entry.data.draft && entry.data.tags?.includes('news'))
        .sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf() || a.id.localeCompare(b.id));
    const index = briefs.findIndex(entry => entry.id === currentId);
    if (index === -1) return {};
    return { previous: briefs[index - 1], next: briefs[index + 1] };
}
