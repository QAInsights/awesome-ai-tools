import { describe, expect, test } from 'bun:test';
import { bindAuthSession } from './auth-session-binding.js';

describe('auth session binding', () => {
    test('shares one initialization and one auth subscription across page clients', async () => {
        const listeners = [];
        const user = { id: 'github:42', provider: 'github' };
        let initializations = 0;
        const authManager = {
            getCurrentUser: () => user,
            initialize: async () => { initializations += 1; },
            onAuthChange: listener => listeners.push(listener),
        };
        const root = {};
        const [first, second] = await Promise.all([
            bindAuthSession({ authManager, root }),
            bindAuthSession({ authManager, root }),
        ]);

        expect(first).toBe(second);
        expect(initializations).toBe(1);
        expect(listeners).toHaveLength(1);
    });
});
