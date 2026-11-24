export const AUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTH_RETURN_PATHS = Object.freeze([
    '/',
    '/blog',
    '/news',
    '/settings',
    '/favorites',
    '/zap',
    '/help',
    '/tools/cost-calculator',
    '/tools/stack-matcher',
    '/tools/token-counter',
    '/tools/hallucination-scorer',
    '/tools/rules-converter',
]);

const authReturnPaths = new Set(AUTH_RETURN_PATHS);
const directoryReturnPath = /^\/(?:tools|category)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

export function resolveAuthReturnPath(path) {
    if (typeof path !== 'string') return '/';
    // zh routes are locale prefixes over the en allowlist - validate the
    // stripped path, then put the prefix back so users stay in Chinese.
    const zh = path === '/zh' || path.startsWith('/zh/');
    const bare = zh ? (path.slice(3) || '/') : path;
    if (authReturnPaths.has(bare)) {
        if (!zh) return bare;
        return bare === '/' ? '/zh/' : `/zh${bare}`;
    }
    const match = bare.match(directoryReturnPath);
    if (match && match[0] === bare && match[1].length <= 128) {
        const clean = bare.replace(/\/$/, '');
        return zh ? `/zh${clean}` : clean;
    }
    return zh ? '/zh/' : '/';
}
