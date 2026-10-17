import { CollapsedSidebar } from './collapsed-sidebar.js';
import { initGlobalSearch } from './modules/global-search.js';
import { initUiManager } from './modules/ui-manager.js';
import { initializeNewsSubscribe, syncNewsSubscribe } from './news-subscribe.js';
import { initializeStackShare } from './stack-share.js';

document.addEventListener('DOMContentLoaded', async () => {
    initUiManager();
    initializeStackShare();
    initializeNewsSubscribe();
    const { initAuthManager } = await import('./modules/auth-manager.js');

    const collapsedSidebar = new CollapsedSidebar('iconSidebar', {
        onExpand: () => document.getElementById('openSidebarDesktop')?.click(),
        onSearchClick: () => {
            window.location.href = '/';
        }
    });

    await initAuthManager({
        collapsedSidebar,
        onStateChange: (user) => {
            void syncNewsSubscribe(user);
        },
    }).initializeAuth();
    initGlobalSearch();
});

