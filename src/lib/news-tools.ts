const GENERIC_NAMES = new Set([
    'amp', 'ante', 'atlas', 'beacon', 'bob', 'coder', 'conductor', 'continue',
    'crush', 'cubic', 'delta', 'director', 'entire', 'executor', 'gauge', 'genie',
    'goose', 'headroom', 'hindsight', 'magnitude', 'muse',
    'nod', 'pantry', 'reason', 'replicas', 'space', 'superpowers', 'sweep',
    'tale', 'traces', 'void', 'warp', 'wave', 'whiteboard', 'zero',
]);

const ALIASES: Record<string, string> = {
    'VS Code': 'visual-studio-code',
    'Warp terminal': 'warp',
    'Goose agent': 'goose',
};

interface NamedTool {
    slug: string;
    name: string;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchNewsTools<T extends NamedTool>(body: string, catalog: T[], override?: string[]): T[] {
    const bySlug = new Map(catalog.map(tool => [tool.slug, tool]));
    if (override !== undefined) {
        return [...new Set(override)].flatMap(slug => bySlug.get(slug) ?? []).slice(0, 6);
    }

    const text = body
        .replace(/```[\s\S]*?```|`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/[^\s<>]+|<[^>]*>/g, ' ');
    const names = [
        ...catalog
            .filter(tool => tool.name.trim().length >= 3 && !GENERIC_NAMES.has(tool.name.toLowerCase()))
            .map(tool => ({ name: tool.name, tool })),
        ...Object.entries(ALIASES).flatMap(([name, slug]) => {
            const tool = bySlug.get(slug);
            return tool ? [{ name, tool }] : [];
        }),
    ];
    const candidates = names.flatMap(({ name, tool }) => {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(name)}(?![\\p{L}\\p{N}_])`, 'giu');
        return [...text.matchAll(pattern)].map(match => ({ start: match.index!, end: match.index! + match[0].length, tool }));
    }).sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);

    const matches: typeof candidates = [];
    for (const candidate of candidates) {
        if (!matches.some(match => candidate.start < match.end && candidate.end > match.start)) matches.push(candidate);
    }
    matches.sort((a, b) => a.start - b.start);
    const seen = new Set<string>();
    return matches.flatMap(({ tool }) => {
        if (seen.has(tool.slug)) return [];
        seen.add(tool.slug);
        return [tool];
    }).slice(0, 6);
}
