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
