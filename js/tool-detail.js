/**
 * Tool Detail Page — runtime hydration.
 *
 * Flow:
 *   1. Read seed data (name, company, category, notes, url, slug) from the
 *      inline <script id="tool-seed"> block. Paint minimal view instantly.
 *   2. Read enriched data from <script id="tool-enriched"> if present.
 *      This is embedded at build time from generate-tool-pages.js.
 *   3. If enriched data exists, render it immediately. Otherwise show
 *      "Enriched details coming soon" banner.
 *
 * Memory-efficient: No fetch of large JSON, no localStorage cache bloat.
 */

const ENRICHED_URL = '/data/enriched-tools.json';

document.addEventListener('DOMContentLoaded', () => {
    const seed = readSeed();
    if (!seed) {
        console.warn('[tool-detail] Missing tool-seed block; aborting hydration.');
        return;
    }

    // --- First paint from seed ------------------------------------------------
    paintSeed(seed);

    // --- Read embedded enriched data (build-time injected) --------------------
    const enriched = readEnriched();
    if (enriched) {
        paintEnriched(seed, enriched);
    } else {
        // No enriched data embedded — try fetching (for dev/old pages)
        // or show coming soon banner
        fetchEnriched().then(fresh => {
            if (!fresh) {
                showComingSoon();
                return;
            }
            const match = fresh.find(t => t.slug === seed.slug);
            if (match) {
                paintEnriched(seed, match);
            } else {
                showComingSoon();
            }
        }).catch(err => {
            console.warn('[tool-detail] Enriched fetch failed:', err);
            showComingSoon();
        });
    }
});

/* ---------------------------------------------------------------------------- */
/* Data readers                                                                 */
/* ---------------------------------------------------------------------------- */

function readSeed() {
    const el = document.getElementById('tool-seed');
    if (!el) return null;
    try {
        return JSON.parse(el.textContent || '{}');
    } catch {
        return null;
    }
}

function readEnriched() {
    const el = document.getElementById('tool-enriched');
    if (!el) return null;
    try {
        const data = JSON.parse(el.textContent || 'null');
        // Null means no enriched data available for this tool
        return data;
    } catch {
        return null;
    }
}

async function fetchEnriched() {
    const res = await fetch(ENRICHED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Enriched payload is not an array');
    return data;
}

/* ---------------------------------------------------------------------------- */
/* Rendering                                                                    */
/* ---------------------------------------------------------------------------- */

function paintSeed(seed) {
    setText('toolName', seed.name);
    setText('toolCompany', seed.company);
    setText('toolCategory', stripEmoji(seed.category));
    setText('toolDescription', seed.notes || '');
    setAttr('externalLink', 'href', seed.url || '#');

    // Update breadcrumb
    setText('breadcrumbCategory', stripEmoji(seed.category));
    setText('breadcrumbTool', seed.name);

    // Mobile header title
    setText('mobileHeaderTitle', seed.name);

    hide('enrichedSkeleton', false);  // keep skeleton visible for enriched sections until data arrives
}

function paintEnriched(seed, data) {
    hide('enrichedSkeleton', true);
    hide('comingSoonBanner', true);

    // Enriched payload is authoritative for display fields — override seed
    if (data.name) {
        setText('toolName', data.name);
        setText('breadcrumbTool', data.name);
        setText('mobileHeaderTitle', data.name);
        document.title = `${data.name} — ${data.company || seed.company} | ai.dosa.dev`;
    }
    if (data.company) setText('toolCompany', data.company);

    // Description: prefer enriched, fall back to README notes
    if (data.description) setText('toolDescription', data.description);

    // Pricing
    if (data.pricing || data.pricingDetail) {
        show('pricingSection');
        setText('pricingLabel', humanizePricing(data.pricing));
        setText('pricingDetail', data.pricingDetail || '');
    }

    // Key features
    if (Array.isArray(data.keyFeatures) && data.keyFeatures.length) {
        show('featuresSection');
        const list = document.getElementById('featuresList');
        if (list) {
            list.innerHTML = data.keyFeatures.map(f => `
                <li class="flex items-start gap-3">
                    <svg class="w-5 h-5 shrink-0 text-[#a78bfa] mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="text-[15px] leading-relaxed text-[#d4d4d4]">${escapeHtml(f)}</span>
                </li>`).join('');
        }
    }

    // Best for / Not ideal for
    if (data.bestFor || data.notIdealFor) {
        show('fitSection');
        setText('bestFor', data.bestFor || '—');
        setText('notIdealFor', data.notIdealFor || '—');
    }

    // Recent updates
    if (data.recentUpdates) {
        show('updatesSection');
        setText('recentUpdates', data.recentUpdates);
    }

    // Verdict
    if (data.verdict) {
        show('verdictSection');
        setText('verdictText', data.verdict);
    }

    // Tags
    if (Array.isArray(data.tags) && data.tags.length) {
        show('tagsSection');
        const container = document.getElementById('tagsList');
        if (container) {
            container.innerHTML = data.tags.map(tag => `
                <span class="inline-block px-3 py-1 border border-[#222] rounded-full bg-white/5 font-mono text-[12px] text-[#a3a3a3] tracking-wide">${escapeHtml(tag)}</span>
            `).join('');
        }
    }

    // Last updated
    if (data.lastUpdated) {
        show('lastUpdatedRow');
        setText('lastUpdated', formatDate(data.lastUpdated));
    }

    // Refine document title + meta description with enriched content
    if (data.description) {
        updateMeta('description', truncate(data.description, 155));
        updateMeta('og:description', truncate(data.description, 200), 'property');
        updateMeta('twitter:description', truncate(data.description, 200));
    }
}

function showComingSoon() {
    hide('enrichedSkeleton', true);
    show('comingSoonBanner');
}

/* ---------------------------------------------------------------------------- */
/* DOM + text utilities                                                         */
/* ---------------------------------------------------------------------------- */

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setAttr(id, name, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(name, value);
}

function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hide(id, shouldHide = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', shouldHide);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripEmoji(str) {
    return String(str ?? '')
        .replace(/[\u2700-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\uFE00-\uFE0F]/g, '')
        .trim();
}

function truncate(str, max) {
    const s = String(str ?? '');
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
}

function humanizePricing(val) {
    if (!val) return '';
    const map = { free: 'Free', freemium: 'Freemium', paid: 'Paid', open_source: 'Open Source', oss: 'Open Source', enterprise: 'Enterprise' };
    const key = String(val).toLowerCase();
    return map[key] || (val.charAt(0).toUpperCase() + val.slice(1));
}

function formatDate(iso) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return iso;
    }
}

function updateMeta(name, content, attr = 'name') {
    const selector = `meta[${attr}="${name}"]`;
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', content);
}
