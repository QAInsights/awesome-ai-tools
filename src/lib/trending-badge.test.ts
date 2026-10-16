import { describe, expect, test } from 'bun:test';
import {
    buildTrendingBadgeMarkdown,
    buildTrendingShareUrl,
    renderTrendingBadgeSvg,
} from './trending-badge';

describe('trending-badge', () => {
    test('renders SVG with rank and week title', () => {
        const svg = renderTrendingBadgeSvg({
            week: '2026-w40',
            rank: 1,
            toolName: 'Cursor',
        });
        expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('#1 on ai.dosa.dev');
        expect(svg).toContain('TRENDING · WEEK 40, 2026');
        expect(svg).toContain('Cursor — #1 Trending on ai.dosa.dev (Week 40, 2026)');
    });

    test('builds markdown snippet and X share url', () => {
        const md = buildTrendingBadgeMarkdown('2026-w40', 2, 'claude-code', 'Claude Code');
        expect(md).toBe(
            '[![Claude Code — #2 Trending on ai.dosa.dev](https://ai.dosa.dev/badge/trending/2026-w40/2.svg)](https://ai.dosa.dev/tools/claude-code?ref=badge)',
        );
        const shareUrl = buildTrendingShareUrl('2026-w40', 2, 'Claude Code');
        expect(shareUrl).toContain('https://x.com/intent/tweet?');
        expect(shareUrl).toContain(encodeURIComponent('https://ai.dosa.dev/trending/2026-w40?ref=social'));
    });
});
