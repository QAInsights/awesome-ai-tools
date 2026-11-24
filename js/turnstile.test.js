import { expect, test } from 'bun:test';
import { createTurnstile } from './turnstile.js';

test('does not load or render on ordinary page views; protected actions get fresh tokens', async () => {
    let renders = 0;
    const removed = [];
    const windowRef = { turnstile: {
        render: (_selector, options) => { renders++; queueMicrotask(() => options.callback(`token-${renders}`)); return renders; },
        remove: id => removed.push(id),
    } };
    const check = createTurnstile({ windowRef });
    expect(renders).toBe(0);
    expect(await check.token()).toBe('token-1');
    expect(await check.token()).toBe('token-2');
    expect(removed).toEqual([1]);
});

test('handles widget errors without throwing and allows an action retry', async () => {
    let options;
    const check = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, value) => { options = value; return 0; }, remove: () => {},
    } } });
    const first = check.token();
    await Promise.resolve();
    expect(options['error-callback']('300030')).toBe(true);
    await expect(first).rejects.toThrow('Security check failed');
    const second = check.token();
    await Promise.resolve();
    options.callback('retry-token');
    expect(await second).toBe('retry-token');
});

test('rejects empty tokens and times out an unavailable API', async () => {
    const empty = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, options) => { options.callback(''); return 0; },
    } } });
    await expect(empty.token()).rejects.toThrow('no token');
    let loads = 0;
    const unavailable = createTurnstile({ windowRef: {}, documentRef: {
        createElement: () => ({}), head: { appendChild() { loads++; } },
    }, timeoutMs: 1 });
    await expect(unavailable.token()).rejects.toThrow('timed out');
    await expect(unavailable.token()).rejects.toThrow('timed out');
    expect(loads).toBe(2);
});

test('rejects unsupported browsers and releases the pending challenge for retry', async () => {
    let options;
    const check = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, value) => { options = value; return 0; }, remove: () => {},
    } } });
    const first = check.token();
    await Promise.resolve();
    options['unsupported-callback']();
    await expect(first).rejects.toThrow("Security check isn't supported in this browser.");
    const retry = check.token();
    await Promise.resolve();
    options.callback('retry-token');
    expect(await retry).toBe('retry-token');
});

test('allows interactive solves beyond the SDK deadline and reveals the challenge', async () => {
    let options;
    let scrolled = false;
    const check = createTurnstile({ timeoutMs: 1, documentRef: {
        querySelector: () => ({ scrollIntoView: () => { scrolled = true; } }),
    }, windowRef: { turnstile: {
        render: (_selector, value) => { options = value; return 0; },
    } } });
    const token = check.token();
    await new Promise(resolve => setTimeout(resolve, 10));
    options['before-interactive-callback']();
    expect(scrolled).toBe(true);
    options.callback('late-solve');
    expect(await token).toBe('late-solve');
});

test('caches at most one prefetched token, consumes it once and discards it before five minutes', async () => {
    let renders = 0, now = 0;
    const check = createTurnstile({ now: () => now, windowRef: { turnstile: {
        render: (_selector, options) => { const value = `token-${++renders}`; queueMicrotask(() => options.callback(value)); return renders; }, remove() {},
    } } });
    expect(renders).toBe(0);
    await Promise.all([check.prefetch(), check.prefetch()]);
    await check.prefetch();
    expect(renders).toBe(1);
    expect(await check.take()).toEqual({ token: 'token-1', prefetched: true });
    expect(await check.take()).toEqual({ token: 'token-2', prefetched: false });
    await check.prefetch();
    now = 240000;
    expect(await check.take()).toEqual({ token: 'token-4', prefetched: false });
    expect(renders).toBe(4);
});

test('a click waits for an in-flight prefetch and concurrent actions cannot reuse the same token', async () => {
    let renders = 0, options;
    let secondRender;
    const rendered = new Promise(resolve => { secondRender = resolve; });
    const check = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, value) => { options = value; if (++renders === 2) secondRender(); return renders; }, remove() {},
    } } });
    const prefetch = check.prefetch();
    await Promise.resolve();
    const first = check.take(), second = check.take();
    expect(renders).toBe(1);
    options.callback('prefetched');
    await prefetch;
    expect(await first).toEqual({ token: 'prefetched', prefetched: true });
    await rendered;
    expect(renders).toBe(2);
    options.callback('fresh');
    expect(await second).toEqual({ token: 'fresh', prefetched: false });
});

test('expiry callbacks invalidate cached tokens and failed prefetch falls back on click', async () => {
    let renders = 0, options, fail = false;
    const check = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, value) => {
            options = value;
            const token = `token-${++renders}`;
            queueMicrotask(() => fail ? value['error-callback']() : value.callback(token));
            return renders;
        }, remove() {},
    } } });
    await check.prefetch();
    options['expired-callback']();
    expect(await check.take()).toEqual({ token: 'token-2', prefetched: false });
    fail = true;
    await expect(check.prefetch()).rejects.toThrow('Security check failed');
    fail = false;
    expect(await check.take()).toEqual({ token: 'token-4', prefetched: false });
});

test('viewport prefetch cannot cache a token already being consumed by an action', async () => {
    let renders = 0;
    const check = createTurnstile({ windowRef: { turnstile: {
        render: (_selector, options) => { const token = `token-${++renders}`; queueMicrotask(() => options.callback(token)); return renders; }, remove() {},
    } } });
    const click = check.take();
    await check.prefetch();
    expect(await click).toEqual({ token: 'token-1', prefetched: false });
    expect(await check.take()).toEqual({ token: 'token-2', prefetched: false });
});
