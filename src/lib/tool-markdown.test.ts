import { describe, expect, test } from 'bun:test';
import { getCategoriesDetailed, getToolBySlug } from './tools';
import { categoryPageMarkdown, toolPageMarkdown } from './tool-markdown';

describe('tool-markdown', () => {
    test('renders tool detail markdown with pricing, features, and links', () => {
        const cursor = getToolBySlug('cursor');
        expect(cursor).toBeDefined();
        const md = toolPageMarkdown(cursor!);
        expect(md).toContain('# Cursor — AI Coding Tool Review & Pricing');
        expect(md).toContain('Source: https://ai.dosa.dev/tools/cursor');
        expect(md).toContain('## At a glance');
        expect(md).toContain('## Top alternatives');
    });

    test('renders successor line for discontinued tools', () => {
        const cont = getToolBySlug('continue');
        expect(cont).toBeDefined();
        const md = toolPageMarkdown(cont!);
        expect(md).toContain('- **Status**: discontinued');
        expect(md).toContain('- **Successor**: [Cursor](https://ai.dosa.dev/tools/cursor)');
    });

    test('renders category markdown table and ranked tool list', () => {
        const categories = getCategoriesDetailed();
        expect(categories.length).toBeGreaterThan(0);
        const cat = categories[0]!;
        const md = categoryPageMarkdown(cat);
        expect(md).toContain(`# ${cat.name} — AI Coding Tools Directory`);
        expect(md).toContain(`Source: https://ai.dosa.dev/category/${cat.slug}`);
        expect(md).toContain('## Comparison table');
        expect(md).toContain('## Tools in this category');
    });
});
