import { describe, expect, test } from 'bun:test';
import { getAllTools, type Tool } from './tools';
import { buildToolSeo, buildToolReview } from './tool-seo';

const tool: Tool = {
    slug: 'codebuff',
    name: 'Codebuff',
    company: 'Codebuff',
    category: 'Terminal & CLI Agents',
    categoryClean: 'Terminal & CLI Agents',
    categoryShort: 'CLI Agents',
    notes: 'A terminal coding assistant.',
    url: 'https://example.com',
    enriched: {
        slug: 'codebuff',
        pricing: 'freemium',
        verdict: 'A powerful alternative to standard coding assistants, with multi-file operations and programmatic control.',
        bestFor: 'Terminal-centric developers who want deep codebase context and multi-file refactoring.',
    },
};
const alternatives = ['Cursor', 'Cline', 'OpenCode', 'Roo Code', 'Kilo Code', 'Claude Code'].map((name, index) => ({
    ...tool,
    slug: `alternative-${index}`,
    name,
    enriched: null,
}));

describe('tool SEO', () => {
    test('uses pricing, the review, and visible alternatives instead of duplicating company', () => {
        const { title, description } = buildToolSeo(tool, alternatives, 2026);
        expect(title).toBe('Codebuff: Pricing, Review & 6 Alternatives (2026)');
        expect(description).toContain('Codebuff');
        expect(description).toContain('Freemium');
        expect(description).toContain('powerful alternative');
        expect(description).toContain('Best for');
        expect(description).toContain('Compare with');
        expect(title).not.toContain('Codebuff - Codebuff');
        expect(title.length).toBeLessThanOrEqual(65);
        expect(description.length).toBeLessThanOrEqual(155);
    });

    test('avoids claiming an open-source license means free pricing', () => {
        const { description } = buildToolSeo({ ...tool, enriched: { ...tool.enriched!, pricing: 'open-source' } }, alternatives, 2026);
        expect(description).toContain('Open Source');
        expect(description).not.toContain('Yes, free');
    });

    test('does not describe paid products as free', () => {
        const { description } = buildToolSeo({ ...tool, enriched: { ...tool.enriched!, pricing: 'paid' } }, alternatives, 2026);
        expect(description).toContain('Paid pricing');
        expect(description).not.toContain('Yes, free');
    });

    test('falls back without inventing pricing or a review when enrichment is missing', () => {
        const seedOnly = { ...tool, enriched: null };
        const { title, description } = buildToolSeo(seedOnly, alternatives, 2026);
        expect(title).not.toContain('Pricing');
        expect(title).not.toContain('Review');
        expect(description).toContain(seedOnly.notes);
        expect(description).not.toContain('free?');
        expect(buildToolReview(seedOnly)).toBeNull();
    });

    test('does not advertise alternatives when none are rendered', () => {
        const { title, description } = buildToolSeo(tool, [], 2026);
        expect(title).not.toContain('Alternatives');
        expect(description).not.toContain('Compare with');
    });

    test('preserves long names and stays within the limits without cutting words mid-way', () => {
        const long = { ...tool, name: 'The Extremely Long AI Coding Tool Name For Everyone', enriched: null };
        const { title, description } = buildToolSeo(long, alternatives, 2026);
        expect(title).toContain(long.name);
        expect(title.length).toBeLessThanOrEqual(65);
        expect(description.length).toBeLessThanOrEqual(155);
        expect(description).not.toMatch(/\w…/);
    });

    test('adds a review of the app only when the verdict is visible on the page', () => {
        expect(buildToolReview(tool)).toEqual({
            '@type': 'Review',
            author: { '@type': 'Organization', '@id': 'https://ai.dosa.dev/#organization', name: 'dosa.dev' },
            itemReviewed: { '@type': 'SoftwareApplication', '@id': 'https://ai.dosa.dev/tools/codebuff#app', name: 'Codebuff' },
            reviewBody: tool.enriched!.verdict,
        });
        expect(buildToolReview({ ...tool, enriched: { slug: 'codebuff' } })).toBeNull();
    });

    test('all catalog titles and descriptions are unique, bounded, and factual about available fields', () => {
        const tools = getAllTools();
        const titles = new Set<string>();
        for (const entry of tools) {
            const related = tools.filter(other => other.category === entry.category && other.slug !== entry.slug).slice(0, 6);
            const { title, description } = buildToolSeo(entry, related, 2026);
            expect(title.length).toBeLessThanOrEqual(65);
            expect(description.length).toBeLessThanOrEqual(155);
            expect(title).toContain(entry.enriched?.name ?? entry.name);
            expect(title).not.toMatch(/^(.+) - \1 \|/);
            expect(titles.has(title), entry.slug).toBe(false);
            titles.add(title);
            if (!entry.enriched?.pricing) expect(description).not.toContain('free?');
        }
    });
});
