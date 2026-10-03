export function makeElement(initialClasses = []) {
    const classes = new Set(initialClasses);
    const attributes = new Map();
    const listeners = new Map();
    const element = {
        attributes,
        children: [],
        classList: {
            add: token => classes.add(token),
            remove: token => classes.delete(token),
            toggle: (token, force = !classes.has(token)) => {
                if (force) classes.add(token);
                else classes.delete(token);
                return force;
            },
            contains: token => classes.has(token),
        },
        dataset: {},
        disabled: false,
        innerHTML: '',
        listeners,
        textContent: '',
        value: '',
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        append(child) {
            this.children.push(child);
        },
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        querySelector(selector) {
            return this.queries?.[selector] ?? null;
        },
        replaceChildren(...children) {
            this.children = children;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
    };
    return element;
}

export function makeRoot(elements) {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        createElement: () => makeElement(),
        getElementById: id => elements[id] ?? null,
    };
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
