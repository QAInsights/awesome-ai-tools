const SOURCE_LINK_PATTERN = /\[Source:[^\]]+\]\(<([^>]+)>\)/g;

export function extractNewsCitations(body) {
    return [...new Set(
        [...String(body ?? '').matchAll(SOURCE_LINK_PATTERN)].map((match) => match[1])
    )];
}
