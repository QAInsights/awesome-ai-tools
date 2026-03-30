document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('toolGrid'),
          searchInput = document.getElementById('searchInput'),
          categoryFilters = document.getElementById('categoryFilters');
    let toolsData = [], categories = new Set(), currentCategory = 'all';

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

    try {
        const response = await fetch('README.md');
        if (!response.ok) throw new Error('Failed to fetch README');
        const text = await response.text();
        toolsData = parseMarkdown(text);
        toolsData.forEach(tool => categories.add(tool.category));
        renderFilters();
        renderGrid(toolsData);
    } catch (error) {
        console.error('Error loading tools:', error);
        grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">Could not load registry. Ensure you are running via a local server.</p>`;
    }
    
    function parseMarkdown(md) {
        const sections = md.split('## '), tools = [];
        for (let i = 1; i < sections.length; i++) {
            const lines = sections[i].split('\n'), categoryLine = lines[0].trim();
            if (categoryLine.toLowerCase().includes('table of contents')) continue;
            let isTable = false;
            for (const line of lines) {
                if (line.startsWith('| Tool |') || line.startsWith('|------|')) { isTable = true; continue; }
                if (isTable && line.trim().startsWith('|')) {
                    const cells = line.split('|').map(s => s.trim()).filter(Boolean);
                    if (cells.length >= 3) {
                        const [toolRaw, company, notes] = cells,
                              match = toolRaw.match(/\[(.*?)\]\((.*?)\)/);
                        if (match) {
                             tools.push({ category: categoryLine, name: match[1].replace(/\*\*/g, ''), url: match[2], company, notes });
                        } else {
                             const nameMatch = toolRaw.match(/\*\*(.*?)\*\*/);
                             tools.push({ category: categoryLine, name: nameMatch ? nameMatch[1] : toolRaw.replace(/\*\*/g, ''), url: '#', company, notes });
                        }
                    }
                } else if (isTable && (!line.trim().startsWith('|') && line.trim() !== '')) isTable = false;
            }
        }
        return tools;
    }

    function renderFilters() {
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.category = cat;
            btn.textContent = cat.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = cat;
                filterAndRender();
            });
            categoryFilters.appendChild(btn);
        });
        document.querySelector('[data-category="all"]').addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = 'all';
            filterAndRender();
        });
    }
    
    function filterAndRender() {
        const searchVal = searchInput.value.toLowerCase();
        renderGrid(toolsData.filter(tool => 
            (currentCategory === 'all' || tool.category === currentCategory) &&
            (tool.name.toLowerCase().includes(searchVal) || tool.company.toLowerCase().includes(searchVal) || tool.notes.toLowerCase().includes(searchVal) || tool.category.toLowerCase().includes(searchVal))
        ));
    }
    
    function renderGrid(tools) {
        if (tools.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">No processes found matching criteria.</p>`;
            return;
        }
        grid.replaceChildren(...tools.map((tool, index) => {
            const row = document.createElement('a');
            row.href = tool.url;
            row.target = '_blank';
            row.rel = 'noopener noreferrer';
            row.className = 'row';
            row.style.animationDelay = `${(index % 15) * 0.02}s`;
            const catClean = tool.category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
            let catShort = catClean;
            for (const [key, val] of Object.entries(categoryMapping)) {
                if (catClean.includes(key)) {
                    catShort = val;
                    break;
                }
            }
            row.innerHTML = `<div class="col col-name">${tool.name}</div><div class="col col-company">${tool.company}</div><div class="col col-desc">${tool.notes}</div><div class="col col-cat"><span class="category-badge" title="${catClean}">${catShort}</span></div>`;
            return row;
        }));
    }

    function updateYear() {
        const year = new Date().getFullYear();
        const yearElement = document.querySelector('.footer-copy');
        yearElement.textContent = `© ${year} NaveenKumar Namachivayam`;
    }

    searchInput.addEventListener('input', filterAndRender);
    updateYear();
});
