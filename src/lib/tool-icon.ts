export function toolIconUpstreamUrl(toolUrl: string | undefined | null): string | null {
    if (!toolUrl) return null;

    try {
        const parsedUrl = new URL(toolUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) return null;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsedUrl.hostname)}&sz=128`;
    } catch {
        return null;
    }
}
