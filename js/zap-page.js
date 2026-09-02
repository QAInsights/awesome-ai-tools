import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';
import {
    initFavorites,
    loadFavorites,
    refreshFavoriteButtons,
    subscribeFavorites,
    syncFavorites,
} from './favorites.js';
import {
    initFollows,
    loadFollows,
    refreshFollowButtons,
    subscribeFollows,
    syncFollows,
} from './follows.js';
import { getVoteCount, initVoting } from './voting.js';

async function initializeZapPage() {
    const grid = document.getElementById('zapGrid');
    const refresh = () => {
        if (!grid) return;
        refreshFavoriteButtons(grid);
        refreshFollowButtons(grid);
    };

    initFavorites({
        isAuthenticated: () => auth.isAuthenticated(),
        onUnauthorized: () => auth.signOut(),
        onToggle: added => {
            if (!added) void loadFollows();
        },
    });
    initFollows({
        isAuthenticated: () => auth.isAuthenticated(),
        onUnauthorized: () => auth.signOut(),
        onToggle: added => {
            if (added) void loadFavorites();
        },
    });

    const session = await bindAuthSession({ authManager: auth });
    const user = auth.getCurrentUser();
    await Promise.all([syncFavorites(user), syncFollows(user)]);
    refresh();
    subscribeFavorites(refresh);
    subscribeFollows(refresh);
    session.subscribe(({ user: nextUser }) => {
        if (!nextUser) location.reload();
    }, { emitCurrent: false });

    await initVoting();
    document.querySelectorAll('[data-zap-count][data-tool-id]').forEach(element => {
        const count = getVoteCount(element.dataset.toolId);
        element.textContent = count.toLocaleString();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    void initializeZapPage();
});
