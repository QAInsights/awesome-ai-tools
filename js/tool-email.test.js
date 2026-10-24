import { describe, expect, test } from 'bun:test';
import { TOOL_EMAIL_LABELS, TOOL_EMAIL_PENDING_KEY, initToolEmail, statusForResponse } from './tool-email.js';

function makeStorage() {
    const map = new Map();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        map,
    };
}

function makeButton() {
    const listeners = {};
    return {
        textContent: TOOL_EMAIL_LABELS.idle,
        disabled: false,
        addEventListener: (type, fn) => { listeners[type] = fn; },
        click: () => listeners.click?.({ preventDefault() {} }),
    };
}

function setup({ authenticated = false, status = 200, payload = { content: 'result', search: '?team=5' }, storage = makeStorage() } = {}) {
    const state = { authenticated, sends: [], opens: [], tracks: [], authListeners: [] };
    const authManager = {
        initialize: async () => {},
        isAuthenticated: () => state.authenticated,
        onAuthChange: fn => state.authListeners.push(fn),
    };
    const button = makeButton();
    const statusEl = { textContent: '' };
    const controller = initToolEmail({
        button,
        statusEl,
        kind: 'cost-calculator',
        getPayload: () => payload,
        authManager,
        attribution: { open: trigger => state.opens.push(trigger) },
        analyticsClient: { track: (event, fields) => state.tracks.push([event, fields]) },
        api: { send: async body => { state.sends.push(body); return { status, data: { email: 'ada@example.com' } }; } },
        storage,
        schedule: () => 1,
        cancel: () => {},
    });
    return { state, button, statusEl, controller, storage };
}

describe('statusForResponse', () => {
    test('maps API statuses to button states', () => {
        expect(statusForResponse(200)).toBe('sent');
        expect(statusForResponse(401)).toBe('signin');
        expect(statusForResponse(409)).toBe('unverified');
        expect(statusForResponse(429)).toBe('limited');
        expect(statusForResponse(503)).toBe('failed');
    });
});

describe('initToolEmail', () => {
    test('signed-out click stashes the result, tracks the gate and opens sign-in', async () => {
        const { state, controller, storage, button } = setup();
        expect(await controller.handleClick()).toBe('unauthenticated');
        expect(state.sends).toHaveLength(0);
        expect(state.opens).toEqual(['tool_email']);
        expect(state.tracks[0][1]).toEqual({ trigger: 'tool_email', subject: 'cost-calculator' });
        expect(JSON.parse(storage.getItem(TOOL_EMAIL_PENDING_KEY))).toMatchObject({ kind: 'cost-calculator', content: 'result', search: '?team=5' });
        expect(button.textContent).toBe(TOOL_EMAIL_LABELS.signin);
    });

    test('sends the stashed result once after sign-in', async () => {
        const { state, controller, storage, statusEl } = setup();
        await controller.handleClick();
        state.authenticated = true;
        state.authListeners.forEach(fn => fn({ event: 'signin' }));
        await controller.resumePending();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(state.sends).toEqual([{ kind: 'cost-calculator', search: '?team=5', content: 'result' }]);
        expect(storage.getItem(TOOL_EMAIL_PENDING_KEY)).toBeNull();
        expect(statusEl.textContent).toBe('Sent to ada@example.com');
    });

    test('ignores a pending result from another tool', async () => {
        const storage = makeStorage();
        storage.setItem(TOOL_EMAIL_PENDING_KEY, JSON.stringify({ kind: 'rules-converter', content: 'x', savedAt: Date.now() }));
        const { state, controller } = setup({ authenticated: true, storage });
        expect(await controller.resumePending()).toBe('none');
        expect(state.sends).toHaveLength(0);
        expect(storage.getItem(TOOL_EMAIL_PENDING_KEY)).not.toBeNull();
    });

    test('signed-in click sends immediately and reports unverified accounts', async () => {
        const { state, controller, button } = setup({ authenticated: true, status: 409 });
        expect(await controller.handleClick()).toBe('unverified');
        expect(state.sends).toHaveLength(1);
        expect(button.textContent).toBe(TOOL_EMAIL_LABELS.unverified);
        expect(button.disabled).toBe(false);
    });

    test('does nothing when there is no result yet', async () => {
        const { state, controller, button } = setup({ authenticated: true, payload: null });
        expect(await controller.handleClick()).toBe('empty');
        expect(state.sends).toHaveLength(0);
        expect(button.textContent).toBe(TOOL_EMAIL_LABELS.empty);
    });
});
