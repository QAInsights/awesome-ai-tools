export const state = {
    selectedTools: new Set()
};

export function toggleTool(slug) {
    if (state.selectedTools.has(slug)) {
        state.selectedTools.delete(slug);
        return true;
    } else if (state.selectedTools.size < 3) {
        state.selectedTools.add(slug);
        return true;
    }
    return false; // Reached limit
}

export function isSelected(slug) {
    return state.selectedTools.has(slug);
}

export function getSelected() {
    return Array.from(state.selectedTools);
}

export function clearSelection() {
    state.selectedTools.clear();
}
