/**
 * Shared page chrome (sidebar, mobile header, desktop toggle) for the
 * tool-detail pages.
 *
 * Why this exists: each generated /tools/<slug>.html used to embed ~20KB of
 * identical sidebar/footer HTML. This module injects that chrome at runtime
 * from a single shared file so the per-tool HTML stays small (~5KB vs ~24KB).
 *
 * Load order requirement:
 *   This script is loaded with `defer` BEFORE `dist/app.js` so that by the
 *   time app.js's DOMContentLoaded handler runs, all the sidebar elements it
 *   looks for (`#sidebar`, `#dashboardNav`, `#googleSignInBtn`, ...) exist.
 *
 * Non-goals: this module is NOT used on the root index, token-counter, or
 * hallucination-scorer pages — they still ship their sidebar inline for now.
 */

const SIDEBAR_CONTENT_HTML = `
<div class="py-4 px-6 flex items-center justify-between border-b border-[#222] shrink-0 sticky top-0 bg-[#0a0a0a] z-10">
    <a href="/" class="group flex items-center gap-3 no-underline transition-all">
        <img src="../images/icons/favicon-96x96.png" alt="dosa.dev logo" class="shrink-0 w-7 h-7 transition-transform duration-300 group-hover:scale-105" />
        <div class="flex flex-col gap-0.5">
            <div class="text-[18px] font-semibold tracking-wide text-white m-0 leading-none">ai.dosa.dev</div>
            <div class="font-mono text-xs text-[#737373]"><span class="app-version"></span></div>
        </div>
    </a>
    <button id="closeSidebarMobile" class="md:hidden text-[#737373] hover:text-white p-2 shrink-0">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <button id="collapseSidebarDesktop" class="hidden md:block text-[#a3a3a3] hover:text-white p-1.5 rounded-md hover:bg-white/5 transition-colors shrink-0" title="Close sidebar">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
    </button>
</div>

<div class="py-5 px-6 text-[#a3a3a3] border-b border-[#222] shrink-0">
    <p class="text-[15px] leading-relaxed mb-5">A curated list of artificial intelligence-powered coding instruments, frameworks, and agents.</p>
    <div class="flex flex-col gap-2.5">
        <a href="/" class="inline-flex items-center justify-center py-2 px-4 bg-white text-black text-sm font-semibold rounded-md transition-all duration-200 hover:bg-gray-200 hover:-translate-y-px w-full">Back to Directory</a>
        <a href="https://github.com/QAInsights/awesome-ai-tools/issues/new?template=submit-tool.yml" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center py-2 px-4 bg-white/5 text-white text-sm font-medium border border-[#222] rounded-md transition-all duration-200 hover:bg-white/10 w-full hover:-translate-y-px">Submit a Tool</a>
    </div>
</div>

<nav class="flex flex-col px-4 py-2 gap-1 border-b border-[#222] md:flex-1 md:min-h-0 md:overflow-y-auto" id="dashboardNav" style="scrollbar-width: thin;">
    <div class="font-mono text-[12px] uppercase text-[#737373] mb-2 pl-2 tracking-widest mt-2 hidden md:block">Account</div>
    <a href="../settings.html" class="filter-btn flex items-center">Settings</a>
    <a href="../zap.html" class="filter-btn flex items-center">Zap Dashboard</a>
    <a href="../help.html" class="filter-btn flex items-center">Help &amp; Support</a>
    <button class="filter-btn text-left badge-trigger flex items-center">Get Badge</button>

    <div class="font-mono text-[12px] uppercase text-[#737373] mb-1 pl-2 tracking-widest mt-4 hidden md:block">AI Utilities</div>
    <a href="./token-counter.html" class="filter-btn flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 12h6M8 15h4"/></svg>
        Token Counter
    </a>
    <a href="./hallucination-scorer.html" class="filter-btn flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Hallucination Scorer
    </a>

    <div class="mt-4 pb-2">
        <a href="/" class="text-[14px] text-[#737373] hover:text-white transition-colors flex items-center gap-2 pl-2">&larr; Back to Directory</a>
    </div>
</nav>

<div class="mx-4 my-4 p-4 border border-dashed border-[#222] rounded-md bg-white/[0.01] shrink-0">
    <div class="font-mono text-[11px] uppercase text-[#737373] mb-1.5 tracking-wide">Featured</div>
    <div class="text-[13px] text-[#a3a3a3] leading-relaxed">
        Promote your AI tool directly to developers. <br>
        <a href="https://book.qainsights.com" target="_blank" rel="noopener noreferrer" class="gradient-link inline-block mt-1.5 font-mono hover:underline">Book this space &rarr;</a>
    </div>
</div>

<div class="px-4 py-3 border-t border-[#222] shrink-0 bg-[#0a0a0a] sticky bottom-0 z-20 md:static md:z-auto">
    <div class="flex flex-col items-center gap-2.5 w-full">
        <div id="googleSignInBtn" class="flex justify-center w-full min-h-[40px]"></div>
        <div id="githubSignInBtn" class="flex justify-center w-full"></div>
    </div>
    <div id="userProfile" class="hidden relative">
        <div id="userProfileBtn" class="flex items-center gap-3 p-2 bg-white/5 rounded-md border border-[#222] cursor-pointer hover:bg-white/10 transition-colors">
            <img id="userAvatar" src="" alt="User" class="w-8 h-8 rounded-full pointer-events-none">
            <div class="flex-1 min-w-0 pointer-events-none">
                <div id="userName" class="text-sm font-medium text-white truncate"></div>
                <div id="userEmail" class="text-xs text-[#a3a3a3] truncate"></div>
            </div>
        </div>
        <div id="userMenuPopup" class="hidden absolute bottom-[calc(100%+8px)] left-0 w-full bg-[#111] border border-[#222] rounded-md shadow-xl z-50 py-1">
            <a href="../settings.html" class="flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Settings</a>
            <a href="../zap.html" class="flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Zap</a>
            <a href="../help.html" class="flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Help</a>
            <a href="./token-counter.html" class="flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Token Counter</a>
            <a href="./hallucination-scorer.html" class="flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Hallucination Scorer</a>
            <button id="getBadgeMenuBtn" class="w-full text-left flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Get Badge</button>
            <div class="h-px bg-[#222] my-1"></div>
            <button id="signOutBtn" class="w-full text-left flex items-center px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-white/5 transition-colors">Sign Out</button>
        </div>
    </div>
</div>

<footer class="px-5 py-4 border-t border-[#222] shrink-0 mt-auto bg-[#0a0a0a]">
    <div class="flex flex-wrap gap-x-3 gap-y-1.5 mb-2">
        <a href="https://github.com/QAInsights/awesome-ai-tools" target="_blank" rel="noopener noreferrer" class="text-[13px] text-[#a3a3a3] hover:text-white transition-colors">GitHub</a>
        <a href="https://dosa.dev" target="_blank" rel="noopener noreferrer" class="text-[13px] text-[#a3a3a3] hover:text-white transition-colors">dosa.dev</a>
        <a href="https://qainsights.com" target="_blank" rel="noopener noreferrer" class="text-[13px] text-[#a3a3a3] hover:text-white transition-colors">qainsights.com</a>
        <a href="https://jmeter.ai" target="_blank" rel="noopener noreferrer" class="text-[13px] text-[#a3a3a3] hover:text-white transition-colors">jmeter.ai</a>
    </div>
    <div class="font-mono text-[12px] text-[#737373] mb-1 footer-copy">&copy; dosa.dev</div>
</footer>
`;

