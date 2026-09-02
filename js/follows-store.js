export function createFollowsStore({ request = fetch } = {}) {
    const follows = new Map();
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
        return Array.from(follows, ([slug, createdAt]) => ({ slug, createdAt }))
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    function replace(items = []) {
        follows.clear();
        items.forEach(item => {
            if (item && typeof item.slug === 'string') {
                follows.set(item.slug, Number(item.createdAt) || 0);
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
        return { authenticated, follows: records(), stale: true };
    }

    async function load() {
        const loadGeneration = generation;
        const loadId = ++latestLoad;
        const loadRevision = revision;
        let response;
        try {
            response = await request('/api/follows', {
                headers: { 'Accept': 'application/json' },
            });
        } catch (error) {
            if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) return staleLoad(true);
            throw error;
        }
        if (!isCurrentLoad(loadGeneration, loadId, loadRevision)) {
            return staleLoad(response.status !== 401);
        }
        if (response.status === 401) {
            replace();
            return { authenticated: false, follows: [], stale: false };
        }
        if (!response.ok) {
            const error = new Error('Unable to load follows');
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
        replace(Array.isArray(data.follows) ? data.follows : []);
        return { authenticated: true, follows: records(), stale: false };
    }

    async function toggle(slug) {
        if (!slug || pending.has(slug)) return has(slug);

        const operation = Symbol(slug);
        const operationGeneration = generation;
        const wasFollowed = follows.has(slug);
        const previousCreatedAt = follows.get(slug);
        const adding = !wasFollowed;
        pending.set(slug, operation);
        if (adding) follows.set(slug, Date.now());
        else follows.delete(slug);
        revision += 1;
        emit();

        try {
            const response = await request(`/api/follows/${encodeURIComponent(slug)}`, {
                method: adding ? 'PUT' : 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
            if (!response.ok) {
                const error = new Error('Unable to update follow');
                error.status = response.status;
                throw error;
            }

            if (adding) {
                const data = await response.json();
                if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
                follows.set(slug, Number(data.follow?.createdAt) || follows.get(slug) || Date.now());
                revision += 1;
                emit();
            } else {
                revision += 1;
            }
            return adding;
        } catch (error) {
            if (generation !== operationGeneration || pending.get(slug) !== operation) return has(slug);
            if (wasFollowed) follows.set(slug, previousCreatedAt ?? 0);
            else follows.delete(slug);
            revision += 1;
            emit();
            throw error instanceof Error ? error : new Error('Unable to update follow');
        } finally {
            if (pending.get(slug) === operation) pending.delete(slug);
        }
    }

    function has(slug) {
        return follows.has(slug);
    }

    function slugs() {
        return records().map(follow => follow.slug);
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
