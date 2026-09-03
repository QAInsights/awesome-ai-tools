import { auth } from './auth.js';

const bindings = new WeakMap();

function createBinding(authManager, root) {
    const listeners = new Set();
    let current = null;

    function publish(change) {
        current = change;
        listeners.forEach(listener => {
            try {
                listener(change);
            } catch (error) {
                console.error('[Auth] Session UI listener failed:', error);
            }
        });
    }

    authManager.onAuthChange(publish);
    const binding = {
        current: () => current,
        ready: authManager.initialize().then(() => {
            if (!current) {
                publish({ event: 'initial', user: authManager.getCurrentUser(), error: null });
            }
            return current;
        }),
        subscribe(listener, { emitCurrent = true } = {}) {
            listeners.add(listener);
            if (emitCurrent && current) listener(current);
            return () => listeners.delete(listener);
        },
    };
    return binding;
}

export async function bindAuthSession({ authManager = auth, root = document } = {}) {
    let binding = bindings.get(authManager);
    if (!binding) {
        binding = createBinding(authManager, root);
        bindings.set(authManager, binding);
    }
    await binding.ready;
    return binding;
}
