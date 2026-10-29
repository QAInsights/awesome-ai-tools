const INGEST_HOST = 'https://us.i.posthog.com';
const ASSETS_HOST = 'https://us-assets.i.posthog.com';

export function posthogUpstreamUrl(pathname: string, search: string): string {
    const staticMatch = pathname.match(/^\/ingest\/static\/(.*)$/);
    if (staticMatch) return `${ASSETS_HOST}/static/${staticMatch[1]}${search}`;
    const rest = pathname.startsWith('/ingest/') ? pathname.slice('/ingest'.length) : '/';
    return `${INGEST_HOST}${rest}${search}`;
}

export function filterPostHogHeaders(headers: Headers): Headers {
    const forwarded = new Headers();
    const connectingIp = headers.get('CF-Connecting-IP');
    headers.forEach((value, name) => {
        const normalizedName = name.toLowerCase();
        if (normalizedName === 'cookie' || normalizedName === 'host' || normalizedName.startsWith('cf-')) return;
        forwarded.set(name, value);
    });
    if (connectingIp) forwarded.set('X-Forwarded-For', connectingIp);
    return forwarded;
}

export function filterPostHogResponseHeaders(headers: Headers): Headers {
    const forwarded = new Headers(headers);
    forwarded.delete('set-cookie');
    return forwarded;
}
