import { describe, expect, test } from 'bun:test';
import { postMarkdown, postUrl } from './post-markdown';

const post = {
  id: 'hello-world',
  body: '\n\nBody paragraph.\n',
  data: {
    title: 'Hello World',
    description: 'A short summary.',
    pubDate: new Date('2026-10-17T04:30:00Z'),
    author: 'Dosa AI Tools',
  },
};

describe('post-markdown', () => {
  test('builds the canonical post URL', () => {
    expect(postUrl('hello-world')).toBe('https://ai.dosa.dev/blog/hello-world');
  });

  test('renders title, summary, source, date, author and trimmed body', () => {
    expect(postMarkdown(post)).toBe([
      '# Hello World',
      '',
      '> A short summary.',
      '',
      'Source: https://ai.dosa.dev/blog/hello-world',
      'Published: 2026-10-17',
      'Author: Dosa AI Tools',
      '',
      '---',
      '',
      'Body paragraph.',
    ].join('\n'));
  });

  test('tolerates a missing body', () => {
    expect(postMarkdown({ ...post, body: undefined }).endsWith('---\n\n')).toBe(true);
  });
});
