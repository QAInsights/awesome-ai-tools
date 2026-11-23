const GENERIC_NAMES = new Set([
    'agent skills', 'agent substrate', 'amp', 'ante', 'atlas', 'beacon', 'bob', 'coder', 'conductor', 'continue',
    'crush', 'cubic', 'delta', 'director', 'entire', 'executor', 'gauge', 'genie',
    'goose', 'headroom', 'hindsight', 'magnitude', 'muse',
    'nod', 'pantry', 'parallel code', 'reason', 'replicas', 'space', 'superpowers', 'sweep',
    'tale', 'traces', 'void', 'warp', 'wave', 'whiteboard', 'zero',
]);

const ALIASES: Record<string, string> = {
    'VS Code': 'visual-studio-code',
    'Warp terminal': 'warp',
    'Goose agent': 'goose',
};

const DISTINCTIVE_BRANDS = new Set([
    'Aider', 'Antigravity', 'Base44', 'Bolt.new', 'ChatGPT', 'Claude', 'Cline',
    'CodeRabbit', 'Codebuff', 'Cursor', 'DeepSeek', 'Devin', 'Gemini', 'Greptile',
    'Lovable', 'Manus', 'OpenClaw', 'OpenCode', 'OpenHands', 'Perplexity', 'Qodo',
    'QwenCloud', 'Replit', 'Supermaven', 'Tabnine', 'TokenEconomizer', 'Trae',
]);

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
        const singleWord = !/\s/.test(name);
        if (singleWord && !DISTINCTIVE_BRANDS.has(name)) return [];
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(name)}(?![\\p{L}\\p{N}_])`, singleWord ? 'gu' : 'giu');
        return [...text.matchAll(pattern)].map(match => {
            const start = match.index!;
            const end = start + match[0].length;
            return { start, end, tool };
        });
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
