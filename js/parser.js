/**
 * Markdown parser module for extracting tool data from README.md
 */

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

/**
 * Parse markdown content and extract tool data
 * @param {string} md - Markdown content
 * @returns {Array} Array of tool objects
 */
export function parseMarkdown(md) {
    const sections = md.split('## ');
    const tools = [];
    
    for (let i = 1; i < sections.length; i++) {
        const lines = sections[i].split('\n');
        const categoryLine = lines[0].trim();
        
        if (categoryLine.toLowerCase().includes('table of contents')) continue;
        
        let isTable = false;
        for (const line of lines) {
            if (line.startsWith('| Tool |') || line.startsWith('|------|')) {
                isTable = true;
                continue;
            }
            
            if (isTable && line.trim().startsWith('|')) {
                const cells = line.split('|').map(s => s.trim()).filter(Boolean);
                if (cells.length >= 3) {
                    const [toolRaw, company, notes] = cells;
                    const match = toolRaw.match(/\[(.*?)\]\((.*?)\)/);
                    
                    if (match) {
                        tools.push({
                            category: categoryLine,
                            name: match[1].replace(/\*\*/g, ''),
                            url: match[2],
                            company,
                            notes
                        });
                    } else {
                        const nameMatch = toolRaw.match(/\*\*(.*?)\*\*/);
                        tools.push({
                            category: categoryLine,
                            name: nameMatch ? nameMatch[1] : toolRaw.replace(/\*\*/g, ''),
                            url: '#',
                            company,
                            notes
                        });
                    }
                }
            } else if (isTable && (!line.trim().startsWith('|') && line.trim() !== '')) {
                isTable = false;
            }
        }
    }
    
    return tools;
}

/**
 * Get short category name from full category
 * @param {string} category - Full category name
 * @returns {string} Short category name
 */
export function getShortCategory(category) {
    const catClean = category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
    
    for (const [key, val] of Object.entries(categoryMapping)) {
        if (catClean.includes(key)) {
            return val;
        }
    }
    
    return catClean;
}

/**
 * Extract unique categories from tools
 * @param {Array} tools - Array of tool objects
 * @returns {Set} Set of unique categories
 */
export function extractCategories(tools) {
    return new Set(tools.map(tool => tool.category));
}
