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

document.addEventListener('DOMContentLoaded', async () => {
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
    
    // Initialize authentication
    await initializeAuth();
    
    // Load data only if we're on the registry page
    if (grid) {
        try {
            await initVoting(); // Wait for votes to load before parsing and filtering
            const readmeResponse = await fetch('README.md');
            
            if (!readmeResponse.ok) throw new Error('Failed to fetch README');
            
            const text = await readmeResponse.text();
            toolsData = parseMarkdown(text);
            categories = extractCategories(toolsData);
            
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
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        filterAndRender();
    });

    // Event listeners
    searchInput.addEventListener('input', filterAndRender);
    
    // Update year in footer
    updateYear();
    
    function updateYear() {
        const year = new Date().getFullYear();
        const yearElement = document.querySelector('.footer-copy');
        yearElement.textContent = `© ${year} dosa.dev`;
    }

    /**
     * Initialize authentication system
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
        console.log('Auth state changed:', event, user?.name);
        
        if (error) {
            console.error('Auth error:', error);
            return;
        }
        
        updateAuthUI();
        
        // You can add more logic here based on auth events
        switch (event) {
            case 'signin':
                // User just signed in
                console.log('Welcome back!', user.name);
                break;
            case 'signout':
                // User just signed out
                console.log('Signed out successfully');
                break;
            case 'session_restored':
                // Session was restored from localStorage
                console.log('Session restored for', user.name);
                break;
        }
    }

    /**
     * Update authentication UI based on current state
     */
    function updateAuthUI() {
        const signInBtn = document.getElementById('googleSignInBtn');
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

            // Hide sign-in button container
            if (signInBtn) {
                signInBtn.classList.add('hidden');
            }

            // Update collapsed sidebar
            collapsedSidebar?.setAuthState(true, user.picture);
        } else {
            // Show sign-in button container
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

    // On mobile, close sidebar automatically when clicking a filter to give more focus
    categoryFilters.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && e.target.classList.contains('filter-btn')) {
            toggleMobileSidebar(false);
        }
    });

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
        if (e.key === '/' && !isEditableElement) {
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
            else if (document.activeElement === searchInput) {
                searchInput.value = '';
                searchInput.blur();
                filterAndRender();
            }
        }
    });
});
