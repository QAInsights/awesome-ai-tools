/**
 * Markdown parser module for extracting tool data from README.md
 */
import { getShortCategory } from './category.js';

/**
 * Convert an arbitrary string to a URL-safe kebab-case slug.
 * - Lowercases, strips emojis/punctuation, collapses whitespace to `-`.
 * - Used for detail page URLs (/tools/<slug>) and lookup in the enriched JSON.
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')            // strip diacritics
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '') // strip emoji + variation selectors
        .replace(/[^a-z0-9\s-]/g, '')               // drop other non-word chars
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Parse markdown content and extract tool data.
 * Attaches a collision-resolved `slug` to every tool.
 * @param {string} md - Markdown content
 * @returns {Array} Array of tool objects: { category, name, url, company, notes, slug }
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

    // Assign slugs with collision resolution. First occurrence keeps the clean
    // name slug; subsequent ones get disambiguated by company.
    const seen = new Map();
    for (const tool of tools) {
        let base = slugify(tool.name);
        if (!base) base = 'tool';
        let slug = base;
        if (seen.has(slug)) {
            const withCompany = `${base}-${slugify(tool.company)}`;
            slug = seen.has(withCompany) ? `${withCompany}-${seen.get(withCompany) + 1}` : withCompany;
        }
        seen.set(slug, (seen.get(slug) || 0) + 1);
        tool.slug = slug;
    }

    return tools;
}

/**
 * Get short category name from full category
 * @param {string} category - Full category name
 * @returns {string} Short category name
 */
export { getShortCategory };

/**
 * Extract unique categories from tools
 * @param {Array} tools - Array of tool objects
 * @returns {Set} Set of unique categories
 */
export function extractCategories(tools) {
    return new Set(tools.map(tool => tool.category));
}
