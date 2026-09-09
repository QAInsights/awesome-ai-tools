import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import satori from 'satori';
import sharp from 'sharp';

const ROOT = process.cwd();
const FONT_DIR = join(ROOT, 'assets', 'fonts');

// Load Inter fonts
const interRegular = readFileSync(join(FONT_DIR, 'Inter-Regular.woff'));
const interSemiBold = readFileSync(join(FONT_DIR, 'Inter-SemiBold.woff'));
const interBold = readFileSync(join(FONT_DIR, 'Inter-Bold.woff'));

const fonts = [
    { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
    { name: 'Inter', data: interSemiBold, weight: 600, style: 'normal' },
    { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
];

const logoSvg = readFileSync(join(ROOT, 'public', 'images', 'dosa-ai-logo.svg'), 'utf-8');
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

// SVGs for crisp vector icons
const zapIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#F2C040" stroke="#F2C040" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const zapIconDataUri = `data:image/svg+xml;base64,${Buffer.from(zapIconSvg).toString('base64')}`;

const searchIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const searchIconDataUri = `data:image/svg+xml;base64,${Buffer.from(searchIconSvg).toString('base64')}`;

const arrowUpRightSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;
const arrowUpRightDataUri = `data:image/svg+xml;base64,${Buffer.from(arrowUpRightSvg).toString('base64')}`;

const checkIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F2C040" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const checkIconDataUri = `data:image/svg+xml;base64,${Buffer.from(checkIconSvg).toString('base64')}`;

const filterIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;
const filterIconDataUri = `data:image/svg+xml;base64,${Buffer.from(filterIconSvg).toString('base64')}`;

async function generateBackground() {
    // 1. Dark canvas with rich atmospheric glow
    const lightsSvg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#050507" />
      <!-- Signature primary gold atmospheric glow over the right window -->
      <circle cx="980" cy="200" r="320" fill="#F2C040" opacity="0.22" />
      <!-- Amber secondary warm glow -->
      <circle cx="750" cy="380" r="220" fill="#e2c48a" opacity="0.14" />
      <!-- Cool indigo ambient illumination in lower-left for depth -->
      <circle cx="120" cy="500" r="260" fill="#6366f1" opacity="0.12" />
      <!-- Subtle cyan highlight top-left -->
      <circle cx="280" cy="90" r="160" fill="#06b6d4" opacity="0.06" />
    </svg>
    `);

    const blurredLights = await sharp(lightsSvg)
        .blur(85)
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 2. Technical grid overlay and framing
    const gridSvg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255, 255, 255, 0.032)" stroke-width="1" />
        </pattern>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="55%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.5" />
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#grid)" />
      <rect width="1200" height="630" fill="url(#vignette)" />
      <!-- 1px hairline perimeter border -->
      <rect x="0.5" y="0.5" width="1199" height="629" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
    </svg>
    `);

    return sharp(blurredLights.data, {
        raw: {
            width: blurredLights.info.width,
            height: blurredLights.info.height,
            channels: blurredLights.info.channels,
        },
    })
        .composite([{ input: gridSvg, blend: 'over' }])
        .png()
        .toBuffer();
}

async function buildOgImage() {
    const bgBuffer = await generateBackground();

    const tree = {
        type: 'div',
        props: {
            style: {
                width: '1200px',
                height: '630px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '44px 56px 36px 56px',
                fontFamily: 'Inter',
                color: '#fff',
                position: 'relative',
                boxSizing: 'border-box',
                background: 'transparent',
            },
            children: [
                // 1. TOP HEADER BAR: Brand Identity + Category Counts Pill
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                        },
                        children: [
                            // Brand container
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '14px',
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '42px',
                                                    height: '42px',
                                                    borderRadius: '12px',
                                                    background: '#121216',
                                                    border: '1px solid rgba(242, 192, 64, 0.45)',
                                                    boxShadow: '0 0 20px rgba(242, 192, 64, 0.28)',
                                                },
                                                children: [
                                                    {
                                                        type: 'img',
                                                        props: {
                                                            src: logoDataUri,
                                                            width: 28,
                                                            height: 28,
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    fontSize: '24px',
                                                    fontWeight: 700,
                                                    letterSpacing: '-0.025em',
                                                    color: '#ffffff',
                                                },
                                                children: 'ai.dosa.dev',
                                            },
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    background: 'rgba(242, 192, 64, 0.08)',
                                                    border: '1px solid rgba(242, 192, 64, 0.3)',
                                                    borderRadius: '999px',
                                                    padding: '5px 14px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: '#F2C040',
                                                    letterSpacing: '0.12em',
                                                    textTransform: 'uppercase',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                width: '6px',
                                                                height: '6px',
                                                                borderRadius: '50%',
                                                                background: '#F2C040',
                                                                boxShadow: '0 0 8px #F2C040',
                                                            },
                                                        },
                                                    },
                                                    'Awesome AI Coding Tools',
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            // Top right stat pill
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '12px',
                                        color: '#a3a3a3',
                                        letterSpacing: '0.04em',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '999px',
                                        padding: '6px 18px',
                                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                                    },
                                    children: [
                                        { type: 'span', props: { style: { color: '#F2C040', fontWeight: 700 }, children: '100+' } },
                                        { type: 'span', props: { children: 'Curated Tools' } },
                                        { type: 'span', props: { style: { color: '#555' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#ffffff', fontWeight: 600 }, children: '12' } },
                                        { type: 'span', props: { children: 'Categories' } },
                                        { type: 'span', props: { style: { color: '#555' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#d6b77a', fontWeight: 600 }, children: 'Daily Updates' } },
                                    ],
                                },
                            },
                        ],
                    },
                },

                // 2. MAIN SECTION: Left Value Prop + Right Simulated UI Window
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '36px',
                            margin: '4px 0',
                        },
                        children: [
                            // Left Hero text column (560px)
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        width: '560px',
                                        gap: '14px',
                                    },
                                    children: [
                                        // Eyebrow
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    letterSpacing: '0.18em',
                                                    textTransform: 'uppercase',
                                                    color: '#d6b77a',
                                                },
                                                children: [
                                                    { type: 'div', props: { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#d6b77a' } } },
                                                    'Directory & Decision Matrix',
                                                ],
                                            },
                                        },
                                        // Main headline
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    fontSize: '56px',
                                                    fontWeight: 700,
                                                    lineHeight: 1.05,
                                                    letterSpacing: '-0.035em',
                                                    color: '#ffffff',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                },
                                                children: [
                                                    { type: 'span', props: { children: 'Find your' } },
                                                    {
                                                        type: 'span',
                                                        props: {
                                                            style: {
                                                                color: '#F2C040',
                                                                textShadow: '0 0 45px rgba(242, 192, 64, 0.4)',
                                                            },
                                                            children: 'AI coding stack.',
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        // Accent gradient line under title
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    width: '90px',
                                                    height: '3px',
                                                    borderRadius: '999px',
                                                    background: 'linear-gradient(90deg, #F2C040, #d6b77a, transparent)',
                                                },
                                            },
                                        },
                                        // Subtitle
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    fontSize: '17px',
                                                    fontWeight: 400,
                                                    lineHeight: 1.48,
                                                    color: '#a3a3a3',
                                                    marginTop: '2px',
                                                },
                                                children: 'The open-source reference for AI-native IDEs, terminal CLI agents, autonomous SWEs & review bots. Compare features, pricing, and community verdicts.',
                                            },
                                        },
                                        // Feature badges row
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '8px',
                                                    marginTop: '4px',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                border: '1px solid rgba(255, 255, 255, 0.11)',
                                                                borderRadius: '8px',
                                                                padding: '6px 12px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                color: '#f0f0f0',
                                                            },
                                                            children: [
                                                                { type: 'img', props: { src: zapIconDataUri, width: 12, height: 12 } },
                                                                'Community Zaps',
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                border: '1px solid rgba(255, 255, 255, 0.11)',
                                                                borderRadius: '8px',
                                                                padding: '6px 12px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                color: '#f0f0f0',
                                                            },
                                                            children: [
                                                                { type: 'img', props: { src: checkIconDataUri, width: 12, height: 12 } },
                                                                'Side-by-Side Compare',
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                border: '1px solid rgba(255, 255, 255, 0.11)',
                                                                borderRadius: '8px',
                                                                padding: '6px 12px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                color: '#f0f0f0',
                                                            },
                                                            children: [
                                                                { type: 'img', props: { src: checkIconDataUri, width: 12, height: 12 } },
                                                                'Honest Pricing Data',
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },

                            // Right Side: Floating Dark Glass Window Container (490px)
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        width: '490px',
                                        background: 'rgba(12, 12, 16, 0.88)',
                                        border: '1px solid rgba(255, 255, 255, 0.13)',
                                        borderRadius: '18px',
                                        padding: '16px 18px',
                                        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.2) inset',
                                        gap: '11px',
                                    },
                                    children: [
                                        // Mock window title bar
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    paddingBottom: '10px',
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                                                },
                                                children: [
                                                    // Window dots
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { display: 'flex', alignItems: 'center', gap: '6px' },
                                                            children: [
                                                                { type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' } } },
                                                                { type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' } } },
                                                                { type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' } } },
                                                            ],
                                                        },
                                                    },
                                                    // Search mockup pill with shortcut
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                                borderRadius: '8px',
                                                                padding: '4px 10px',
                                                                fontSize: '11px',
                                                                color: '#737373',
                                                            },
                                                            children: [
                                                                { type: 'img', props: { src: searchIconDataUri, width: 11, height: 11 } },
                                                                { type: 'span', props: { children: 'Filter 100+ tools...' } },
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: {
                                                                            background: 'rgba(255, 255, 255, 0.08)',
                                                                            borderRadius: '4px',
                                                                            padding: '1px 5px',
                                                                            fontSize: '10px',
                                                                            fontWeight: 600,
                                                                            color: '#a3a3a3',
                                                                        },
                                                                        children: '/',
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },

                                        // Category filter tabs mockup
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: '#F2C040',
                                                                borderRadius: '6px',
                                                                padding: '3px 9px',
                                                                fontSize: '10px',
                                                                fontWeight: 700,
                                                                color: '#000000',
                                                            },
                                                            children: 'All (100+)',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                borderRadius: '6px',
                                                                padding: '3px 9px',
                                                                fontSize: '10px',
                                                                fontWeight: 500,
                                                                color: '#a3a3a3',
                                                            },
                                                            children: 'AI IDEs',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                borderRadius: '6px',
                                                                padding: '3px 9px',
                                                                fontSize: '10px',
                                                                fontWeight: 500,
                                                                color: '#a3a3a3',
                                                            },
                                                            children: 'CLI Agents',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                borderRadius: '6px',
                                                                padding: '3px 9px',
                                                                fontSize: '10px',
                                                                fontWeight: 500,
                                                                color: '#a3a3a3',
                                                            },
                                                            children: 'Autonomous',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                borderRadius: '6px',
                                                                padding: '3px 9px',
                                                                fontSize: '10px',
                                                                fontWeight: 500,
                                                                color: '#a3a3a3',
                                                            },
                                                            children: 'Code Review',
                                                        },
                                                    },
                                                ],
                                            },
                                        },

                                        // Card 1: Cursor (AI-Native IDE)
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '4px',
                                                    background: 'rgba(20, 20, 26, 0.65)',
                                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    borderRadius: '11px',
                                                    padding: '10px 13px',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                            },
                                                            children: [
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'baseline', gap: '8px' },
                                                                        children: [
                                                                            { type: 'span', props: { style: { fontSize: '15px', fontWeight: 700, color: '#ffffff' }, children: 'Cursor' } },
                                                                            { type: 'span', props: { style: { fontSize: '10px', color: '#737373' }, children: 'Anysphere' } },
                                                                        ],
                                                                    },
                                                                },
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'center', gap: '8px' },
                                                                        children: [
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 600,
                                                                                        color: '#c4b5fd',
                                                                                        background: 'rgba(196, 181, 253, 0.1)',
                                                                                        border: '1px solid rgba(196, 181, 253, 0.25)',
                                                                                        borderRadius: '999px',
                                                                                        padding: '2px 8px',
                                                                                    },
                                                                                    children: 'AI IDE',
                                                                                },
                                                                            },
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px',
                                                                                        fontSize: '12px',
                                                                                        fontWeight: 700,
                                                                                        color: '#F2C040',
                                                                                    },
                                                                                    children: [
                                                                                        { type: 'img', props: { src: zapIconDataUri, width: 11, height: 11 } },
                                                                                        '1.8k',
                                                                                    ],
                                                                                },
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { fontSize: '11px', color: '#8c8c94', lineHeight: 1.35 },
                                                            children: 'AI-first code editor with deep codebase indexing & multi-file agents.',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginTop: '2px' },
                                                            children: [
                                                                { type: 'span', props: { children: 'v0.45 · VS Code fork' } },
                                                                { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'Free / $20 mo' } },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },

                                        // Card 2: Claude Code (Spotlight / Trending #1)
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '5px',
                                                    background: 'linear-gradient(135deg, rgba(32, 27, 18, 0.95) 0%, rgba(22, 19, 14, 0.98) 100%)',
                                                    border: '1.5px solid rgba(242, 192, 64, 0.7)',
                                                    borderRadius: '11px',
                                                    padding: '11px 14px',
                                                    boxShadow: '0 8px 24px rgba(242, 192, 64, 0.18)',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                            },
                                                            children: [
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'baseline', gap: '8px' },
                                                                        children: [
                                                                            { type: 'span', props: { style: { fontSize: '15px', fontWeight: 700, color: '#ffffff' }, children: 'Claude Code' } },
                                                                            { type: 'span', props: { style: { fontSize: '10px', color: '#e2c48a' }, children: 'Anthropic' } },
                                                                        ],
                                                                    },
                                                                },
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'center', gap: '6px' },
                                                                        children: [
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        fontSize: '9px',
                                                                                        fontWeight: 700,
                                                                                        color: '#000',
                                                                                        background: '#F2C040',
                                                                                        borderRadius: '999px',
                                                                                        padding: '2px 7px',
                                                                                    },
                                                                                    children: 'TRENDING #1',
                                                                                },
                                                                            },
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 600,
                                                                                        color: '#67e8f9',
                                                                                        background: 'rgba(103, 232, 249, 0.1)',
                                                                                        border: '1px solid rgba(103, 232, 249, 0.28)',
                                                                                        borderRadius: '999px',
                                                                                        padding: '2px 8px',
                                                                                    },
                                                                                    children: 'CLI Agent',
                                                                                },
                                                                            },
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px',
                                                                                        fontSize: '12px',
                                                                                        fontWeight: 700,
                                                                                        color: '#F2C040',
                                                                                    },
                                                                                    children: [
                                                                                        { type: 'img', props: { src: zapIconDataUri, width: 11, height: 11 } },
                                                                                        '3.2k',
                                                                                    ],
                                                                                },
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { fontSize: '11px', color: '#e0dbd3', lineHeight: 1.35 },
                                                            children: 'Agentic terminal coding with bash execution, git workflows & tool use.',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#777', marginTop: '2px' },
                                                            children: [
                                                                { type: 'span', props: { style: { color: '#d6b77a' }, children: 'Official Terminal CLI' } },
                                                                { type: 'span', props: { style: { color: '#F2C040', fontWeight: 600 }, children: 'Pay-per-token' } },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },

                                        // Card 3: Devin (Autonomous SWE)
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '4px',
                                                    background: 'rgba(20, 20, 26, 0.65)',
                                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    borderRadius: '11px',
                                                    padding: '10px 13px',
                                                },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                            },
                                                            children: [
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'baseline', gap: '8px' },
                                                                        children: [
                                                                            { type: 'span', props: { style: { fontSize: '15px', fontWeight: 700, color: '#ffffff' }, children: 'Devin' } },
                                                                            { type: 'span', props: { style: { fontSize: '10px', color: '#737373' }, children: 'Cognition' } },
                                                                        ],
                                                                    },
                                                                },
                                                                {
                                                                    type: 'div',
                                                                    props: {
                                                                        style: { display: 'flex', alignItems: 'center', gap: '8px' },
                                                                        children: [
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 600,
                                                                                        color: '#f472b6',
                                                                                        background: 'rgba(244, 114, 182, 0.1)',
                                                                                        border: '1px solid rgba(244, 114, 182, 0.25)',
                                                                                        borderRadius: '999px',
                                                                                        padding: '2px 8px',
                                                                                    },
                                                                                    children: 'Autonomous',
                                                                                },
                                                                            },
                                                                            {
                                                                                type: 'div',
                                                                                props: {
                                                                                    style: {
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px',
                                                                                        fontSize: '12px',
                                                                                        fontWeight: 700,
                                                                                        color: '#F2C040',
                                                                                    },
                                                                                    children: [
                                                                                        { type: 'img', props: { src: zapIconDataUri, width: 11, height: 11 } },
                                                                                        '1.1k',
                                                                                    ],
                                                                                },
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { fontSize: '11px', color: '#8c8c94', lineHeight: 1.35 },
                                                            children: 'Autonomous software engineer operating in a sandboxed cloud runtime.',
                                                        },
                                                    },
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginTop: '2px' },
                                                            children: [
                                                                { type: 'span', props: { children: 'Browser + Shell + Editor' } },
                                                                { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'Enterprise' } },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },

                // 3. BOTTOM FOOTER BAR: Categories list + Domain CTA
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            paddingTop: '16px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        },
                        children: [
                            // Left: Category tags
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        fontSize: '11px',
                                        color: '#737373',
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    },
                                    children: [
                                        { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'AI IDEs' } },
                                        { type: 'span', props: { style: { color: '#444' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'CLI AGENTS' } },
                                        { type: 'span', props: { style: { color: '#444' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'AUTONOMOUS' } },
                                        { type: 'span', props: { style: { color: '#444' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'CODE REVIEW' } },
                                        { type: 'span', props: { style: { color: '#444' }, children: '•' } },
                                        { type: 'span', props: { style: { color: '#a3a3a3' }, children: 'EXTENSIONS' } },
                                    ],
                                },
                            },

                            // Right: High-contrast CTA pill with SVG arrow
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: 'linear-gradient(135deg, #f1d99f 0%, #F2C040 60%, #d6b77a 100%)',
                                        borderRadius: '999px',
                                        padding: '7px 18px',
                                        boxShadow: '0 2px 14px rgba(242, 192, 64, 0.4)',
                                    },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    color: '#000000',
                                                    letterSpacing: '-0.01em',
                                                },
                                                children: 'Explore Directory',
                                            },
                                        },
                                        {
                                            type: 'img',
                                            props: {
                                                src: arrowUpRightDataUri,
                                                width: 12,
                                                height: 12,
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };

    console.log('Rendering Satori SVG...');
    const svg = await satori(tree, {
        width: 1200,
        height: 630,
        fonts,
    });

    console.log('Rendering foreground PNG...');
    const fgPng = await sharp(Buffer.from(svg)).png().toBuffer();

    console.log('Compositing background + foreground...');
    const finalPng = await sharp(bgBuffer)
        .composite([{ input: fgPng, blend: 'over' }])
        .png({ quality: 95, compressionLevel: 8 })
        .toBuffer();

    const outPath = join(ROOT, 'public', 'images', 'og-image.png');
    writeFileSync(outPath, finalPng);
    console.log(`Saved composite OG image to ${outPath} (${finalPng.length} bytes)`);

    // Also update dist/client/images/og-image.png if dist exists
    const distPath = join(ROOT, 'dist', 'client', 'images', 'og-image.png');
    try {
        writeFileSync(distPath, finalPng);
        console.log(`Also synced to ${distPath}`);
    } catch {
        // dist might not exist yet
    }
}

buildOgImage().catch(err => {
    console.error('Error rendering OG image:', err);
    process.exit(1);
});
