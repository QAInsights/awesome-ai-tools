import { expect, test } from 'bun:test';
import { createSwitchVotes, initializeSwitchVotes, optimisticSwitch } from './switch-votes.js';

const data = (mine = null) => ({ total: mine ? 1 : 0, counts: mine ? [{ tool: mine, votes: 1 }] : [], mine });
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('loads without Turnstile, then sets, changes and undoes with fresh tokens and analytics', async () => {
    const calls = [], events = [];
    let tokens = 0;
    const controller = createSwitchVotes({ tool: 'cursor', sourcePath: '/tools/cursor/alternatives',
        getToken: async () => `token-${++tokens}`, track: (...args) => events.push(args),
        request: async (url, options) => { calls.push({ url, options }); return response(data(options.method ? JSON.parse(options.body).target : null)); },
    });
    expect(await controller.vote('cline')).toBe(false);
    await controller.load();
    expect(tokens).toBe(0);
    for (const pick of ['cline', 'zed', 'zed']) expect(await controller.vote(pick)).toBe(true);
    expect(tokens).toBe(3);
    expect(calls.slice(1).map(call => JSON.parse(call.options.body))).toEqual([
        { tool: 'cursor', target: 'cline', token: 'token-1' }, { tool: 'cursor', target: 'zed', token: 'token-2' }, { tool: 'cursor', target: null, token: 'token-3' },
    ]);
    expect(events.map(([event, fields]) => [event, fields.subject, fields.target, fields.action, fields.source_path])).toEqual([
        ['switch_vote', 'cursor', 'cline', 'set', '/tools/cursor/alternatives'],
        ['switch_vote', 'cursor', 'zed', 'change', '/tools/cursor/alternatives'],
        ['switch_vote', 'cursor', 'zed', 'undo', '/tools/cursor/alternatives'],
    ]);
    expect(controller.state.data.mine).toBeNull();
});

test('releases busy state on challenge and API failures, preserves the pick, and prevents concurrent votes', async () => {
    let finish, calls = 0;
    const events = [];
    const controller = createSwitchVotes({ tool: 'cursor', track: (...args) => events.push(args),
        getToken: () => new Promise(resolve => { finish = resolve; }),
        request: async () => ++calls === 1 ? response(data('cline')) : new Response('', { status: 429 }),
    });
    await controller.load();
    const pending = controller.vote('zed');
    expect(await controller.vote('zed')).toBe(false);
    finish('token');
    expect(await pending).toBe(false);
    expect(controller.state.busy).toBe(false);
    expect(controller.state.data.mine).toBe('cline');
    expect(controller.state.error).toContain('wait a minute');
    expect(events).toHaveLength(0);
    const failedChallenge = createSwitchVotes({ tool: 'cursor', request: async () => response(data()), getToken: async () => { throw new Error('unsupported browser'); } });
    await failedChallenge.load();
    expect(await failedChallenge.vote('cline')).toBe(false);
    expect(failedChallenge.state.error).toBe('unsupported browser');
    expect(failedChallenge.state.busy).toBe(false);
});

test('failed or malformed initial responses allow retry without enabling premature voting', async () => {
    let calls = 0;
    const controller = createSwitchVotes({ tool: 'cursor', request: async () => response(++calls === 1 ? {} : data()) });
    await controller.load();
    expect(controller.state.loaded).toBe(false);
    expect(controller.state.error).toContain('Invalid');
    expect(await controller.vote('cline')).toBe(false);
    await controller.load();
    expect(controller.state.loaded).toBe(true);
    expect(controller.state.error).toBe('');
});

function element(dataset = {}) {
    return { dataset, hidden: false, disabled: false, children: [], style: {}, attributes: {}, listeners: {},
        classList: { values: new Set(), toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); } },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, handler) { this.listeners[type] = handler; },
        replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); },
        closest() { return this; },
    };
}

