import { filterTools, renderTools } from '../renderer.js';

export function initFilterManager(config) {
    const { toolsData, categories, onFilter } = config;
    let currentCategory = 'all';

    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const resultCount = document.getElementById('resultCount');
    const filtersContainer = document.getElementById('categoryFilters');
    const accordionBtn = document.getElementById('filterAccordionBtn');
    const accordionContent = document.getElementById('filterAccordion');
    const activeFilterBadge = document.getElementById('activeFilterBadge');

    function filterAndRender() {
        const searchVal = searchInput?.value.toLowerCase() || '';
        const filtered = filterTools(toolsData, currentCategory, searchVal);
        renderTools(filtered);
        updateResultCount(filtered.length, toolsData.length);
        updateSearchUrl(searchVal);
        
        // Update clear button visibility
        if (searchClear) {
            searchClear.classList.toggle('visible', searchVal.length > 0);
        }

        if (onFilter) onFilter(filtered);
    }

    function updateResultCount(shown, total) {
        if (!resultCount) return;
        if (shown === 0) {
            resultCount.textContent = '0 results';
            resultCount.classList.remove('hidden');
        } else if (shown === total) {
            resultCount.textContent = `${total} tools`;
            resultCount.classList.add('hidden');
        } else {
            resultCount.textContent = `${shown} tools found`;
            resultCount.classList.remove('hidden');
        }
    }

    function updateSearchUrl(searchVal) {
        const url = new URL(window.location);
        if (searchVal) {
            url.searchParams.set('q', searchVal);
        } else {
            url.searchParams.delete('q');
        }
        window.history.replaceState({}, '', url);
    }

    function renderFilters() {
        if (!filtersContainer || !accordionBtn) return;

        // Toggle logic
        accordionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = accordionContent.classList.contains('hidden');
            
            // Close other popups (managed via app.js or specific events)
            const userMenuPopup = document.getElementById('userMenuPopup');
            if (userMenuPopup) userMenuPopup.classList.add('hidden');
            
            accordionContent.classList.toggle('hidden');
            accordionBtn.classList.toggle('active', !isHidden);
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!accordionContent.contains(e.target) && !accordionBtn.contains(e.target)) {
                accordionContent.classList.add('hidden');
                accordionBtn.classList.remove('active');
            }
        });

        filtersContainer.innerHTML = '';
        filtersContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';

        // Add "All Tools" card
        const allCard = createCategoryCard('all', 'All Categories', toolsData.length, toolsData.slice(0, 3));
        allCard.classList.add('active');
        filtersContainer.appendChild(allCard);

        categories.forEach(cat => {
            const categoryTools = toolsData.filter(t => t.category === cat);
            const card = createCategoryCard(cat, cat, categoryTools.length, categoryTools.slice(0, 3));
            filtersContainer.appendChild(card);
        });
    }

    function createCategoryCard(slug, name, count, previewTools) {
        const card = document.createElement('div');
        card.className = `category-card group cursor-pointer p-5 rounded-2xl border border-[#222] bg-[#0d0d0d] hover:bg-[#151515] hover:border-[#444] transition-all duration-300 flex flex-col justify-between min-h-[140px] ${currentCategory === slug ? 'active' : ''}`;
        card.dataset.category = slug;

        const cleanName = name.replace(/^[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]/g, '').trim();

        card.innerHTML = `
            <div class="mb-4">
                <h4 class="text-white font-semibold text-[16px] leading-snug group-hover:text-blue-400 transition-colors">${cleanName}</h4>
            </div>
            <div class="flex items-center justify-between">
                <div class="flex -space-x-2">
                    ${previewTools.map(t => {
                        try {
                            const domain = new URL(t.url).hostname;
                            return `<div class="w-8 h-8 rounded-full border-2 border-[#0d0d0d] bg-white overflow-hidden shadow-lg">
                                <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" class="w-full h-full object-cover" alt="" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-[10px] text-black font-bold\\'>${t.name[0]}</div>'">
                            </div>`;
                        } catch(e) { return ''; }
                    }).join('')}
                </div>
                <div class="font-mono text-[11px] text-[#525252] group-hover:text-[#a3a3a3] transition-colors bg-[#1a1a1a] px-2 py-1 rounded-md">
                    +${count} tools
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentCategory = slug;
            filterAndRender();
            
            if (slug === 'all') {
                activeFilterBadge?.classList.add('hidden');
            } else {
                if (activeFilterBadge) {
                    activeFilterBadge.textContent = count;
                    activeFilterBadge.classList.remove('hidden');
                }
            }

            document.getElementById('tableHeader')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            accordionContent?.classList.add('hidden');
            accordionBtn?.classList.remove('active');
        });

        return card;
    }

    // Bind event listeners
    if (searchInput) {
        searchInput.addEventListener('input', filterAndRender);
    }
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            filterAndRender();
        });
    }

    return { renderFilters, filterAndRender };
}
