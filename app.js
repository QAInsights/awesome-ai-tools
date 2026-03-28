document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    const categoryFilters = document.getElementById('categoryFilters');
    
    let toolsData = [];
    let categories = new Set();
    let currentCategory = 'all';
    
    // Fetch and parse README.md
    try {
        const response = await fetch('README.md');
        if (!response.ok) throw new Error('Failed to fetch README');
        const text = await response.text();
        toolsData = parseMarkdown(text);
        
        // Extract unique categories
        toolsData.forEach(tool => categories.add(tool.category));
        
        renderFilters();
        renderGrid(toolsData);
        
    } catch (error) {
        console.error('Error loading tools:', error);
        grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">Could not load registry. Ensure you are running via a local server (e.g., npx serve).</p>`;
    }
    
    function parseMarkdown(md) {
        const sections = md.split('## ');
        const tools = [];
        
        for (let i = 1; i < sections.length; i++) {
            const section = sections[i];
            const lines = section.split('\n');
            const categoryLine = lines[0].trim();
            
            // Skip "Table of Contents" and other irrelevant ones
            if (categoryLine.toLowerCase().includes('table of contents')) continue;

            let isTable = false;
            for (const line of lines) {
                if (line.startsWith('| Tool |') || line.startsWith('|------|')) {
                     isTable = true;
                     continue;
                }
                if (isTable && line.trim().startsWith('|')) {
                    const cells = line.split('|').map(s => s.trim()).filter(s => s);
                    if (cells.length >= 3) {
                        const toolRaw = cells[0];
                        const company = cells[1];
                        const notes = cells[2];
                        
                        const match = toolRaw.match(/\[(.*?)\]\((.*?)\)/);
                        if (match) {
                             const name = match[1].replace(/\*\*/g, '');
                             const url = match[2];
                             tools.push({ category: categoryLine, name, url, company, notes });
                        } else {
                             const nameMatch = toolRaw.match(/\*\*(.*?)\*\*/);
                             const name = nameMatch ? nameMatch[1] : toolRaw.replace(/\*\*/g, '');
                             tools.push({ category: categoryLine, name, url: '#', company, notes });
                        }
                    }
                } else if (isTable && (!line.trim().startsWith('|') && line.trim() !== '')) {
                    isTable = false;
                }
            }
        }
        return tools;
    }

    function renderFilters() {
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.category = cat;
            
            // Clean emojis for true technical utilitarian aesthetic
            const catClean = cat.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();
            btn.textContent = catClean;
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = cat;
                filterAndRender();
            });
            categoryFilters.appendChild(btn);
        });
        
        const allBtn = document.querySelector('[data-category="all"]');
        allBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = 'all';
            filterAndRender();
        });
    }
    
    function filterAndRender() {
        const searchVal = searchInput.value.toLowerCase();
        
        const filtered = toolsData.filter(tool => {
            const matchCategory = currentCategory === 'all' || tool.category === currentCategory;
            const matchSearch = tool.name.toLowerCase().includes(searchVal) || 
                                tool.company.toLowerCase().includes(searchVal) ||
                                tool.notes.toLowerCase().includes(searchVal) ||
                                tool.category.toLowerCase().includes(searchVal);
            return matchCategory && matchSearch;
        });
        
        renderGrid(filtered);
    }
    
    function renderGrid(tools) {
        grid.innerHTML = '';
        if (tools.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">No processes found matching criteria.</p>`;
            return;
        }
        
        tools.forEach((tool, index) => {
            const delay = (index % 15) * 0.02; 
            const row = document.createElement('a');
            row.href = tool.url;
            row.target = '_blank';
            row.rel = 'noopener noreferrer';
            row.className = 'row';
            row.style.animationDelay = `${delay}s`;
            
            const catClean = tool.category.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();

            row.innerHTML = `
                <div class="col col-name">${tool.name}</div>
                <div class="col col-company">${tool.company}</div>
                <div class="col col-desc">${tool.notes}</div>
                <div class="col col-cat"><span class="category-badge">${catClean}</span></div>
            `;
            grid.appendChild(row);
        });
    }
    
    searchInput.addEventListener('input', filterAndRender);
});
