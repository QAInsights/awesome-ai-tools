export function createFavoritesStore({ request = fetch } = {}) {
    const favorites = new Map();
    const pending = new Map();
    const listeners = new Set();
    let generation = 0;
    let latestLoad = 0;
    let revision = 0;

    function emit() {
        const snapshot = records();
        listeners.forEach(listener => listener(snapshot));
    }

    function records() {
        return Array.from(favorites, ([slug, createdAt]) => ({ slug, createdAt }))
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    function replace(items = []) {
        favorites.clear();
        items.forEach(item => {
            if (item && typeof item.slug === 'string') {
                favorites.set(item.slug, Number(item.createdAt) || 0);
            }
        });
        revision += 1;
        emit();
    }

    function isCurrentLoad(loadGeneration, loadId, loadRevision) {
        return generation === loadGeneration
            && latestLoad === loadId
            && revision === loadRevision
            && pending.size === 0;
    }

    function staleLoad(authenticated) {
        return { authenticated, favorites: records(), stale: true };
    }

    async function load(importPayload = null) {
        const loadGeneration = generation;
        const loadId = ++latestLoad;
        const loadRevision = revision;
        const options = importPayload
            ? {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(importPayload),
            }
            : { headers: { 'Accept': 'application/json' } };
        let response;
        try {
            response = await request('/api/favorites', options);
        } catch (error) {
            if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) return staleLoad(true);
            throw error;
        }
        if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) {
            return staleLoad(response.status !== 401);
        }
        if (response.status === 401) {
            replace();
            return { authenticated: false, favorites: [], stale: false };
        }
        if (!response.ok) {
            const error = new Error(importPayload ? 'Unable to import favorites' : 'Unable to load favorites');
            error.status = response.status;
            throw error;
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) return staleLoad(true);
            throw error;
        }
        if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) {
            return staleLoad(true);
        }
        replace(Array.isArray(data.favorites) ? data.favorites : []);
        return { authenticated: true, favorites: records(), stale: false };
    }

    async function toggle(slug) {
        if (!slug || pending.has(slug)) return has(slug);

        const operation = Symbol(slug);
        const operationGeneration = generation;
        const wasFavorite = favorites.has(slug);
        const previousCreatedAt = favorites.get(slug);
        const adding = !wasFavorite;
        pending.set(slug, operation);
        if (adding) favorites.set(slug, Date.now());
        else favorites.delete(slug);
        revision += 1;
        emit();

        try {
            const response = await request(`/api/favorites/${encodeURIComponent(slug)}`, {
                method: adding ? 'PUT' : 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
            if (!response.ok) {
                const error = new Error('Unable to update favorite');
                error.status = response.status;
                throw error;
            }

            if (adding) {
                const data = await response.json();
                if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
                favorites.set(slug, Number(data.favorite?.createdAt) || favorites.get(slug) || Date.now());
                revision += 1;
                emit();
            } else {
                revision += 1;
            }
            return adding;
        } catch (error) {
            if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
            if (wasFavorite) favorites.set(slug, previousCreatedAt ?? 0);
            else favorites.delete(slug);
            revision += 1;
            emit();
            throw error instanceof Error ? error : new Error('Unable to update favorite');
        } finally {
            if (pending.get(slug) === operation) pending.delete(slug);
        }
    }

    function has(slug) {
        return favorites.has(slug);
    }

    function slugs() {
        return records().map(favorite => favorite.slug);
    }

    function clear() {
        generation += 1;
        latestLoad += 1;
        pending.clear();
        replace();
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    return { clear, has, load, records, slugs, subscribe, toggle };
}
