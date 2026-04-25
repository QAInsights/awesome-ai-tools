import * as cache from './tool-cache.js';
import { getVoteCount } from './voting.js';
import { auth } from './auth.js';
import html2canvas from 'html2canvas';

const ENRICHED_URL = '/data/enriched-tools.json';
const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';

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
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        enrichedData = cached.data;
    }

    // Always fetch latest to be safe, or just use if absent
    try {
        const res = await fetch(ENRICHED_URL);
        if (res.ok) {
            const freshData = await res.json();
            if (Array.isArray(freshData) && freshData.length > 0) {
                enrichedData = freshData;
                cache.write(enrichedData);
            }
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

        const toolId = `${tool.company.toLowerCase().replace(/[^a-z0-9]/g, '')}-${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const initialVoteCount = getVoteCount(toolId);

        const zapButtonHtml = ENABLE_VOTING ? (auth.isAuthenticated() ? `
            <button class="zap-btn sm" data-tip="Zap this tool!" 
                data-tool-id="${toolId}"
                data-tool-name="${tool.name}">
                <div class="zap-ring"></div>
                <div class="sparks">
                    <div class="spark spark-1"></div>
                    <div class="spark spark-2"></div>   
                    <div class="spark spark-3"></div>
                    <div class="spark spark-4"></div>
                    <div class="spark spark-5"></div>
                </div>
                <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                    <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                </svg>
                <span class="zap-count">${initialVoteCount.toLocaleString()}</span>
            </button>
        ` : `
            <button class="zap-btn sm" data-tip="Sign in to vote!" 
                data-tool-id="${toolId}"
                data-tool-name="${tool.name}">
                <svg class="zap-icon" viewBox="0 0 24 24" fill="none" style="opacity:0.4">
                    <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                </svg>
                <span class="zap-count" style="opacity:0.5">${initialVoteCount.toLocaleString()}</span>
            </button>
        `) : `
            <button class="zap-btn sm opacity-50 cursor-not-allowed" disabled data-tip="Voting is currently disabled.">
                <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                    <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                </svg>
                <span class="zap-count">${initialVoteCount.toLocaleString()}</span>
            </button>
        `;

        card.innerHTML = `
            <div class="border-b border-[#333] pb-3 sm:pb-4 mb-2">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl sm:text-2xl font-bold text-white mb-1"><a href="/tools/${tool.slug}" class="hover:bg-gradient-to-r hover:from-[#a78bfa] hover:via-[#22d3ee] hover:to-[#a78bfa] hover:bg-[length:200%_auto] hover:bg-clip-text hover:text-transparent transition-all duration-300">${tool.name}</a></h2>
                        <p class="font-mono text-xs sm:text-sm text-[#a3a3a3]">${tool.company}</p>
                    </div>
                    ${zapButtonHtml}
                </div>
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

    // Add Share and Export functionality
    const shareBtn = document.getElementById('shareCompareBtn');
    const shareBtnText = document.getElementById('shareBtnText');
    const exportBtn = document.getElementById('exportCompareBtn');

    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                shareBtnText.textContent = 'Copied!';
                shareBtn.classList.add('text-[#a78bfa]', 'border-[#a78bfa]');
                setTimeout(() => {
                    shareBtnText.textContent = 'Share';
                    shareBtn.classList.remove('text-[#a78bfa]', 'border-[#a78bfa]');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (!grid) return;

            // Temporary styling for capture
            const originalStyle = grid.style.cssText;
            grid.style.background = '#000'; // Ensure dark background
            grid.style.padding = '24px';
            grid.style.borderRadius = '12px';

            // Show loading state
            const originalText = exportBtn.innerHTML;
            exportBtn.innerHTML = '<span class="animate-pulse">Exporting...</span>';
            exportBtn.disabled = true;

            try {
                const canvas = await html2canvas(grid, {
                    backgroundColor: '#000000',
                    scale: 2, // Higher resolution
                    useCORS: true,
                    logging: false
                });

                // Create download link
                const image = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `ai-tools-compare-${slugs.join('-vs-')}.png`;
                link.href = image;
                link.click();
            } catch (err) {
                console.error('Failed to export image', err);
                alert('Failed to export image. Please try again.');
            } finally {
                // Restore styling and button state
                grid.style.cssText = originalStyle;
                exportBtn.innerHTML = originalText;
                exportBtn.disabled = false;
            }
        });
    }
});
