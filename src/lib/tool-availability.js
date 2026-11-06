/** @param {{ enriched?: { status?: string } | null }} tool */
export function isRecommendationCandidate(tool) {
    const status = (tool.enriched?.status ?? '').trim().toLowerCase();
    return status !== 'discontinued' && status !== 'winding-down';
}