const MOBILE_HEADER_HTML = `
<div class="md:hidden flex items-center justify-between p-4 border-b border-[#222] bg-[#0a0a0a] shrink-0 z-10 sticky top-0">
    <div class="flex items-center gap-3">
        <button id="openSidebarMobile" class="text-[#a3a3a3] hover:text-white transition-colors p-1 rounded-md hover:bg-white/5">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div class="flex items-center gap-2 min-w-0">
            <img src="../images/icons/favicon-32x32.png" alt="logo" class="w-6 h-6 rounded-full" />
            <span id="mobileHeaderTitle" class="text-[17px] font-semibold tracking-wide text-white leading-none truncate"></span>
        </div>
    </div>
</div>
`;

const DESKTOP_TOGGLE_HTML = `
<button id="openSidebarDesktop" class="text-[#a3a3a3] hover:text-white p-1.5 bg-[#0a0a0a] border border-[#222] rounded-md shadow-sm transition-all hover:bg-white/5 backdrop-blur-sm" title="Open sidebar">
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
</button>
`;

// Tool-detail page sections below the hero. These are fully generic (no
// per-tool values) and are populated by tool-detail.js after hydration.
const DETAIL_SECTIONS_HTML = `
<div id="comingSoonBanner" class="hidden td-card flex items-start gap-3 border-dashed">
    <svg class="w-5 h-5 text-[#737373] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div class="text-[14px] text-[#a3a3a3] leading-relaxed">
        <div class="text-white font-medium mb-0.5">Enriched details coming soon</div>
        We're still gathering pricing, key features, and reviewer notes for this tool. In the meantime, visit the official site for more.
    </div>
</div>
<div id="enrichedSkeleton" class="flex flex-col gap-4">
    <div class="td-shimmer h-4 w-24"></div>
    <div class="td-shimmer h-5 w-3/4"></div>
    <div class="td-shimmer h-5 w-2/3"></div>
    <div class="td-shimmer h-5 w-1/2"></div>
    <div class="td-shimmer h-24 w-full mt-4"></div>
</div>
<section id="featuresSection" class="hidden td-section">
    <div class="td-section-label">Key Features</div>
    <ul id="featuresList" class="flex flex-col gap-3"></ul>
</section>
<section id="fitSection" class="hidden td-section">
    <div class="td-section-label">Who It's For</div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="td-card">
            <div class="font-mono text-[11px] uppercase text-[#4ade80] tracking-wide mb-2">&#10003; Best For</div>
            <p id="bestFor" class="text-[15px] leading-relaxed text-[#d4d4d4]"></p>
        </div>
        <div class="td-card">
            <div class="font-mono text-[11px] uppercase text-[#f87171] tracking-wide mb-2">&#10007; Not Ideal For</div>
            <p id="notIdealFor" class="text-[15px] leading-relaxed text-[#d4d4d4]"></p>
        </div>
    </div>
</section>
<section id="pricingSection" class="hidden td-section">
    <div class="td-section-label">Pricing</div>
    <div class="td-card">
        <div class="flex items-center gap-3 mb-2">
            <span id="pricingLabel" class="inline-block px-3 py-1 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-full font-mono text-[12px] text-[#c4b5fd] tracking-wide"></span>
        </div>
        <p id="pricingDetail" class="text-[15px] leading-relaxed text-[#d4d4d4]"></p>
    </div>
</section>
<section id="updatesSection" class="hidden td-section">
    <div class="td-section-label">Recent Updates</div>
    <div class="td-card"><p id="recentUpdates" class="text-[15px] leading-relaxed text-[#d4d4d4]"></p></div>
</section>
<section id="verdictSection" class="hidden td-section">
    <div class="td-section-label">Verdict</div>
    <blockquote class="td-verdict"><span id="verdictText"></span></blockquote>
</section>
<section id="tagsSection" class="hidden td-section">
    <div class="td-section-label">Tags</div>
    <div id="tagsList" class="flex flex-wrap gap-2"></div>
</section>
<div id="lastUpdatedRow" class="hidden font-mono text-[11px] text-[#525252] tracking-wide py-4">
    Last updated: <span id="lastUpdated"></span>
</div>
<div class="py-6">
    <a href="/" class="inline-flex items-center gap-2 text-[14px] text-[#737373] hover:text-white transition-colors">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        Back to directory
    </a>
</div>
<div class="td-section" style="padding-top: 0;">
    <div class="flex items-start gap-3 py-4 px-4 border border-[#222] rounded-lg bg-white/[0.02]">
        <svg class="w-5 h-5 text-[#737373] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p class="text-[13px] text-[#737373] leading-relaxed">
            Content on this page is AI-generated. Please verify details with the vendor's website for accuracy.
        </p>
    </div>
</div>
`;

/**
 * Inject shared chrome into the placeholder containers if they exist and are
 * currently empty. Idempotent — safe to call multiple times.
 */
export function injectShell() {
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent && !sidebarContent.firstElementChild) {
        sidebarContent.innerHTML = SIDEBAR_CONTENT_HTML;
    }

    const mobileHeader = document.getElementById('mobileHeader');
    if (mobileHeader && !mobileHeader.firstElementChild) {
        mobileHeader.innerHTML = MOBILE_HEADER_HTML;
    }

    const desktopToggle = document.getElementById('desktopToggleContainer');
    if (desktopToggle && !desktopToggle.firstElementChild) {
        desktopToggle.innerHTML = DESKTOP_TOGGLE_HTML;
    }

    const detailSections = document.getElementById('detailSections');
    if (detailSections && !detailSections.firstElementChild) {
        detailSections.innerHTML = DETAIL_SECTIONS_HTML;
    }
}

// Run immediately on module eval. Because this module is loaded with `defer`,
// the DOM is already parsed when we reach this point, so the placeholder
// containers exist.
injectShell();
