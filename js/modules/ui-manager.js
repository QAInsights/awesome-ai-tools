import { APP_VERSION } from '../version.js';

export function initUiManager() {
    const sidebar = document.getElementById('sidebar');
    const collapseDesktop = document.getElementById('collapseSidebarDesktop');
    const desktopToggleContainer = document.getElementById('desktopToggleContainer');
    const openMobile = document.getElementById('openSidebarMobile');
    const closeMobile = document.getElementById('closeSidebarMobile');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function updateYear() {
        const year = new Date().getFullYear();
        const yearElement = document.querySelector('.footer-copy');
        if (yearElement) {
            yearElement.textContent = `© ${year} dosa.dev`;
        }
    }

    function stampVersion() {
        document.querySelectorAll('.app-version').forEach(el => {
            el.textContent = APP_VERSION;
        });
    }

    const toggleDesktopSidebar = (collapse) => {
        if (collapse) {
            sidebar?.classList.add('desktop-collapsed');
            desktopToggleContainer?.classList.remove('hidden');
        } else {
            sidebar?.classList.remove('desktop-collapsed');
            desktopToggleContainer?.classList.add('hidden');
        }
    };

    const toggleMobileSidebar = (open) => {
        if (open) {
            sidebar?.classList.add('mobile-open');
            sidebarOverlay?.classList.remove('hidden');
            // Force opacity to 1 for the overlay transition
            setTimeout(() => { sidebarOverlay && (sidebarOverlay.style.opacity = '1'); }, 10);
            document.body.style.overflow = 'hidden';
        } else {
            sidebar?.classList.remove('mobile-open');
            sidebarOverlay && (sidebarOverlay.style.opacity = '0');
            setTimeout(() => { sidebarOverlay?.classList.add('hidden'); }, 300);
            document.body.style.overflow = '';
        }
    };

    // Event Listeners
    collapseDesktop?.addEventListener('click', () => toggleDesktopSidebar(true));
    document.getElementById('openSidebarDesktop')?.addEventListener('click', () => toggleDesktopSidebar(false));
    openMobile?.addEventListener('click', () => toggleMobileSidebar(true));
    closeMobile?.addEventListener('click', () => toggleMobileSidebar(false));
    sidebarOverlay?.addEventListener('click', () => toggleMobileSidebar(false));

    // Initialize
    updateYear();
    stampVersion();

    return { toggleDesktopSidebar, toggleMobileSidebar };
}
