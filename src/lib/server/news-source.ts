export interface NewsPost {
    id: string;
    date: string;
    title: string;
    description: string;
    intro: string[];
    items: {
        heading: string;
        whatHappened: string;
        whyItMatters: string;
        sourceLabel: string;
        sourceUrl: string;
    }[];
}

function stripMarkup(value: string): string {
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/\*\*/g, '')
        .replace(/[`*]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readFrontmatter(raw: string): { metadata: string; body: string } | null {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    return match ? { metadata: match[1], body: match[2] } : null;
}

function frontmatterValue(metadata: string, key: string): string {
    const match = metadata.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2') ?? '';
}

function sectionField(section: string, label: string): string {
    const match = section.match(new RegExp(
        `\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*(?:What happened|Why it matters):\\*\\*|\\n\\s*\\[Source:|$)`,
    ));
    return match ? stripMarkup(match[1]) : '';
}

function sourceField(section: string): { sourceLabel: string; sourceUrl: string } {
    const match = section.match(/\[Source:\s*([^\]]+)\]\(\s*<?([^)>]+)>?\s*\)/);
    return match
        ? { sourceLabel: stripMarkup(match[1]), sourceUrl: match[2].trim() }
        : { sourceLabel: '', sourceUrl: '' };
}

export function parseNewsPost(id: string, raw: string): NewsPost | null {
    const parsed = readFrontmatter(raw);
    if (!parsed || frontmatterValue(parsed.metadata, 'draft') === 'true') return null;

    const dateMatch = id.match(/today-in-ai-(\d{4}-\d{2}-\d{2})$/);
    const date = dateMatch?.[1] ?? '';
    const firstSection = parsed.body.search(/^##\s+/m);
    const introBody = firstSection >= 0 ? parsed.body.slice(0, firstSection) : parsed.body;
    const intro = introBody
        .split(/\n\s*\n/)
        .map(paragraph => stripMarkup(paragraph))
        .filter(Boolean);
    const headings = [...parsed.body.matchAll(/^##\s+(.+?)\s*$/gm)];
    const items = headings
        .map((heading, index) => {
            const sectionStart = (heading.index ?? 0) + heading[0].length;
            const sectionEnd = headings[index + 1]?.index ?? parsed.body.length;
            const section = parsed.body.slice(sectionStart, sectionEnd);
            const source = sourceField(section);
            return {
                heading: stripMarkup(heading[1]),
                whatHappened: sectionField(section, 'What happened'),
                whyItMatters: sectionField(section, 'Why it matters'),
                ...source,
            };
        })
        .filter(item => item.heading.toLowerCase() !== 'sources');

    return {
        id,
        date,
        title: stripMarkup(frontmatterValue(parsed.metadata, 'title')),
        description: stripMarkup(frontmatterValue(parsed.metadata, 'description')),
        intro,
        items,
    };
}

export function renderNewsPostHtml(post: NewsPost): string {
    const intro = post.intro
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
    const items = post.items
        .map(item => {
            const whyItMatters = item.whyItMatters
                ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>`
                : '';
            const source = item.sourceUrl
                ? `<p><a href="${escapeHtml(item.sourceUrl)}">Source: ${escapeHtml(item.sourceLabel)}</a></p>`
                : '';
            return [
                `<h2>${escapeHtml(item.heading)}</h2>`,
                `<p><strong>What happened:</strong> ${escapeHtml(item.whatHappened)}</p>`,
                whyItMatters,
                source,
            ].join('');
        })
        .join('');
    const closingLink = escapeHtml(`https://ai.dosa.dev/blog/${encodeURIComponent(post.id)}/`);
    return `${intro}${items}<p><a href="${closingLink}">Read the full brief on ai.dosa.dev</a></p>`;
}

export function utcDateString(milliseconds: number): string {
    return new Date(milliseconds).toISOString().slice(0, 10);
}
