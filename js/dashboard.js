import { CollapsedSidebar } from './collapsed-sidebar.js';
import { initGlobalSearch } from './modules/global-search.js';
import { initUiManager } from './modules/ui-manager.js';
import { initializeNewsSubscribe, syncNewsSubscribe } from './news-subscribe.js';
import { initializeStackShare } from './stack-share.js';

document.addEventListener('DOMContentLoaded', async () => {
    initUiManager();
    initializeStackShare();
    initializeNewsSubscribe();
    let newsSubscribeGeneration = 0;
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
            const generation = ++newsSubscribeGeneration;
            void syncNewsSubscribe(user, {
                isCurrent: () => generation === newsSubscribeGeneration,
            });
        },
    }).initializeAuth();
    initGlobalSearch();
});

