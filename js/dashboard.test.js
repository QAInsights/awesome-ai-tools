import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

let domReadyHandler = null;

function makeButton(id) {
    const listeners = {};
    const button = {
        id,
        clicked: 0,
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: (event, fn) => {
            listeners[event] = fn;
        },
        click: () => {
            listeners.click?.();
            button.clicked += 1;
        },
        _trigger: (event) => {
            if (event === 'click') {
                listeners.click?.();
            }
        }
    };
    return button;
}

function makeContainer() {
    let html = '';
    const queryMap = {};

    return {
        set innerHTML(value) {
            html = value;
            for (const key of Object.keys(queryMap)) delete queryMap[key];
            const idMatches = [...value.matchAll(/id="([^"]+)"/g)];
            idMatches.forEach(([, id]) => {
                queryMap[`#${id}`] = makeButton(id);
            });
        },
        get innerHTML() {
            return html;
        },
        querySelector: (selector) => queryMap[selector] ?? null
    };
}

describe('dashboard bootstrap', () => {
    let iconSidebar;
    let openSidebarDesktop;

    beforeEach(() => {
        domReadyHandler = null;
        iconSidebar = makeContainer();
        openSidebarDesktop = {
            clicks: 0,
            addEventListener: () => {},
            click() {
                this.clicks += 1;
            }
        };

        global.window = {
            location: { href: '/compare' }
        };

        global.document = {
            addEventListener: (event, handler) => {
                if (event === 'DOMContentLoaded') {
                    domReadyHandler = handler;
                }
            },
            getElementById: (id) => {
                if (id === 'iconSidebar') return iconSidebar;
                if (id === 'openSidebarDesktop') return openSidebarDesktop;
                return null;
            },
            querySelectorAll: () => [],
            querySelector: () => null,
            body: { style: {} }
        };
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    test('renders collapsed sidebar icons and wires dashboard actions', async () => {
        await import(`./dashboard.js?test=${Date.now()}`);

        expect(typeof domReadyHandler).toBe('function');

        domReadyHandler();

        expect(iconSidebar.innerHTML).toContain('id="expandBtn"');
        expect(iconSidebar.innerHTML).toContain('id="searchBtn"');

        iconSidebar.querySelector('#expandBtn')._trigger('click');
        expect(openSidebarDesktop.clicks).toBe(1);

        iconSidebar.querySelector('#searchBtn')._trigger('click');
        expect(window.location.href).toBe('/');
    });
});
