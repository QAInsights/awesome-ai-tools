import { describe, expect, test } from 'bun:test';
import { getAllTools } from './tools';
import { queryCatalogTools } from './tool-query';

describe('tool-query', () => {
    const tools = getAllTools();

    test('returns paginated tools with detailUrl and markdownUrl', () => {
        const res = queryCatalogTools(tools, { limit: 5 });
        expect(res.total).toBe(tools.length);
        expect(res.tools).toHaveLength(5);
        expect(res.tools[0]?.detailUrl).toStartWith('https://ai.dosa.dev/tools/');
        expect(res.tools[0]?.markdownUrl).toEndWith('.md');
    });

    test('ranks exact slug/name matches first for search queries', () => {
        const res = queryCatalogTools(tools, { q: 'cursor', limit: 5 });
        expect(res.total).toBeGreaterThan(0);
        expect(res.tools[0]?.slug).toBe('cursor');
    });

    test('filters by category and pricing', () => {
        const res = queryCatalogTools(tools, {
            category: 'cli-agents',
            pricing: 'open-source',
            limit: 10,
        });
        expect(res.total).toBeGreaterThan(0);
        for (const item of res.tools) {
            expect(item.categorySlug).toBe('cli-agents');
        }
    });
});
