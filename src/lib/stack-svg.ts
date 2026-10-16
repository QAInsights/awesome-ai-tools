import { escapeHtml } from './html-escape';
import type { VisibleStackItem } from './stack-public-view';

export interface StackSvgInput {
    title: string;
    username: string;
    displayName: string;
    items: VisibleStackItem[];
}

export interface StackEmbedSnippets {
    svgUrl: string;
    linkUrl: string;
    markdown: string;
    html: string;
}

const MAX_DISPLAY_ITEMS = 6;
const CARD_WIDTH = 480;
const HEADER_HEIGHT = 82;
const ROW_HEIGHT = 34;
const FOOTER_HEIGHT = 40;

function truncateText(text: string, maxLength: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildStackEmbedSnippets(username: string, slug: string, title: string): StackEmbedSnippets {
    const base = `https://ai.dosa.dev/u/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
    const svgUrl = `${base}.svg`;
    const linkUrl = `${base}?ref=badge`;
    const safeAlt = title.replace(/[\[\]]/g, '').trim() || 'My AI Tool Stack';
    return {
        svgUrl,
        linkUrl,
        markdown: `[![${safeAlt} — ai.dosa.dev](${svgUrl})](${linkUrl})`,
        html: `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(svgUrl)}" alt="${escapeHtml(safeAlt)} — ai.dosa.dev" width="${CARD_WIDTH}"></a>`,
    };
}

export function renderStackSvg(input: StackSvgInput): string {
    const shown = input.items.slice(0, MAX_DISPLAY_ITEMS);
    const remaining = Math.max(0, input.items.length - shown.length);
    const rowCount = Math.max(1, shown.length);
    const height = HEADER_HEIGHT + rowCount * ROW_HEIGHT + (remaining > 0 ? 26 : 0) + FOOTER_HEIGHT;

    const title = escapeHtml(truncateText(input.title || 'AI Tool Stack', 38));
    const handle = escapeHtml(`@${input.username}`);
    const countLabel = escapeHtml(`${input.items.length} ${input.items.length === 1 ? 'TOOL' : 'TOOLS'}`);
    const ariaLabel = escapeHtml(`${input.title} by @${input.username} on ai.dosa.dev`);

    const rowsSvg = shown.length > 0
        ? shown.map(({ item, tool }, index) => {
            const y = HEADER_HEIGHT + index * ROW_HEIGHT;
            const num = String(index + 1).padStart(2, '0');
            const name = escapeHtml(truncateText(tool.enriched?.name ?? tool.name, 26));
            const purpose = escapeHtml(truncateText(item.purpose || tool.categoryShort, 28));
            return `
  <g transform="translate(20, ${y})">
    <rect x="0" y="0" width="440" height="28" rx="6" fill="#121110" stroke="#242019"/>
    <text x="12" y="18" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="#8a8378">${num}</text>
    <text x="36" y="18" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600" fill="#f5f5f4">${name}</text>
    <text x="428" y="18" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10.5" fill="#d6b77a">${purpose}</text>
  </g>`;
        }).join('')
        : `
  <g transform="translate(20, ${HEADER_HEIGHT})">
    <rect x="0" y="0" width="440" height="28" rx="6" fill="#121110" stroke="#242019"/>
    <text x="16" y="18" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#8a8378">Curated AI stack on ai.dosa.dev</text>
  </g>`;

    const moreSvg = remaining > 0
        ? `\n  <text x="24" y="${HEADER_HEIGHT + rowCount * ROW_HEIGHT + 14}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="#8a8378">+${remaining} more ${remaining === 1 ? 'tool' : 'tools'} on ai.dosa.dev</text>`
        : '';

    const footerY = height - 16;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}" role="img" aria-label="${ariaLabel}">
  <title>${ariaLabel}</title>
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1d99f"/>
      <stop offset="1" stop-color="#d6b77a"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${height - 1}" rx="12" fill="#0a0a0a" stroke="#3a3428"/>
  <rect x="1" y="1" width="${CARD_WIDTH - 2}" height="44" rx="11" fill="url(#sheen)"/>
  <text x="20" y="28" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10" letter-spacing="1.6" fill="#8a8378">AI TOOL STACK · ${handle}</text>
  <text x="460" y="28" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10" letter-spacing="1.4" fill="#d6b77a">${countLabel}</text>
  <text x="20" y="56" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="18" font-weight="600" fill="#ffffff">${title}</text>
  <line x1="20" y1="70" x2="460" y2="70" stroke="#221f1a" stroke-width="1"/>${rowsSvg}${moreSvg}
  <text x="20" y="${footerY}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="#8a8378">ai.dosa.dev/u/${escapeHtml(input.username)}</text>
  <text x="460" y="${footerY}" text-anchor="end" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="url(#gold)">★ ai.dosa.dev</text>
</svg>`;
}
