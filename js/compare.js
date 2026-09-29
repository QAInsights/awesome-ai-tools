import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import * as cache from './tool-cache.js';

const ENRICHED_URL = '/data/enriched-tools.json';
const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';
const CF_SITEKEY = process.env.CF_SITEKEY || '1x00000000000000000000AA';

// Escape tool-sourced strings before innerHTML interpolation (same pattern
// as tool-detail.js) - enriched data/cache content is not trusted markup.
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
let getVoteCount = () => 0;
let isAuthenticated = () => false;
let html2canvasModule = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Share / Export buttons work regardless of ?tools= selection
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
                alert('Failed to copy link.');
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const params = new URLSearchParams(window.location.search);
            const toolsParam = params.get('tools');
            const slugs = (toolsParam ? toolsParam.split(',') : []).filter(Boolean);
            if (!slugs.length) {
                alert('Select at least one tool to compare before exporting.');
                return;
            }
            const grid = document.getElementById('compareGrid');
            if (!grid) return;
            const originalStyle = grid.style.cssText;
            grid.style.background = '#000';
            grid.style.padding = '24px';
            grid.style.borderRadius = '12px';
            const zapBtns = grid.querySelectorAll('.zap-btn');
            const originalZapStyles = [];
            zapBtns.forEach(btn => {
                originalZapStyles.push(btn.style.backgroundColor);
                btn.style.backgroundColor = '#1a1a1a';
            });
            const originalText = exportBtn.innerHTML;
            exportBtn.innerHTML = '<span class="animate-pulse">Exporting...</span>';
            exportBtn.disabled = true;
            try {
                if (!html2canvasModule) {
                    const mod = await import('html2canvas');
                    html2canvasModule = mod.default;
                }
                const canvas = await html2canvasModule(grid, {
                    backgroundColor: '#000000',
                    scale: 2,
                    useCORS: true,
                    logging: false
                });
                const image = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `ai-tools-compare-${slugs.join('-vs-')}.png`;
                link.href = image;
                link.click();
            } catch (err) {
                console.error('Failed to export image', err);
                alert('Failed to export image. Please try again.');
            } finally {
                grid.style.cssText = originalStyle;
                exportBtn.innerHTML = originalText;
                exportBtn.disabled = false;
                zapBtns.forEach((btn, index) => {
                    btn.style.backgroundColor = originalZapStyles[index];
                });
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const toolsParam = params.get('tools');
    if (!toolsParam) {
        // No selection - leave the server-rendered empty state in place.
        return;
    }

    function renderTurnstile(siteKey) {
        if (typeof turnstile !== 'undefined') {
            window.turnstileWidgetId = turnstile.render('#turnstile-container', {
                sitekey: siteKey,
                callback: (token) => window.cfTokenValue = token
            });
        } else {
            setTimeout(() => renderTurnstile(siteKey), 100);
        }
    }

    const slugs = toolsParam.split(',').filter(Boolean);
    if (slugs.length === 0) {
        // Empty ?tools= param - leave the server-rendered empty state in place.
        return;
    }

    const grid = document.getElementById('compareGrid');
    if (!grid) return;
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

    function createZapButtonHtml(toolId, toolName, voteCount) {
        const safeId = escapeHtml(toolId);
        const safeName = escapeHtml(toolName);
        if (!ENABLE_VOTING) {
            return `
            <button class="zap-btn sm opacity-50 cursor-not-allowed" disabled data-tip="Voting is currently disabled.">
                <svg class="zap-icon" viewBox="0 0 24 24" fill="none">
                    <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                </svg>
                <span class="zap-count">${voteCount.toLocaleString()}</span>
            </button>
        `;
        }

        if (isAuthenticated()) {
            return `
            <button class="zap-btn sm" data-tip="Zap this tool!"
                data-tool-id="${safeId}"
                data-tool-name="${safeName}">
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
                <span class="zap-count">${voteCount.toLocaleString()}</span>
            </button>
        `;
        }

        return `
            <button class="zap-btn sm" data-tip="Sign in to vote!"
                data-tool-id="${safeId}"
                data-tool-name="${safeName}">
                <svg class="zap-icon" viewBox="0 0 24 24" fill="none" style="opacity:0.4">
                    <path class="zap-bolt" d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                </svg>
                <span class="zap-count" style="opacity:0.5">${voteCount.toLocaleString()}</span>
            </button>
        `;
    }

    function refreshZapButtons() {
        const buttons = grid?.querySelectorAll('.zap-btn[data-tool-id]') ?? [];
        buttons.forEach((btn) => {
            const toolId = btn.dataset.toolId;
            const toolName = btn.dataset.toolName;
            if (!toolId || !toolName) return;

            const voteCount = getVoteCount(toolId);
            btn.outerHTML = createZapButtonHtml(toolId, toolName, voteCount).trim();
        });
    }

    function renderCompareGrid() {
        grid.innerHTML = '';

        if (toolsToCompare.length === 1) {
            const hint = document.createElement('p');
            hint.className = 'w-full text-[#a3a3a3] text-[14px] border border-dashed border-[#333] rounded-md px-4 py-3 m-0';
            hint.textContent = 'Select at least one more tool from the directory to compare side-by-side.';
            grid.appendChild(hint);
        }

        toolsToCompare.forEach(tool => {
        const card = document.createElement('div');
        // Mobile vertical, desktop horizontal (handled by parent flex-row)
        card.className = 'flex-1 bg-[#111] border border-[#333] rounded-xl p-6 flex flex-col gap-4';

        const featuresHtml = tool.keyFeatures ? `<ul class="list-disc pl-5 text-[#a3a3a3] text-sm flex flex-col gap-1">${tool.keyFeatures.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : '<p class="text-[#a3a3a3] text-sm">N/A</p>';

        const toolId = `${tool.company.toLowerCase().replace(/[^a-z0-9]/g, '')}-${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const initialVoteCount = getVoteCount(toolId);

        const zapButtonHtml = createZapButtonHtml(toolId, tool.name, initialVoteCount);

        card.innerHTML = `
            <div class="border-b border-[#333] pb-3 sm:pb-4 mb-2">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl sm:text-2xl font-bold text-white mb-1"><a href="/tools/${encodeURIComponent(tool.slug)}" class="hover:bg-gradient-to-r hover:from-[#a78bfa] hover:via-[#22d3ee] hover:to-[#a78bfa] hover:bg-[length:200%_auto] hover:bg-clip-text hover:text-transparent transition-all duration-300">${escapeHtml(tool.name)}</a></h2>
                        <p class="font-mono text-xs sm:text-sm text-[#a3a3a3]">${escapeHtml(tool.company)}</p>
                    </div>
                    ${zapButtonHtml}
                </div>
            </div>

            <div class="flex-1 flex flex-col gap-6">
                <div>
                    <h3 class="text-white font-semibold mb-2">Pricing</h3>
                    <p class="text-sm text-[#a3a3a3] capitalize">${escapeHtml(tool.pricing || 'N/A')}</p>
                    ${tool.pricingDetail ? `<p class="text-xs text-[#737373] mt-1">${escapeHtml(tool.pricingDetail)}</p>` : ''}
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Description</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${escapeHtml(tool.description || 'N/A')}</p>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Key Features</h3>
                    ${featuresHtml}
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Best For</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${escapeHtml(tool.bestFor || 'N/A')}</p>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-2">Not Ideal For</h3>
                    <p class="text-sm text-[#a3a3a3] leading-relaxed">${escapeHtml(tool.notIdealFor || 'N/A')}</p>
                </div>

                <div class="mt-auto pt-4 border-t border-[#333]">
                    <h3 class="text-white font-semibold mb-2">Verdict</h3>
                    <p class="text-sm text-[#a3a3a3] italic">${escapeHtml(tool.verdict || 'N/A')}</p>
                </div>
            </div>
        `;

        grid.appendChild(card);
        });
    }

    renderCompareGrid();
    analytics.track(EVENTS.COMPARE_BUILT, {
        trigger: 'comparison',
        subject: toolsToCompare.map(tool => tool.slug).join(','),
        value: toolsToCompare.length,
    });

    if (ENABLE_VOTING) {
        const bootstrapVoting = async () => {
            try {
                const [{ getVoteCount: voteCountFn, initVoting }, { auth }, { bindAuthSession }] = await Promise.all([
                    import('./voting.js'),
                    import('./auth.js'),
                    import('./auth-session-binding.js')
                ]);

                await bindAuthSession({ authManager: auth });
                getVoteCount = voteCountFn;
                isAuthenticated = () => auth.isAuthenticated();

                refreshZapButtons();
                await initVoting();
                renderTurnstile(CF_SITEKEY);
            } catch (error) {
                console.warn('[compare] voting bootstrap failed:', error);
            }
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
                bootstrapVoting();
            }, { timeout: 1500 });
        } else {
            setTimeout(() => {
                bootstrapVoting();
            }, 0);
        }
    }
});
