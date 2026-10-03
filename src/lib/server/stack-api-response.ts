import { jsonError } from './request-security';

export function withPublicUrl<T extends { slug: string }>(value: T, username: string | null) {
    return username
        ? { ...value, publicUrl: `/u/${encodeURIComponent(username)}/${encodeURIComponent(value.slug)}` }
        : value;
}

export function privateJson(data: unknown, status = 200): Response {
    return Response.json(data, {
        status,
        headers: { 'Cache-Control': 'private, no-store' },
    });
}

export function privateJsonError(message: string, status: number): Response {
    const response = jsonError(message, status);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
}
