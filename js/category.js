const categoryMapping = {
    'AI-Native IDEs & Editors': 'AI IDEs',
    'IDE Extensions & Plugins': 'IDE Plugins',
    'Terminal & CLI Agents': 'CLI Agents',
    'AI-Native Terminals': 'AI Terminals',
    'Autonomous & Async Agents': 'Async Agents',
    'Browser-Based & App Builders': 'Web Builders',
    'AI Code Review & Security': 'Code Review',
    'AI Testing & Quality Assurance': 'QA & Testing',
    'General-Purpose AI Assistants (with Strong Coding Capability)': 'General AI',
    'AI Codebase Knowledge & Generation': 'Codebase AI',
    'Developer Productivity & Workflow': 'Productivity',
    'Editor Platforms with Native AI Features': 'Native Editors'
};

export function getShortCategory(category) {
    const catClean = category.replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '').trim();

    for (const [key, val] of Object.entries(categoryMapping)) {
        if (catClean.includes(key)) {
            return val;
        }
    }

    return catClean;
}
