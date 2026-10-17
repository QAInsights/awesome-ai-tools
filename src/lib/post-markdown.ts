/**
 * Markdown rendition of a blog / Today in AI post.
 *
 * Shared by the "Copy for LLM" button on /blog/[id] and the /blog/[id].md
 * mirror so both always emit identical text for LLM and answer-engine use.
 */
export interface MarkdownPost {
  id: string;
  body?: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    author: string;
  };
}

const SITE = 'https://ai.dosa.dev';

export function postUrl(id: string): string {
  return `${SITE}/blog/${id}`;
}

export function postMarkdown(post: MarkdownPost): string {
  const { title, description, pubDate, author } = post.data;
  return [
    `# ${title}`,
    '',
    `> ${description}`,
    '',
    `Source: ${postUrl(post.id)}`,
    `Published: ${pubDate.toISOString().slice(0, 10)}`,
    `Author: ${author}`,
    '',
    '---',
    '',
    post.body?.trim() ?? '',
  ].join('\n');
}