test('sign-in and sign-out refetch identity-specific picks and render the correct undo control', async () => {
    const selectors = Object.fromEntries(['results', 'total', 'status', 'retry', 'share'].map(key => [`[data-switch-${key}]`, element()]));
    const widget = element({ switchVotes: 'cursor' });
    widget.querySelector = selector => selectors[selector];
    widget.ownerDocument = { createElement: () => element() };
    const buttons = ['cline', 'zed'].map(slug => element({ switchTarget: slug, switchName: slug }));
    let authChanged, mine = 'cline';
    const posts = [];
    const controller = initializeSwitchVotes({ querySelector: () => widget, querySelectorAll: () => buttons }, {
        authManager: { onAuthChange: callback => { authChanged = callback; } },
        getToken: async () => 'token', track() {},
        request: async (_url, options) => {
            if (options.method) { const body = JSON.parse(options.body); posts.push(body); mine = body.target; }
            return response(data(mine));
        },
    });
    await controller.ready;
    expect(buttons[0].textContent).toBe('Undo my pick');
    mine = 'zed';
    const signin = authChanged({ event: 'signin' });
    expect(buttons.every(button => button.disabled)).toBe(true);
    await signin;
    expect(buttons[0].attributes['aria-pressed']).toBe('false');
    expect(buttons[1].textContent).toBe('Undo my pick');
    mine = 'cline';
    await authChanged({ event: 'signout' });
    expect(buttons[0].textContent).toBe('Undo my pick');
    expect(buttons[1].textContent).toBe('I switched to zed');
    await controller.vote('zed');
    expect(posts[0].target).toBe('zed');
});

test('auth changes supersede pending reads and prevent pending challenges from voting as another identity', async () => {
    let authChanged, finishRead, finishToken, reads = 0, posts = 0;
    const controller = createSwitchVotes({ tool: 'cursor',
        authManager: { onAuthChange: callback => { authChanged = callback; } },
        getToken: () => new Promise(resolve => { finishToken = resolve; }),
        request: (_url, options) => {
            if (options.method) posts++;
            if (++reads === 1) return new Promise(resolve => { finishRead = resolve; });
            return Promise.resolve(response(data('zed')));
        },
    });
    const oldRead = controller.load();
    await authChanged({ event: 'signin' });
    finishRead(response(data('cline')));
    await oldRead;
    expect(controller.state.data.mine).toBe('zed');
    const oldVote = controller.vote('zed');
    await authChanged({ event: 'signout' });
    finishToken('token');
    expect(await oldVote).toBe(false);
    expect(posts).toBe(0);
    expect(controller.state.busy).toBe(false);
    expect(controller.state.data.mine).toBe('zed');
    expect(controller.state.error).toContain('sign-in state changed while voting');
});

test('session restoration does not refetch or cancel a vote waiting on Turnstile', async () => {
    let authChanged, finishToken, gets = 0;
    const posts = [];
    const controller = createSwitchVotes({ tool: 'cursor', track() {},
        authManager: { onAuthChange: callback => { authChanged = callback; } },
        getToken: () => new Promise(resolve => { finishToken = resolve; }),
        request: async (_url, options) => {
            if (options.method) { posts.push(JSON.parse(options.body)); return response(data('cline')); }
            gets++; return response(data());
        },
    });
    await controller.load();
    const pending = controller.vote('cline');
    await authChanged({ event: 'session_restored' });
    expect(gets).toBe(1);
    expect(controller.state.busy).toBe(true);
    finishToken('token');
    expect(await pending).toBe(true);
    expect(posts).toEqual([{ tool: 'cursor', target: 'cline', token: 'token' }]);
    expect(controller.state.error).toBe('');
});

test('renders empty and voted states, top-five bars, button selection and share visibility', async () => {
    const selectors = Object.fromEntries(['results', 'total', 'status', 'retry', 'share'].map(key => [`[data-switch-${key}]`, element()]));
    const widget = element({ switchVotes: 'cursor' });
    widget.querySelector = selector => selectors[selector];
    widget.ownerDocument = { createElement: () => element() };
    const buttons = ['cline', 'zed', 'third', 'fourth', 'fifth', 'sixth'].map(slug => element({ switchTarget: slug, switchName: slug.toUpperCase() }));
    const root = { querySelector: () => widget, querySelectorAll: () => buttons };
    const controller = initializeSwitchVotes(root, { getToken: async () => 'token', track() {}, request: async (_url, options) => response(options.method ? {
        total: 6, mine: 'cline', counts: buttons.map(button => ({ tool: button.dataset.switchTarget, votes: 1 })),
    } : data()) });
    await controller.ready;
    expect(selectors['[data-switch-status]'].textContent).toContain('Be the first to vote');
    expect(selectors['[data-switch-share]'].hidden).toBe(true);
    expect(buttons[0].disabled).toBe(false);
    expect(initializeSwitchVotes(root)).toBeUndefined();
    await controller.vote('cline');
    expect(selectors['[data-switch-share]'].hidden).toBe(false);
    expect(selectors['[data-switch-results]'].children).toHaveLength(5);
    expect(selectors['[data-switch-results]'].children[0].children[1].children[0].style.width).toBe('17%');
    expect(buttons[0].textContent).toBe('Undo my pick');
    expect(buttons[0].attributes['aria-pressed']).toBe('true');
    expect(selectors['[data-switch-total]'].textContent).toBe('6 votes');
});

