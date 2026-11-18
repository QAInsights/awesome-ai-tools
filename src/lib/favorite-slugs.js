export const MAX_GUEST_FAVORITES = 250;

/** @param {unknown} value @returns {value is string} */
export function isFavoriteSlug(value) {
    return typeof value === 'string' && value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
