const staticRoutes = new Set([
    '/', '/advertise', '/blog', '/compare', '/favorites', '/help', '/news', '/settings', '/zap',
    '/tools/token-counter', '/tools/hallucination-scorer',
    '/api/events', '/api/favorites', '/api/notifications/prefs', '/api/admin/digest/run', '/api/auth/session', '/api/auth/github', '/api/auth/dev',
    '/api/follows',
]);

export function normalizeRoute(pathname: string): string {
    if (/^\/tools\/[^/]+\/alternatives\/?$/.test(pathname)) return '/tools/:slug/alternatives';
    if (/^\/tools\/[^/]+\/?$/.test(pathname)) return '/tools/:slug';
    if (/^\/category\/[^/]+\/?$/.test(pathname)) return '/category/:slug';
    if (/^\/compare\/[^/]+\/?$/.test(pathname)) return '/compare/:pair';
    if (/^\/blog\/[^/]+\/?$/.test(pathname)) return '/blog/:id';
    if (/^\/news\/[^/]+\/?$/.test(pathname)) return '/news/:page';
    if (/^\/api\/favorites\/[^/]+\/?$/.test(pathname)) return '/api/favorites/:slug';
    if (/^\/api\/follows\/[^/]+\/?$/.test(pathname)) return '/api/follows/:slug';
    const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    return staticRoutes.has(normalized) ? normalized : '/other';
}

function referrerHost(request: Request): string {
    const value = request.headers.get('Referer');
    if (!value) return '';
    try {
        return new URL(value).hostname.slice(0, 256);
    } catch {
        return '';
    }
}

export interface RequestAnalyticsContext {
    route: string;
    referrerHost: string;
    device: 'mobile' | 'desktop';
    country: string;
}

export function getRequestContext(request: Request): RequestAnalyticsContext {
    const requestUrl = new URL(request.url);
    const referer = request.headers.get('Referer');
    let routePath = requestUrl.pathname;
    try {
        const refererUrl = referer ? new URL(referer) : null;
        if (requestUrl.pathname.startsWith('/api/') && refererUrl?.origin === requestUrl.origin) {
            routePath = refererUrl.pathname;
        }
    } catch {}
    const userAgent = request.headers.get('User-Agent') ?? '';
    const cf = (request as Request & { cf?: { country?: string } }).cf;
    return {
        route: normalizeRoute(routePath),
        referrerHost: referrerHost(request),
        device: /Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'mobile' : 'desktop',
        country: cf?.country?.slice(0, 2) ?? '',
    };
}