function switchDom(options = {}) {
    const selectors = Object.fromEntries(['results', 'total', 'status', 'retry', 'share', 'undo', 'other'].map(key => [`[data-switch-${key}]`, element()]));
    selectors['[data-switch-other]'].options = [{ value: '' }, { value: 'zed' }];
    const widget = element({ switchVotes: 'cursor' });
    widget.querySelector = selector => selectors[selector];
    widget.ownerDocument = { createElement: () => element() };
    const buttons = [
        element({ switchTarget: 'cline', switchName: 'Cline', switchLabel: 'Cline' }),
        element({ switchTarget: 'cline', switchName: 'Cline' }),
        element({ switchTarget: 'zed', switchName: 'Zed' }),
    ];
    const controller = initializeSwitchVotes({ querySelector: () => widget, querySelectorAll: () => buttons }, {
        authManager: { onAuthChange() {} }, getToken: async () => 'token', track() {},
        request: async (_url, options) => response(data(options.method ? JSON.parse(options.body).target : null)), ...options,
    });
    return { controller, buttons, widget, selectors };
}

test('in-box picks, named cards, Other and Undo share selection and rollback optimistic rendering', async () => {
    let finishPost;
    const { controller, selectors, buttons } = switchDom({ request: async (_url, options) => options.method ? new Promise(resolve => { finishPost = resolve; }) : response(data()) });
    const status = selectors['[data-switch-status]'], other = selectors['[data-switch-other]'], undo = selectors['[data-switch-undo]'];
    await controller.ready;
    expect(status.textContent).toBe('Be the first to vote. Pick the tool you switched to.');
    expect(undo.hidden).toBe(true);
    expect(buttons.map(button => button.textContent)).toEqual(['Cline', 'I switched to Cline', 'I switched to Zed']);
    const picked = buttons[0].listeners.click();
    expect(buttons.slice(0, 2).map(button => button.attributes['aria-pressed'])).toEqual(['true', 'true']);
    expect(status.textContent).toBe('Saving…');
    expect(selectors['[data-switch-total]'].textContent).toBe('1 vote');
    expect(selectors['[data-switch-results]'].children[0].children[0].textContent).toBe('Cline · 1 vote · 100%');
    expect(buttons.every(button => button.disabled)).toBe(true);
    expect(other.disabled).toBe(true);
    await Promise.resolve();
    finishPost(response(data('cline')));
    expect(await picked).toBe(true);
    expect(status.textContent).toBe('Your pick: Cline.');
    expect(undo.hidden).toBe(false);
    other.value = 'zed';
    const changed = other.listeners.change();
    expect(other.value).toBe('zed');
    expect(other.classList.values.has('switch-selected')).toBe(true);
    expect(buttons.map(button => button.attributes['aria-pressed'])).toEqual(['false', 'false', 'true']);
    expect(selectors['[data-switch-total]'].textContent).toBe('1 vote');
    await Promise.resolve();
    finishPost(new Response(JSON.stringify({ error: 'turnstile_failed' }), { status: 403 }));
    expect(await changed).toBe(false);
    expect(status.textContent).toBe('Security check failed. Please retry.');
    expect(other.value).toBe('');
    expect(other.classList.values.has('switch-selected')).toBe(false);
    expect(buttons.map(button => button.attributes['aria-pressed'])).toEqual(['true', 'true', 'false']);
    const undone = undo.listeners.click();
    expect(selectors['[data-switch-total]'].textContent).toBe('0 votes');
    expect(selectors['[data-switch-results]'].children).toHaveLength(0);
    expect(buttons.map(button => button.attributes['aria-pressed'])).toEqual(['false', 'false', 'false']);
    await Promise.resolve();
    finishPost(response(data()));
    expect(await undone).toBe(true);
    expect(undo.hidden).toBe(true);
    expect(status.textContent).toContain('Be the first to vote');
});

