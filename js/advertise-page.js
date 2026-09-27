const compactNumber = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

export function resolvePath(value, path) {
    return path.split('.').reduce((current, key) => current?.[key], value);
}

export function formatStat(value) {
    return typeof value === 'number' && Number.isFinite(value) ? compactNumber.format(value) : null;
}

export function formatSince(value) {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return ` (since ${date.toLocaleDateString('en', { month: 'short', year: 'numeric' })})`;
}

function showFallback(root) {
    const note = root.querySelector('[data-stat-note]');
    if (note) note.textContent = 'Traffic figures are shared on request.';
}

export function applySiteStats(root, stats) {
    for (const element of root.querySelectorAll('[data-stat]')) {
        const path = element.getAttribute('data-stat');
        const value = path ? resolvePath(stats, path) : null;
        if (path === 'traffic.lifetime.since') {
            const formatted = formatSince(value);
            if (formatted !== null) element.textContent = formatted;
            continue;
        }
        const formatted = formatStat(value);
        if (formatted === null) continue;
        element.textContent = formatted;
        element.title = value.toLocaleString('en');
    }
}

export async function loadAdvertiseStats(root, fetchImpl = fetch) {
    try {
        const response = await fetchImpl('/api/stats', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Stats request failed');
        const stats = await response.json();
        if (!stats?.traffic && !stats?.github) throw new Error('Stats unavailable');
        applySiteStats(root, stats);
        if (!stats.traffic) showFallback(root);
    } catch {
        showFallback(root);
    }
}

if (typeof document !== 'undefined') {
    const root = document.querySelector('[data-live-stats]');
    if (root) void loadAdvertiseStats(root);
}
