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

function renderLeaderboard() {
    const leaderboard = document.getElementById('zapLeaderboard');
    const dataElement = document.getElementById('zapToolsData');
    if (!leaderboard || !dataElement) return;

    let tools;
    try {
        tools = JSON.parse(dataElement.textContent || '[]');
    } catch {
        tools = [];
    }

    const ranked = tools
        .map(tool => ({ ...tool, count: Number(getVoteCount(tool.id)) || 0 }))
        .filter(tool => tool.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 10);

    leaderboard.replaceChildren();
    if (!ranked.length) {
        const empty = document.createElement('li');
        empty.dataset.leaderboardEmpty = '';
        empty.className = 'text-[13px] text-[#737373]';
        empty.textContent = 'Vote counts unavailable';
        leaderboard.append(empty);
        return;
    }

    ranked.forEach((tool, index) => {
        const item = document.createElement('li');
        item.className = 'flex items-center gap-3';

        const rank = document.createElement('span');
        rank.className = 'font-mono text-[12px] text-[#525252] w-4';
        rank.textContent = String(index + 1);

        const details = document.createElement('div');
        details.className = 'min-w-0 grow';
        const link = document.createElement('a');
        link.className = 'text-[14px] font-medium text-white hover:text-[#e2c48a] transition-colors';
        link.href = `/tools/${tool.slug}`;
        link.textContent = tool.name;
        const category = document.createElement('div');
        category.className = 'font-mono text-[10px] uppercase tracking-wide text-[#737373] mt-0.5';
        category.textContent = tool.category;
        details.append(link, category);

        const count = document.createElement('span');
        count.className = 'font-mono text-[12px] text-[#F2C040] whitespace-nowrap';
        count.textContent = tool.count.toLocaleString();

        item.append(rank, details, count);
        leaderboard.append(item);
    });
}

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
    renderLeaderboard();
}

document.addEventListener('DOMContentLoaded', () => {
    void initializeZapPage();
});
