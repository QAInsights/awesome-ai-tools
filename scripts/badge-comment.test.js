import { describe, expect, test } from 'bun:test';

import { buildBadgeComment, resolveToolSlug } from './badge-comment.js';

describe('buildBadgeComment', () => {
    test('includes the tool page link, both snippet formats, and the badge page link', () => {
        const body = buildBadgeComment({ name: 'Cursor', slug: 'cursor' });

        expect(body).toContain('**Cursor** has been approved');
        expect(body).toContain('https://ai.dosa.dev/tools/cursor once the PR merges');
        expect(body).toContain('[![Featured on ai.dosa.dev](https://ai.dosa.dev/badge/featured.svg)](https://ai.dosa.dev/tools/cursor?ref=badge)');
        expect(body).toContain('<a href="https://ai.dosa.dev/tools/cursor?ref=badge"');
        expect(body).toContain('https://ai.dosa.dev/badge?tool=cursor');
    });
});

describe('resolveToolSlug', () => {
    const slugs = [
        { slug: 'cursor', name: 'Cursor' },
        { slug: 'claude-code', name: 'Claude Code' },
    ];

    test('matches the slug catalog by name case-insensitively', () => {
        expect(resolveToolSlug('cursor', slugs)).toBe('cursor');
        expect(resolveToolSlug('CLAUDE CODE', slugs)).toBe('claude-code');
    });

    test('falls back to slugifying the submitted name', () => {
        expect(resolveToolSlug('Acme Dev!', slugs)).toBe('acme-dev');
    });
});
