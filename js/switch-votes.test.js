import { expect, test } from 'bun:test';
import { createSwitchVotes, initializeSwitchVotes } from './switch-votes.js';

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
        classList: { toggle() {} },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, handler) { this.listeners[type] = handler; },
        replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); },
        closest() { return this; },
    };
}

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
