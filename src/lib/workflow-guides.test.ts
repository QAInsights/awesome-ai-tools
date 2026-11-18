import { describe, expect, test } from 'bun:test';
import { workflowGuides } from '../data/workflow-guides';
import { getToolBySlug } from './tools';
import { getResolvedWorkflowGuides, resolveWorkflowGuide } from './workflow-guides';

describe('workflow guides', () => {
    test('publishes distinct routes with 3–6 distinct directory tools each', () => {
        const guides = getResolvedWorkflowGuides();
        expect(guides.length).toBeGreaterThanOrEqual(5);
        expect(new Set(guides.map(guide => guide.slug)).size).toBe(guides.length);

        for (const guide of guides) {
            expect(guide.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
            expect(guide.tools.length).toBeGreaterThanOrEqual(3);
            expect(guide.tools.length).toBeLessThanOrEqual(6);
            expect(new Set(guide.tools.map(tool => tool.slug)).size).toBe(guide.tools.length);
            for (const tool of guide.tools) {
                expect(tool.name).toBe(getToolBySlug(tool.slug)?.name);
                expect(tool.href).toBe(`/tools/${tool.slug}`);
            }
        }
    });

    test('fails with the guide and tool slugs when a recommendation cannot be resolved', () => {
        const guide = workflowGuides[0];
        expect(() => resolveWorkflowGuide({
            ...guide,
            tools: [{ ...guide.tools[0], slug: 'not-in-the-tool-directory' }],
        })).toThrow(`Workflow guide "${guide.slug}" references unavailable tool "not-in-the-tool-directory"`);
    });
});
