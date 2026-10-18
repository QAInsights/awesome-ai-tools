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
    '/tools/token-counter',
    '/tools/hallucination-scorer',
]);

const authReturnPaths = new Set(AUTH_RETURN_PATHS);

export function resolveAuthReturnPath(path) {
    return typeof path === 'string' && authReturnPaths.has(path) ? path : '/';
}
