import { escapeHtml } from './html-escape';
import { formatWeekTitle } from './trending';

export interface TrendingBadgeInput {
    week: string;
    rank: number;
    toolName?: string;
}

export function renderTrendingBadgeSvg(input: TrendingBadgeInput): string {
    const rank = Math.max(1, Math.min(99, Math.trunc(input.rank)));
    const weekLabel = formatWeekTitle(input.week);
    const topLabel = escapeHtml(`TRENDING · ${weekLabel.toUpperCase()}`);
    const mainLabel = escapeHtml(`#${rank} on ai.dosa.dev`);
    const ariaLabel = escapeHtml(
        input.toolName
            ? `${input.toolName} — #${rank} Trending on ai.dosa.dev (${weekLabel})`
            : `#${rank} Trending on ai.dosa.dev (${weekLabel})`,
    );

    return `<svg xmlns="http://www.w3.org/2000/svg" width="236" height="44" viewBox="0 0 236 44" role="img" aria-label="${ariaLabel}">
  <title>${ariaLabel}</title>
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1d99f"/>
      <stop offset="1" stop-color="#d6b77a"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="235" height="43" rx="10" fill="#0a0a0a" stroke="#3a3428"/>
  <rect x="1" y="1" width="234" height="21" rx="9" fill="url(#sheen)"/>
  <g transform="translate(12,10)">
    <circle cx="12" cy="12" r="12" fill="#161310" stroke="#4c4030"/>
    <text x="12" y="16" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" font-weight="700" fill="url(#gold)">#${rank}</text>
  </g>
  <text x="46" y="18" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="8" letter-spacing="1.5" fill="#8a8378">${topLabel}</text>
  <text x="46" y="33" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13.5" font-weight="600" letter-spacing="0.2" fill="url(#gold)">${mainLabel}</text>
  <text x="222" y="27" text-anchor="end" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#f1d99f">★</text>
</svg>`;
}

export function buildTrendingBadgeMarkdown(week: string, rank: number, slug: string, toolName: string): string {
    const cleanName = toolName.replace(/[\[\]]/g, '').trim() || 'Tool';
    const badgeUrl = `https://ai.dosa.dev/badge/trending/${encodeURIComponent(week)}/${rank}.svg`;
    const targetUrl = `https://ai.dosa.dev/tools/${encodeURIComponent(slug)}?ref=badge`;
    return `[![${cleanName} — #${rank} Trending on ai.dosa.dev](${badgeUrl})](${targetUrl})`;
}

export function buildTrendingShareUrl(week: string, rank: number, toolName: string): string {
    const weekLabel = formatWeekTitle(week);
    const text = `${toolName} ranked #${rank} on the ${weekLabel} AI Coding Tools Leaderboard on @dosa_dev!`;
    const url = `https://ai.dosa.dev/trending/${encodeURIComponent(week)}?ref=social`;
    return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
