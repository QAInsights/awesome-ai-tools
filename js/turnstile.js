export function createTurnstile({ windowRef = globalThis.window, documentRef = globalThis.document, siteKey = process.env.CF_SITEKEY || '1x00000000000000000000AA', timeoutMs = 15000, now = Date.now, maxAgeMs = 240000 } = {}) {
    let pending;
    let widget;
    let scriptPromise;
    let cached;
    let prefetching;
    let activeTake;

    function load() {
        if (windowRef.turnstile) return Promise.resolve(windowRef.turnstile);
        if (!scriptPromise) {
            scriptPromise = new Promise((resolve, reject) => {
                const script = documentRef.createElement('script');
                const fail = message => {
                    clearTimeout(timer);
                    script.onload = null;
                    script.onerror = null;
                    scriptPromise = null;
                    script.remove?.();
                    reject(new Error(message));
                };
                const timer = setTimeout(() => fail('Security check timed out. Please retry.'), timeoutMs);
                script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                script.onload = () => {
                    clearTimeout(timer);
                    if (windowRef.turnstile) resolve(windowRef.turnstile);
                    else fail('Security check unavailable. Please retry.');
                };
                script.onerror = () => fail('Security check unavailable. Please retry.');
                documentRef.head.appendChild(script);
            });
        }
        return scriptPromise;
    }

    function requestToken() {
        if (pending) return pending;
        pending = new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, value) => {
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve(value);
            };
            load().then(api => {
                if (settled) return;
                if (widget !== undefined) api.remove(widget);
                widget = api.render('#turnstile-container', {
                    sitekey: siteKey,
                    callback: value => value ? finish(null, value) : finish(new Error('Security check returned no token. Please retry.')),
                    'error-callback': () => { cached = null; finish(new Error('Security check failed. Please retry.')); return true; },
                    'unsupported-callback': () => finish(new Error("Security check isn't supported in this browser.")),
                    'expired-callback': () => { cached = null; finish(new Error('Security check expired. Please retry.')); },
                    'before-interactive-callback': () => documentRef?.querySelector?.('#turnstile-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                });
            }).catch(error => finish(error));
        }).finally(() => { pending = null; });
        return pending;
    }

    function prefetch() {
        if (activeTake) return Promise.resolve();
        if (cached && now() - cached.at < maxAgeMs) return Promise.resolve();
        if (!prefetching) {
            cached = null;
            prefetching = requestToken().then(value => { cached = { value, at: now() }; }).finally(() => { prefetching = null; });
        }
        return prefetching;
    }

    async function consume() {
        if (prefetching) {
            try { await prefetching; } catch {}
        }
        const ready = cached;
        cached = null;
        if (ready && now() - ready.at < maxAgeMs) return { token: ready.value, prefetched: true };
        return { token: await requestToken(), prefetched: false };
    }

    function take() {
        const result = activeTake ? activeTake.catch(() => {}).then(consume) : consume();
        activeTake = result;
        return result.finally(() => { if (activeTake === result) activeTake = null; });
    }

    return { token: async () => (await take()).token, prefetch, take };
}

let turnstile;
export function turnstileToken() {
    turnstile ??= createTurnstile();
    return turnstile.token();
}

export function prefetchTurnstileToken() {
    turnstile ??= createTurnstile();
    return turnstile.prefetch();
}

export function takeTurnstileToken() {
    turnstile ??= createTurnstile();
    return turnstile.take();
}
