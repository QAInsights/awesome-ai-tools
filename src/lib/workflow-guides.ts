import { workflowGuides, type WorkflowGuide } from '../data/workflow-guides';
import { getToolBySlug } from './tools';
import { isRecommendationCandidate } from './tool-availability.js';

export function resolveWorkflowGuide(guide: WorkflowGuide) {
    return {
        ...guide,
        tools: guide.tools.map(entry => {
            const tool = getToolBySlug(entry.slug);
            if (!tool || !isRecommendationCandidate(tool)) {
                throw new Error(`Workflow guide "${guide.slug}" references unavailable tool "${entry.slug}"`);
            }
            return { ...entry, name: tool.name, href: `/tools/${tool.slug}` };
        }),
    };
}

export function getResolvedWorkflowGuides() {
    return workflowGuides.map(resolveWorkflowGuide);
}

export type ResolvedWorkflowGuide = ReturnType<typeof resolveWorkflowGuide>;