test('optimistic set, change and undo preserve other voters, resort top picks and never mutate the snapshot', () => {
    const original = { total: 7, mine: 'zed', counts: [{ tool: 'zed', votes: 2 }, ...['a', 'b', 'c', 'd', 'e'].map(tool => ({ tool, votes: 1 }))] };
    const changed = optimisticSwitch(original, 'e');
    expect(changed.total).toBe(7);
    expect(changed.counts[0]).toEqual({ tool: 'e', votes: 2 });
    expect(changed.counts.slice(0, 5).map(row => row.tool)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(original.counts[0]).toEqual({ tool: 'zed', votes: 2 });
    expect(optimisticSwitch(data(), 'cline')).toEqual(data('cline'));
    expect(optimisticSwitch(data('cline'), null)).toEqual(data());
});

test('prefetch stays off-screen until proximity or vote-control intent, and failures do not block a click', async () => {
    let intersect, observed, disconnected = false, prefetches = 0;
    class Observer {
        constructor(callback, options) { intersect = callback; expect(options.rootMargin).toBe('200px'); }
        observe(target) { observed = target; }
        disconnect() { disconnected = true; }
    }
    const { controller, widget, buttons, selectors } = switchDom({ IntersectionObserver: Observer, prefetchToken: async () => { prefetches++; throw new Error('prefetch failed'); } });
    await controller.ready;
    expect(observed).toBe(widget);
    expect(prefetches).toBe(0);
    intersect([{ isIntersecting: false }]);
    expect(prefetches).toBe(0);
    for (const control of [...buttons, selectors['[data-switch-other]'], selectors['[data-switch-undo]']]) {
        control.listeners.pointerenter();
        control.listeners.focus();
    }
    await Promise.resolve();
    expect(prefetches).toBe(10);
    intersect([{ isIntersecting: true }]);
    await Promise.resolve();
    expect(prefetches).toBe(11);
    expect(disconnected).toBe(true);
    expect(await controller.vote('cline')).toBe(true);
    expect(controller.state.error).toBe('');
});

test('records token/request timing and whether the single-use token was prefetched', async () => {
    const events = [], times = [10, 12, 13, 513, 600, 625, 626, 726];
    let tokens = 0;
    const controller = createSwitchVotes({ tool: 'cursor', now: () => times.shift(),
        getToken: async () => ({ token: 'token', prefetched: ++tokens === 1 }), track: (_event, fields) => events.push(fields),
        request: async (_url, options) => response(data(options.method ? JSON.parse(options.body).target : null)),
    });
    await controller.load();
    await controller.vote('cline');
    await controller.vote('cline');
    expect(events.map(({ token_ms, request_ms, token_prefetched }) => ({ token_ms, request_ms, token_prefetched }))).toEqual([
        { token_ms: 2, request_ms: 500, token_prefetched: true }, { token_ms: 25, request_ms: 100, token_prefetched: false },
    ]);
});

test('honest security errors do not replace other 403, 429 or server-error messages', async () => {
    for (const [status, body, message] of [
        [403, { error: 'turnstile_failed' }, 'Security check failed. Please retry.'],
        [403, { error: 'Invalid request origin' }, 'Community picks are unavailable. Please retry.'],
        [403, 'not JSON', 'Community picks are unavailable. Please retry.'],
        [429, {}, 'Too many votes. Please wait a minute and retry.'],
        [503, {}, 'Community picks are unavailable. Please retry.'],
    ]) {
        const controller = createSwitchVotes({ tool: 'cursor', getToken: async () => 'token',
            request: async (_url, options) => options.method ? new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }) : response(data('cline')),
        });
        await controller.load();
        expect(await controller.vote('zed')).toBe(false);
        expect(controller.state.data).toEqual(data('cline'));
        expect(controller.state.error).toBe(message);
        expect(controller.state.saving).toBe(false);
    }
});

test('a response from an old voter cannot overwrite the refreshed identity or roll it back', async () => {
    let authChanged, finishPost, failPost;
    const controller = createSwitchVotes({ tool: 'cursor', getToken: async () => 'token',
        authManager: { onAuthChange: callback => { authChanged = callback; } },
        request: async (_url, options) => options.method ? new Promise((resolve, reject) => { finishPost = resolve; failPost = reject; }) : response(data('zed')),
    });
    await controller.load();
    const first = controller.vote('cline');
    expect(controller.state.data.mine).toBe('cline');
    await Promise.resolve();
    await authChanged({ event: 'signout' });
    finishPost(response(data('cline')));
    expect(await first).toBe(false);
    expect(controller.state.data).toEqual(data('zed'));
    const second = controller.vote('cline');
    await Promise.resolve();
    await authChanged({ event: 'signin' });
    failPost(new Error('network failed'));
    expect(await second).toBe(false);
    expect(controller.state.data).toEqual(data('zed'));
    expect(controller.state.error).toContain('sign-in state changed');
});
