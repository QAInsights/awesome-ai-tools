const UTM_SOURCE = 'ai.dosa.dev';
const UTM_MEDIUM = 'referral';

export function addOutboundUtmParams(value) {
    if (typeof value !== 'string' || value.length === 0) return value;
    if (!/^https?:\/\//i.test(value)) return value;

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return value;
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        return value;
    }

    if (parsed.searchParams.has('utm_source')) {
        return value;
    }

    const hashIndex = value.indexOf('#');
    const base = hashIndex === -1 ? value : value.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
    const separator = base.includes('?') ? '&' : '?';

    return `${base}${separator}utm_source=${UTM_SOURCE}&utm_medium=${UTM_MEDIUM}${hash}`;
}
