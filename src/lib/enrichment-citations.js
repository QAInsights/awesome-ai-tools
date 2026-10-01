const CITATION_MARKER = /\s*\[\d+(?:\s*[,\u2013-]\s*\d+)*\]/g;

/** Remove search-result citation markers such as "[5][2]" from enrichment text. */
export function stripCitations(value) {
    if (typeof value === 'string') return value.replace(CITATION_MARKER, '').trim();
    if (Array.isArray(value)) return value.map(stripCitations);
    return value;
}

/**
 * Copy of an enriched tool entry with citation markers removed from every field.
 * @template {object} T
 * @param {T} entry
 * @returns {T}
 */
export function stripEnrichedCitations(entry) {
    return /** @type {T} */ (Object.fromEntries(
        Object.entries(entry).map(([key, value]) => [key, stripCitations(value)]),
    ));
}
