/**
 * Main application entry point
 * AI IDEs & Coding Assistants - Tool Registry
 */

import { parseMarkdown, extractCategories } from './parser.js';
import { initRenderer, filterTools, renderTools } from './renderer.js';
import { initVoting } from './voting.js';
import { getSortState, setSortState, updateSortUI } from './sorting.js';
import { auth } from './auth.js';
import { CollapsedSidebar } from './collapsed-sidebar.js';
import { Accordion } from './accordion.js';
import { APP_VERSION } from './version.js';
import { initGradientSelection } from './gradient-selection.js';
import { toggleTool, isSelected, getSelected, clearSelection } from './compare-state.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGradientSelection();
    const grid = document.getElementById('toolGrid');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const resultCount = document.getElementById('resultCount');
    const categoryFilters = document.getElementById('categoryFilters');
    
    let toolsData = [];
    let categories = new Set();
    let currentCategory = 'all';
    let collapsedSidebar = null;

    const ENABLE_VOTING = process.env.ENABLE_VOTING === 'true';
    const CF_SITEKEY = process.env.CF_SITEKEY || "1x00000000000000000000AA";

    if (ENABLE_VOTING) {
        function renderTurnstile() {
            if (typeof turnstile !== 'undefined') {
                window.turnstileWidgetId = turnstile.render("#turnstile-container", {
                    sitekey: CF_SITEKEY,
                    size: 'invisible',
                    callback: function (token) {
                        console.log("Turnstile generated token successfully!");
                        window.cfTokenValue = token;
                    },
                    "error-callback": function (error) {
                        console.error("Turnstile error:", error);
                    }
                });
            } else {
                setTimeout(renderTurnstile, 100);
            }
        }
        renderTurnstile();
    }
    
    // Initialize renderer
    if (grid) {
        initRenderer(grid);
    }
    
    const categoriesAccordion = new Accordion({
        toggleId: 'categoriesToggle',
        contentId: 'categoriesContent',
        iconId: 'categoriesToggleIcon',
        countId: 'categoriesCount',
    });
    categoriesAccordion.expand();

    // Initialize authentication
    await initializeAuth();
    
    // Load data only if we're on the registry page
    if (grid) {
        try {
            // Kick off vote fetch in parallel — don't block render on backend latency.
            // initVoting() patches counts into already-rendered buttons when it resolves.
            const votingPromise = initVoting().catch(err => {
                console.warn('[voting] init failed; rendering with zero counts:', err);
            });

            // ── Data loading ──────────────────────────────────────────────────
            // Astro build: tool data is embedded at build time in #tools-data.
            // Legacy HTML: fall back to fetching and parsing README.md at runtime.
            const toolsDataEl = document.getElementById('tools-data');
            if (toolsDataEl) {
                // Fast path — build-time JSON (Astro). No network request needed.
                const parsed = JSON.parse(toolsDataEl.textContent || '[]');
                // Astro embeds the full Tool shape {slug, name, company, category,
                // categoryClean, categoryShort, notes, url, enriched}.
                // renderer.js only needs the seed fields — drop 'enriched' to keep
                // client-side state small.
                toolsData = parsed.map(({ enriched: _e, ...seed }) => seed);
                categories = extractCategories(toolsData);
            } else {
                // Legacy path — runtime README fetch (settings/help/zap pages and old HTML).
                const readmeResponse = await fetch('README.md');
                if (!readmeResponse.ok) throw new Error('Failed to fetch README');
                const text = await readmeResponse.text();
                toolsData = parseMarkdown(text);
                categories = extractCategories(toolsData);
            }
            // ─────────────────────────────────────────────────────────────────

            renderFilters();
            
            // Minor Feature: Check for ?q= search parameters to allow sharing specific search results!
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('q')) {
                searchInput.value = urlParams.get('q');
            }
            
            // Ensure UI reflects the default sort state on page load
            updateSortUI();
            
            filterAndRender();
        } catch (error) {
            console.error('Error loading tools:', error);
            grid.innerHTML = `<p style="color: var(--text-secondary); padding: 32px;">Could not load registry. Ensure you are running via a local server.</p>`;
        }
    }

    
    /**
     * Render category filter buttons
     */
    function renderFilters() {
        const categoriesContent = document.getElementById('categoriesContent');

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
            categoriesContent.appendChild(btn);
        });

        document.querySelector('[data-category="all"]').addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = 'all';
            filterAndRender();
        });

        categoriesAccordion.setCount(categories.size);
        categoriesAccordion.expand();
    }
    
    /**
     * Filter and render tools
     */
    function filterAndRender() {
        const searchVal = searchInput.value;
        const filtered = filterTools(toolsData, currentCategory, searchVal);
        renderTools(filtered, searchVal, () => clearAll());
        updateResultCount(filtered.length, toolsData.length);
        searchClear.classList.toggle('visible', searchVal.length > 0);
        
        // Sync URL so users can copy-paste their search directly
        const url = new URL(window.location);
        if (searchVal) {
            url.searchParams.set('q', searchVal);
        } else {
            url.searchParams.delete('q');
        }
        window.history.replaceState({}, '', url);
    }

    /**
     * Handle sort header click
     */
    function handleSortClick(column) {
        const currentState = getSortState();
        let newDirection = 'asc';
        
        if (currentState.column === column) {
            newDirection = currentState.direction === 'asc' ? 'desc' : 'asc';
        }
        
        setSortState(column, newDirection);
        updateSortUI();
        filterAndRender();
    }

    // Add click listeners to sort headers
    const sortHeaders = document.querySelectorAll('[data-sort]');
    sortHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSortClick(header.dataset.sort);
        });
    });

    /**
     * Update the result count display
     */
    function updateResultCount(shown, total) {
        if (shown === total) {
            resultCount.textContent = `${total} tools`;
        } else {
            resultCount.textContent = `${shown} of ${total} tools`;
        }
    }

    /**
     * Clear search and reset filters
     */
    function clearAll() {
        searchInput.value = '';
        currentCategory = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-category="all"]').classList.add('active');
        filterAndRender();
    }
    
    // Clear button click
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            filterAndRender();
        });
    }

    // Event listeners
    if (searchInput) {
        searchInput.addEventListener('input', filterAndRender);
    }
    
    // Update year in footer
    updateYear();

    // Stamp version into all sidebar logo areas
    document.querySelectorAll('.app-version').forEach(el => {
        el.textContent = APP_VERSION;
    });

    function updateYear() {
        const year = new Date().getFullYear();
        const yearElement = document.querySelector('.footer-copy');
        yearElement.textContent = `© ${year} dosa.dev`;
    }

    /**
     * Initialize authentication system (Google + GitHub)
     */
    async function initializeAuth() {
        try {
            await auth.initialize();
            
            // Set up auth state listener
            auth.onAuthChange(handleAuthStateChange);
            
            // Set up sign out button
            const signOutBtn = document.getElementById('signOutBtn');
            if (signOutBtn) {
                signOutBtn.addEventListener('click', () => {
                    auth.signOut();
                    const userMenuPopup = document.getElementById('userMenuPopup');
                    if (userMenuPopup) userMenuPopup.classList.add('hidden');
                });
            }

            // Set up user profile popup toggling
            const userProfileBtn = document.getElementById('userProfileBtn');
            const userMenuPopup = document.getElementById('userMenuPopup');
            if (userProfileBtn && userMenuPopup) {
                userProfileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userMenuPopup.classList.toggle('hidden');
                });
                
                document.addEventListener('click', (e) => {
                    if (!userProfileBtn.contains(e.target) && !userMenuPopup.contains(e.target)) {
                        userMenuPopup.classList.add('hidden');
                    }
                });
            }
            
            // Initial UI update
            updateAuthUI();
            
        } catch (error) {
            console.error('Failed to initialize auth:', error);
        }
    }

    /**
     * Handle authentication state changes
     */
    function handleAuthStateChange({ event, user, error }) {
        if (error) {
            console.error('Auth error:', error);
            return;
        }
        updateAuthUI();
    }

    /**
     * Update authentication UI based on current state
     */
    function updateAuthUI() {
        const googleBtn = document.getElementById('googleSignInBtn');
        const githubBtn = document.getElementById('githubSignInBtn');
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');

        if (auth.isAuthenticated()) {
            const user = auth.getCurrentUser();

            // Show user profile
            if (userProfile) {
                userProfile.classList.remove('hidden');
                if (userAvatar) userAvatar.src = user.picture;
                if (userName) userName.textContent = user.name;
                if (userEmail) userEmail.textContent = user.email;
            }

            // Hide sign-in buttons
            if (googleBtn) googleBtn.classList.add('hidden');
            if (githubBtn) githubBtn.classList.add('hidden');
        } else {
            // Show sign-in buttons
            if (googleBtn) {
                googleBtn.classList.remove('hidden');
                if (auth.isInitialized) {
                    auth.renderSignInButton('googleSignInBtn', {
                        theme: 'filled_black',
                        size: 'large',
                        text: 'signin_with',
                        shape: 'rectangular',
                        width: 280
                    });
                }
            }
            if (githubBtn) {
                githubBtn.classList.remove('hidden');
                if (auth.isInitialized) {
                    auth.renderGitHubSignInButton('githubSignInBtn');
                }
            }

            // Hide user profile
            if (userProfile) {
                userProfile.classList.add('hidden');
            }
        }
    }

    // Comparison UI Logic
    const compareFloatingBar = document.getElementById('compareFloatingBar');
    const compareCountText = document.getElementById('compareCountText');
    const clearCompareBtn = document.getElementById('clearCompareBtn');
    const compareBtn = document.getElementById('compareBtn');

    function updateCompareUI() {
        const selected = getSelected();
        if (selected.length > 0) {
            compareFloatingBar.classList.remove('translate-y-full');
            compareCountText.textContent = `${selected.length} / 3 tools selected`;
            compareBtn.disabled = selected.length < 2;
        } else {
            compareFloatingBar.classList.add('translate-y-full');
        }

        // Update toggle switch states in the grid
        document.querySelectorAll('.compare-toggle-switch').forEach(label => {
            const slug = label.getAttribute('data-slug');
            const checkbox = label.querySelector('input[type="checkbox"]');
            if (isSelected(slug)) {
                label.classList.add('active');
                if (checkbox) checkbox.checked = true;
            } else {
                label.classList.remove('active');
                if (checkbox) checkbox.checked = false;
            }
        });
    }

    grid.addEventListener('click', (e) => {
        const toggle = e.target.closest('.compare-toggle-switch');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            const slug = toggle.getAttribute('data-slug');
            if (!slug) {
                // If the tool has no slug, we might need a fallback or prevent it
                alert("This tool cannot be compared yet.");
                return;
            }
            if (!toggleTool(slug)) {
                alert("You can compare up to 3 tools at a time.");
            }
            updateCompareUI();
        }
    });

    clearCompareBtn.addEventListener('click', () => {
        clearSelection();
        updateCompareUI();
    });

    compareBtn.addEventListener('click', () => {
        const selected = getSelected();
        if (selected.length >= 2) {
            window.location.href = `/compare.html?tools=${selected.join(',')}`;
        }
    });

    // Badge Modal Logic
            const badgeTriggers = document.querySelectorAll('#getBadgeMenuBtn, .badge-trigger');
            if (badgeTriggers.length > 0) {
                // Inject modal HTML into DOM if not exists to avoid HTML replication
                if (!document.getElementById('badgeModal')) {
                    const modalHtml = `
                    <div id="badgeModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200">
                        <div class="bg-[#111] border border-[#222] rounded-xl p-6 w-full max-w-md transform scale-95 transition-transform duration-200" id="badgeModalInner">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-white font-semibold">Your GitHub Badge</h3>
                                <button id="closeBadgeModalBtn" class="text-[#737373] hover:text-white transition-colors text-2xl leading-none">&times;</button>
                            </div>
                            <div class="mb-4 flex justify-center p-6 bg-black rounded-lg border border-[#222]">
                                <img id="badgePreview" src="" alt="Badge Preview" />
                            </div>
                            <div class="relative">
                                <textarea id="badgeMarkdown" class="w-full bg-black border border-[#222] text-[#a3a3a3] text-xs font-mono p-3 rounded-md h-24 focus:outline-none focus:border-[#444] resize-none" readonly></textarea>
                                <button id="copyBadgeBtn" class="absolute bottom-3 right-3 bg-white text-black px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-200 transition-colors">Copy</button>
                            </div>
                        </div>
                    </div>`;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                }

                const badgeModal = document.getElementById('badgeModal');
                const badgeModalInner = document.getElementById('badgeModalInner');
                const closeBadgeModalBtn = document.getElementById('closeBadgeModalBtn');
                const badgePreview = document.getElementById('badgePreview');
                const badgeMarkdown = document.getElementById('badgeMarkdown');
                const copyBadgeBtn = document.getElementById('copyBadgeBtn');

                badgeTriggers.forEach(triggerBtn => {
                    triggerBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (userMenuPopup) userMenuPopup.classList.add('hidden'); // Close dropdown
                    
                    const user = auth.getCurrentUser();
                    if (!user) return;
                    
                    // Prefer GitHub username for badge (more useful for devs); fall back to display name
                    let badgeLabel;
                    if (user.githubUsername) {
                        badgeLabel = encodeURIComponent(`@${user.githubUsername}`);
                    } else {
                        let safeName = user.name.trim().replace(/\s+/g, '_');
                        badgeLabel = encodeURIComponent(safeName);
                    }
                    
                    const badgeUrl = `https://img.shields.io/badge/My_Awesome_AI_Tools-${badgeLabel}-a78bfa?style=for-the-badge&logo=github`;
                    const markdown = `[![My AI Stack](${badgeUrl})](https://ai.dosa.dev)`;
                    
                    badgePreview.src = badgeUrl;
                    badgeMarkdown.value = markdown;
                    
                    // Show Modal
                    badgeModal.classList.remove('hidden');
                        // Trigger reflow for transition
                        void badgeModal.offsetWidth;
                        badgeModal.classList.remove('opacity-0');
                        badgeModalInner.classList.remove('scale-95');
                    });
                });

                const hideModal = () => {
                    badgeModal.classList.add('opacity-0');
                    badgeModalInner.classList.add('scale-95');
                    setTimeout(() => badgeModal.classList.add('hidden'), 200);
                    // Reset copy button
                    copyBadgeBtn.textContent = 'Copy';
                    copyBadgeBtn.className = 'absolute bottom-3 right-3 bg-white text-black px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-200 transition-colors';
                };

                closeBadgeModalBtn.addEventListener('click', hideModal);
                badgeModal.addEventListener('click', (e) => {
                    if (e.target === badgeModal) hideModal();
                });

                copyBadgeBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(badgeMarkdown.value);
                        copyBadgeBtn.textContent = 'Copied!';
                        copyBadgeBtn.className = 'absolute bottom-3 right-3 bg-[#a78bfa] text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors';
                        setTimeout(() => {
                            copyBadgeBtn.textContent = 'Copy';
                            copyBadgeBtn.className = 'absolute bottom-3 right-3 bg-white text-black px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-200 transition-colors';
                        }, 2000);
                    } catch (err) {
                        console.error('Failed to copy', err);
                    }
                });
            }

            // Initial UI update
            updateAuthUI();
            
        } catch (error) {
            console.error('Failed to initialize auth:', error);
        }
    }

    /**
     * Handle authentication state changes
     */
    function handleAuthStateChange({ event, user, error }) {
        console.log('Auth state changed:', event, user?.name);
        
        if (error) {
            console.error('Auth error:', error);
            return;
        }
        
        updateAuthUI();
        
        // Re-render tools so vote buttons update their auth-gated visual state
        if (grid && toolsData.length > 0) {
            filterAndRender();
        }

        switch (event) {
            case 'signin':
                console.log('Welcome back!', user.name);
                break;
            case 'signout':
                console.log('Signed out successfully');
                break;
            case 'session_restored':
                console.log('Session restored for', user.name);
                break;
        }
    }

    /**
     * Update authentication UI based on current state
     */
    function updateAuthUI() {
        const signInBtn = document.getElementById('googleSignInBtn');
        const githubSignInBtn = document.getElementById('githubSignInBtn');
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');

        if (auth.isAuthenticated()) {
            const user = auth.getCurrentUser();

            // Show user profile
            if (userProfile) {
                userProfile.classList.remove('hidden');
                if (userAvatar) userAvatar.src = user.picture;
                if (userName) {
                    // Show GitHub username alongside name for GitHub users
                    userName.textContent = user.githubUsername
                        ? `${user.name} (@${user.githubUsername})`
                        : user.name;
                }
                if (userEmail) userEmail.textContent = user.email || '';
            }

            // Hide both sign-in button containers
            if (signInBtn) signInBtn.classList.add('hidden');
            if (githubSignInBtn) githubSignInBtn.classList.add('hidden');

            // Update collapsed sidebar
            collapsedSidebar?.setAuthState(true, user.picture);
        } else {
            // Show Google sign-in button container
            if (signInBtn) {
                signInBtn.classList.remove('hidden');
                if (auth.isInitialized) {
                    auth.renderSignInButton('googleSignInBtn', {
                        theme: 'filled_black',
                        size: 'large',
                        text: 'signin_with',
                        shape: 'rectangular',
                        width: 280
                    });
                }
            }

            // Show GitHub sign-in button container
            if (githubSignInBtn) {
                githubSignInBtn.classList.remove('hidden');
                auth.renderGitHubSignInButton('githubSignInBtn');
            }

            // Hide user profile
            if (userProfile) {
                userProfile.classList.add('hidden');
            }

            // Update collapsed sidebar
            collapsedSidebar?.setAuthState(false);
        }
    }

    // Sidebar Toggle Logic
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebarContent');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const collapseDesktop = document.getElementById('collapseSidebarDesktop');
    const desktopToggleContainer = document.getElementById('desktopToggleContainer');
    const openMobile = document.getElementById('openSidebarMobile');
    const closeMobile = document.getElementById('closeSidebarMobile');
    const thName = document.getElementById('thName');
    const tableHeader = document.getElementById('tableHeader');
    const toolGrid = document.getElementById('toolGrid');

    const toggleDesktopSidebar = (collapse) => {
        if (collapse) {
            sidebar.classList.add('desktop-collapsed');
            desktopToggleContainer.classList.remove('hidden');
        } else {
            sidebar.classList.remove('desktop-collapsed');
            desktopToggleContainer.classList.add('hidden');
        }
    };

    // Initialize Collapsed Sidebar Component (after toggleDesktopSidebar is defined)
    collapsedSidebar = new CollapsedSidebar('iconSidebar', {
        onExpand: () => toggleDesktopSidebar(false),
        onSearchClick: () => {
            toggleDesktopSidebar(false);
            setTimeout(() => searchInput.focus(), 300);
        },
        onSignInClick: () => {
            toggleDesktopSidebar(false);
            setTimeout(() => {
                const signInContainer = document.getElementById('googleSignInBtn');
                if (signInContainer) signInContainer.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        },
        onUserClick: () => {
            toggleDesktopSidebar(false);
            setTimeout(() => {
                const userProfile = document.getElementById('userProfile');
                if (userProfile) userProfile.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        }
    });

    const toggleMobileSidebar = (open) => {
        if (open) {
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
            requestAnimationFrame(() => sidebarOverlay.classList.add('opacity-100'));
            document.body.style.overflow = 'hidden';
        } else {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.remove('opacity-100');
            setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
            document.body.style.overflow = '';
        }
    };

    if (collapseDesktop) {
        collapseDesktop.addEventListener('click', () => toggleDesktopSidebar(true));
    }
    const openDesktop = document.getElementById('openSidebarDesktop');
    if (openDesktop) {
        openDesktop.addEventListener('click', () => toggleDesktopSidebar(false));
    }
    if (openMobile && closeMobile && sidebarOverlay) {
        openMobile.addEventListener('click', () => toggleMobileSidebar(true));
        closeMobile.addEventListener('click', () => toggleMobileSidebar(false));
        sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));
    }

    // On mobile, close sidebar automatically when clicking a menu option to give more focus
    if (categoryFilters) {
        categoryFilters.addEventListener('click', (e) => {
            if (window.innerWidth < 768 && e.target.classList.contains('filter-btn')) {
                toggleMobileSidebar(false);
            }
        });
    }
    const dashboardNav = document.getElementById('dashboardNav');
    if (dashboardNav) {
        dashboardNav.addEventListener('click', (e) => {
            if (window.innerWidth < 768 && e.target.classList.contains('filter-btn')) {
                toggleMobileSidebar(false);
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isEditableElement = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable
        );
        
        // '/' focuses search
        if (e.key === '/' && !isEditableElement && searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
        
        if (e.key === 'Escape') {
            // Close mobile sidebar if open
            if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 768) {
                toggleMobileSidebar(false);
            }
            // Clear search if focused
            else if (searchInput && document.activeElement === searchInput) {
                searchInput.value = '';
                searchInput.blur();
                filterAndRender();
            }
        }
    });
});
