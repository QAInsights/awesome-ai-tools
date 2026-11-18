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
    if (authReturnPaths.has(path)) return path;
    const match = path.match(directoryReturnPath);
    if (match && match[0] === path && match[1].length <= 128) return path.replace(/\/$/, '');
    return '/';
}
