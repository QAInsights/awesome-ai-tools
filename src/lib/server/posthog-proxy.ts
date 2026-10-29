const INGEST_HOST = 'https://us.i.posthog.com';
const ASSETS_HOST = 'https://us-assets.i.posthog.com';

export const MAX_INGEST_BODY_BYTES = 2 * 1024 * 1024;

export function posthogUpstreamUrl(pathname: string, search: string): string {
    const staticMatch = pathname.match(/^\/ingest\/static\/(.*)$/);
    if (staticMatch) return `${ASSETS_HOST}/static/${staticMatch[1]}${search}`;
    const rest = pathname.startsWith('/ingest/') ? pathname.slice('/ingest'.length) : '/';
    return `${INGEST_HOST}${rest}${search}`;
}

export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > maxBytes) return null;
    if (!request.body) return new ArrayBuffer(0);

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel();
                } catch {}
                return null;
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body.buffer;
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
