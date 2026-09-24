/**
 * Build-time OG image generator.
 *
 * Renders a 1200x630 PNG per tool (public/images/og/<slug>.png) so every
 * tool detail page can set a unique og:image — better social/chat CTR than
 * the shared generic card. Also regenerates only when missing or stale
 * (content hash), so rebuilds stay fast.
 *
 * Usage: node scripts/generate-og-images.js
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import satori from 'satori';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'images', 'og');
const BLOG_OUT_DIR = join(OUT_DIR, 'blog');
const FONT_DIR = join(ROOT, 'assets', 'fonts');

const fonts = [
    { name: 'Inter', data: readFileSync(join(FONT_DIR, 'Inter-Regular.woff')), weight: 400, style: 'normal' },
    { name: 'Inter', data: readFileSync(join(FONT_DIR, 'Inter-SemiBold.woff')), weight: 600, style: 'normal' },
    { name: 'Inter', data: readFileSync(join(FONT_DIR, 'Inter-Bold.woff')), weight: 700, style: 'normal' },
];

const logoSvg = readFileSync(join(ROOT, 'public', 'images', 'dosa-ai-logo.svg'), 'utf-8');
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

function truncate(str, max) {
    const s = String(str ?? '').replace(/\s+/g, ' ').trim();
    return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function hash(str) {
    return createHash('sha1').update(str).digest('hex').slice(0, 10);
}

async function renderPng(tool) {
    const name = tool.enriched?.name ?? tool.name;
    const company = tool.enriched?.company ?? tool.company;
    const desc = truncate(tool.enriched?.description ?? tool.notes, 130);
    return renderCardPng({
        pill: tool.categoryShort,
        content: [
            { type: 'div', props: { style: { fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }, children: truncate(name, 40) } },
            { type: 'div', props: { style: { fontSize: '26px', fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.08em' }, children: truncate(company, 40) } },
            { type: 'div', props: { style: { fontSize: '24px', fontWeight: 400, color: '#a3a3a3', lineHeight: 1.5, marginTop: '8px' }, children: desc } },
        ],
        footerLeft: 'Curated AI coding tools — pricing, features, verdicts',
        footerRight: `ai.dosa.dev/tools/${tool.slug}`,
    });
}

function renderCard({ pill, content, footerLeft, footerRight }) {
    return {
        type: 'div',
        props: {
            style: {
                width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', padding: '72px',
                background: 'linear-gradient(135deg, #050505 0%, #0d0b14 55%, #071114 100%)',
                fontFamily: 'Inter', color: '#fff',
            },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', gap: '20px' },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', alignItems: 'center', gap: '16px' },
                                    children: [
                                        { type: 'img', props: { src: logoDataUri, width: 40, height: 40, style: { borderRadius: '10px' } } },
                                        { type: 'div', props: { style: { fontSize: '22px', fontWeight: 600, color: '#a3a3a3' }, children: 'ai.dosa.dev' } },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    marginLeft: 'auto', fontSize: '18px', fontWeight: 600, color: '#c4b5fd',
                                                    border: '1px solid #3b3550', borderRadius: '999px', padding: '6px 18px',
                                                },
                                                children: pill,
                                            },
                                        },
                                    ],
                                },
                            },
                            ...content,
                        ],
                    },
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
                        children: [
                            { type: 'div', props: { style: { fontSize: '20px', color: '#525252' }, children: footerLeft } },
                            { type: 'div', props: { style: { fontSize: '20px', fontWeight: 600, color: '#67e8f9' }, children: footerRight } },
                        ],
                    },
                },
            ],
        },
    };
}

async function renderCardPng(options) {
    const svg = await satori(renderCard(options), { width: 1200, height: 630, fonts });
    return sharp(Buffer.from(svg)).png({ quality: 85 }).toBuffer();
}

function parseFrontmatter(src) {
    const body = src.match(/^---\s*\n([\s\S]*?)\n---/);
    const frontmatter = body?.[1] ?? '';
    const value = (name) => {
        const match = frontmatter.match(new RegExp(`^${name}:\\s*(.*?)\\s*$`, 'm'));
        if (!match) return '';
        return match[1].replace(/^["']|["']$/g, '');
    };
    const tags = (frontmatter.match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? '')
        .split(',')
        .map(tag => tag.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    return {
        title: value('title'),
        description: value('description'),
        pubDate: value('pubDate'),
        tags,
        draft: value('draft').toLowerCase() === 'true',
    };
}

function formatPostDate(isoDate) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
}

function loadBlogPosts() {
    const blogDir = join(ROOT, 'src', 'content', 'blog');
    return readdirSync(blogDir)
        .filter(file => file.endsWith('.mdx'))
        .map(file => ({ id: file.replace(/\.mdx$/, ''), ...parseFrontmatter(readFileSync(join(blogDir, file), 'utf-8')) }))
        .filter(post => !post.draft);
}

async function main() {
    // Load tools via the same README parser the site uses (keeps slugs in sync)
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
    const { parseMarkdown, getShortCategory } = await import('../js/parser.js');
    let tools = parseMarkdown(readme).map(t => ({ ...t, categoryShort: getShortCategory(t.category) }));

    let enrichedMap = new Map();
    try {
        const enriched = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'enriched-tools.json'), 'utf-8'));
        enrichedMap = new Map(enriched.map(t => [t.slug, t]));
    } catch { /* enrichment optional */ }

    tools = tools.map(t => ({ ...t, enriched: enrichedMap.get(t.slug) ?? null }));

    mkdirSync(OUT_DIR, { recursive: true });
    mkdirSync(BLOG_OUT_DIR, { recursive: true });

    let written = 0, skipped = 0, blogWritten = 0, blogSkipped = 0;
    for (const tool of tools) {
        const contentKey = hash(JSON.stringify([tool.name, tool.company, tool.notes, tool.enriched?.description, tool.enriched?.name, tool.enriched?.company, tool.categoryShort]));
        const outPath = join(OUT_DIR, `${tool.slug}.png`);
        const hashPath = join(OUT_DIR, `${tool.slug}.hash`);

        if (existsSync(outPath) && existsSync(hashPath) && readFileSync(hashPath, 'utf-8') === contentKey) {
            skipped++;
            continue;
        }

        const png = await renderPng(tool);
        writeFileSync(outPath, png);
        writeFileSync(hashPath, contentKey);
        written++;
    }

    const posts = loadBlogPosts();
    for (const post of posts) {
        const contentKey = hash(JSON.stringify([post.title, post.description, post.pubDate, post.tags]));
        const outPath = join(BLOG_OUT_DIR, `${post.id}.png`);
        const hashPath = join(BLOG_OUT_DIR, `${post.id}.hash`);
        if (existsSync(outPath) && existsSync(hashPath) && readFileSync(hashPath, 'utf-8') === contentKey) {
            blogSkipped++;
            continue;
        }
        const png = await renderCardPng({
            pill: post.tags.includes('news') ? 'Today in AI' : 'Blog',
            content: [
                { type: 'div', props: { style: { fontSize: '52px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }, children: truncate(post.title, 90) } },
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 400, color: '#a3a3a3', lineHeight: 1.5, marginTop: '8px' }, children: truncate(post.description, 150) } },
            ],
            footerLeft: formatPostDate(post.pubDate),
            footerRight: `ai.dosa.dev/blog/${post.id}`,
        });
        writeFileSync(outPath, png);
        writeFileSync(hashPath, contentKey);
        blogWritten++;
    }

    console.log(`OG images: ${written} generated, ${skipped} up-to-date (${tools.length} tools); ${blogWritten} blog posts generated, ${blogSkipped} up-to-date (${posts.length} posts total)`);
}

main().catch(err => { console.error('OG image generation failed:', err); process.exit(1); });
