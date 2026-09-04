import { parseNewsPost, type NewsPost } from './news-source';

const files = import.meta.glob('../../content/blog/today-in-ai-*.mdx', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export function getNewsPostForDate(date: string): NewsPost | null {
    const id = `today-in-ai-${date}`;
    const entry = Object.entries(files).find(([path]) => path.endsWith(`${id}.mdx`));
    return entry ? parseNewsPost(id, entry[1]) : null;
}
