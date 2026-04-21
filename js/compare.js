import * as cache from './tool-cache.js';

const ENRICHED_URL = '/public/data/enriched-tools.json';

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const toolsParam = params.get('tools');
    if (!toolsParam) {
        document.getElementById('compareGrid').innerHTML = '<p class="text-[#a3a3a3]">No tools selected for comparison.</p>';
        return;
    }

    const slugs = toolsParam.split(',').filter(Boolean);
    if (slugs.length === 0) {
        document.getElementById('compareGrid').innerHTML = '<p class="text-[#a3a3a3]">No tools selected for comparison.</p>';
        return;
    }

    const grid = document.getElementById('compareGrid');
    grid.innerHTML = '<p class="text-[#a3a3a3]">Loading enriched data...</p>';

    let enrichedData = [];

    // Check cache
    const cached = cache.read();
    if (cached) {
        enrichedData = cached.data;
    }

    // Always fetch latest to be safe, or just use if absent
    try {
        const res = await fetch(ENRICHED_URL);
        if (res.ok) {
            enrichedData = await res.json();
            cache.write(enrichedData);
        }
    } catch (e) {
        console.warn('Failed to fetch enriched-tools.json', e);
    }

    if (!enrichedData || enrichedData.length === 0) {
        grid.innerHTML = '<p class="text-red-400">Failed to load tool data.</p>';
        return;
    }

    const toolsToCompare = slugs.map(slug => enrichedData.find(t => t.slug === slug)).filter(Boolean);

    if (toolsToCompare.length === 0) {
        grid.innerHTML = '<p class="text-[#a3a3a3]">Selected tools not found in enriched data.</p>';
        return;
    }

    // Render the grid
    grid.innerHTML = '';

    toolsToCompare.forEach(tool => {
        const card = document.createElement('div');
        // Mobile vertical, desktop horizontal (handled by parent flex-row)
        card.className = 'flex-1 bg-[#111] border border-[#333] rounded-xl p-6 flex flex-col gap-4';

        const featuresHtml = tool.keyFeatures ? `<ul class="list-disc pl-5 text-[#a3a3a3] text-sm flex flex-col gap-1">${tool.keyFeatures.map(f => `<li>${f}</li>`).join('')}</ul>` : '<p class="text-[#a3a3a3] text-sm">N/A</p>';

        card.innerHTML = `
            <div class="border-b border-[#333] pb-4 mb-2">
                <h2 class="text-2xl font-bold text-white mb-1"><a href="/tools/${tool.slug}" class="hover:text-[#a78bfa] transition-colors">${tool.name}</a></h2>
                <p class="font-mono text-sm text-[#a3a3a3]">${tool.company}</p>
            </div>

            <div class="flex-1 flex flex-col gap-6">
                <div>
                    <h3 class="text-white font-semibold mb-2">Pricing</h3>
                    <p class="text-sm text-[#a3a3a3] capitalize">${tool.pricing || 'N/A'}</p>
                    ${tool.pricingDetail ? `<p class="text-xs text-[#737373] mt-1">${tool.pricingDetail}</p>` : ''}
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Description</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${tool.description || 'N/A'}</p>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Key Features</h3>
                    ${featuresHtml}
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Best For</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${tool.bestFor || 'N/A'}</p>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Not Ideal For</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${tool.notIdealFor || 'N/A'}</p>
                </div>

                <div class="mt-auto pt-4 border-t border-[#333]">
                    <h3 class="text-white font-semibold mb-2">Verdict</h3>
                    <p class="text-sm text-[#a3a3a3] italic">${tool.verdict || 'N/A'}</p>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
});
