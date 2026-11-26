export function authAnalyticsUrl(value) {
    try {
        const input = new URL(value);
        const url = new URL(input.origin + input.pathname);
        for (const [key, value] of input.searchParams) {
            if (key === 'ref' || key.startsWith('utm_')) url.searchParams.append(key, value);
        }
        return url.href;
    } catch { return ''; }
}
