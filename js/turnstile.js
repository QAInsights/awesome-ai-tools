export function createTurnstile({ windowRef = globalThis.window, documentRef = globalThis.document, siteKey = process.env.CF_SITEKEY || '1x00000000000000000000AA', timeoutMs = 15000 } = {}) {
    let pending;
    let widget;
    let scriptPromise;

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

    function token() {
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
                    'error-callback': () => { finish(new Error('Security check failed. Please retry.')); return true; },
                    'expired-callback': () => finish(new Error('Security check expired. Please retry.')),
                    'before-interactive-callback': () => documentRef?.querySelector?.('#turnstile-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                });
            }).catch(error => finish(error));
        }).finally(() => { pending = null; });
        return pending;
    }

    return { token };
}

let turnstile;
export function turnstileToken() {
    turnstile ??= createTurnstile();
    return turnstile.token();
}
