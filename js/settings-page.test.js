import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

function makeElement(initialClasses = []) {
    const classes = new Set(initialClasses);
    const attributes = {};
    const listeners = {};
    const child = {
        classList: {
            toggle: (token, force) => force ? classes.add(token) : classes.delete(token),
        },
    };
    return {
        classList: {
            add: token => classes.add(token),
            remove: token => classes.delete(token),
            toggle: (token, force) => force ? classes.add(token) : classes.delete(token),
            contains: token => classes.has(token),
        },
        setAttribute: (name, value) => { attributes[name] = value; },
        getAttribute: name => attributes[name],
        addEventListener: (name, listener) => { listeners[name] = listener; },
        dispatch: async name => listeners[name]?.(),
        querySelector: () => child,
        textContent: '',
        disabled: false,
        attributes,
    };
}

describe('settings page bootstrap', () => {
    let elements;

    beforeEach(() => {
        elements = {
            settingsLoading: makeElement(),
            settingsSignedOut: makeElement(['hidden']),
            settingsError: makeElement(['hidden']),
            notificationsCard: makeElement(['hidden']),
            notificationEmailToggle: makeElement(),
            notificationNewsToggle: makeElement(),
            notificationEmail: makeElement(),
            notificationEmailWarning: makeElement(['hidden']),
        };
        global.document = {
            addEventListener: () => {},
            getElementById: id => elements[id] ?? null,
        };
        global.window = { location: { href: '' } };
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    test('loads preferences for an authenticated user and updates the toggle', async () => {
        const authManager = {
            isAuthenticated: () => true,
            initialize: async () => {},
            getCurrentUser: () => ({ id: 'github:123' }),
            onAuthChange: () => {},
        };
        let savedValue = null;
        const notificationsApi = {
            getPrefs: async () => ({ emailEnabled: true, newsEnabled: true, email: 'ada@example.com', emailVerified: true }),
            setEmailEnabled: async value => {
                savedValue = value;
                return { emailEnabled: value, newsEnabled: true, email: 'ada@example.com', emailVerified: true };
            },
            setNewsEnabled: async value => ({
                emailEnabled: true,
                newsEnabled: value,
                email: 'ada@example.com',
                emailVerified: true,
            }),
        };
        const { initializeSettingsPage } = await import(`./settings-page.js?test=${Date.now()}`);
        await initializeSettingsPage({ authManager, notificationsApi });

        expect(elements.notificationsCard.classList.contains('hidden')).toBe(false);
        expect(elements.notificationEmail.textContent).toBe('ada@example.com');
        expect(elements.notificationEmailToggle.attributes['aria-checked']).toBe('true');
        await elements.notificationEmailToggle.dispatch('click');
        expect(savedValue).toBe(false);
        expect(elements.notificationEmailToggle.attributes['aria-checked']).toBe('false');
        expect(elements.notificationNewsToggle.attributes['aria-checked']).toBe('true');
        await elements.notificationNewsToggle.dispatch('click');
        expect(elements.notificationNewsToggle.attributes['aria-checked']).toBe('false');
    });
});
