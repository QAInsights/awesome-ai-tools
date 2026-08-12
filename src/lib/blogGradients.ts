/**
 * blogGradients.ts
 *
 * Deterministic CSS mesh gradients and glassmorphic styling for blog posts.
 * Provides 0 KB download overhead and instant load times with Apple/Google level aesthetics.
 */

export interface BlogTheme {
    bg: string;
    gradient: string;
    accent: string;
    secondaryAccent: string;
    glow: string;
    icon: string;
}

export function getBlogTheme(slug: string, tags: string[] = []): BlogTheme {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) {
        hash = (hash << 5) - hash + slug.charCodeAt(i);
        hash |= 0;
    }
    const h = Math.abs(hash);

    const themes: BlogTheme[] = [
        // Theme 1: Electric Lime & Cyan Glow
        {
            bg: 'bg-[#040810]',
            gradient: 'radial-gradient(ellipse 90% 90% at 20% -10%, rgba(0,255,136,0.35), transparent 70%), radial-gradient(ellipse 80% 80% at 85% 110%, rgba(34,211,238,0.35), transparent 70%), radial-gradient(ellipse 60% 60% at 50% 50%, rgba(124,58,237,0.20), transparent 70%)',
            accent: '#00ff88',
            secondaryAccent: '#22d3ee',
            glow: 'rgba(0,255,136,0.3)',
            icon: '⚡',
        },
        // Theme 2: Deep Purple & Electric Lime
        {
            bg: 'bg-[#070512]',
            gradient: 'radial-gradient(ellipse 90% 90% at 80% -10%, rgba(124,58,237,0.40), transparent 70%), radial-gradient(ellipse 80% 80% at 15% 110%, rgba(0,255,136,0.30), transparent 70%), radial-gradient(ellipse 60% 60% at 50% 50%, rgba(34,211,238,0.20), transparent 70%)',
            accent: '#a78bfa',
            secondaryAccent: '#00ff88',
            glow: 'rgba(124,58,237,0.3)',
            icon: '🔮',
        },
        // Theme 3: Cyan Blue & Golden Yellow
        {
            bg: 'bg-[#030811]',
            gradient: 'radial-gradient(ellipse 90% 90% at 10% -10%, rgba(34,211,238,0.40), transparent 70%), radial-gradient(ellipse 80% 80% at 90% 110%, rgba(251,191,36,0.30), transparent 70%), radial-gradient(ellipse 60% 60% at 50% 40%, rgba(124,58,237,0.25), transparent 70%)',
            accent: '#22d3ee',
            secondaryAccent: '#fbbf24',
            glow: 'rgba(34,211,238,0.3)',
            icon: '💎',
        },
        // Theme 4: Neon Green & Bright Cyan
        {
            bg: 'bg-[#03090b]',
            gradient: 'radial-gradient(ellipse 90% 90% at 85% -10%, rgba(34,197,94,0.35), transparent 70%), radial-gradient(ellipse 80% 80% at 15% 110%, rgba(34,211,238,0.35), transparent 70%), radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,255,136,0.25), transparent 70%)',
            accent: '#22c55e',
            secondaryAccent: '#22d3ee',
            glow: 'rgba(34,197,94,0.3)',
            icon: '🚀',
        },
        // Theme 5: Tri-Color Glass Fusion
        {
            bg: 'bg-[#050611]',
            gradient: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(0,255,136,0.35), transparent 60%), radial-gradient(ellipse 80% 80% at 10% 100%, rgba(124,58,237,0.35), transparent 60%), radial-gradient(ellipse 80% 80% at 90% 100%, rgba(34,211,238,0.35), transparent 60%)',
            accent: '#00ff88',
            secondaryAccent: '#a78bfa',
            glow: 'rgba(0,255,136,0.3)',
            icon: '✨',
        },
    ];

    return themes[h % themes.length];
}
