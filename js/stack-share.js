import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

async function postFork(username, slug) {
    const response = await fetch('/api/stacks/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, slug }),
    });
    let data = {};
    try {
        data = await response.json();
    } catch {}
    if (!response.ok) {
        const message = response.status === 429
            ? 'Too many changes. Wait a minute and try again.'
            : response.status === 409 && data.error === 'stack_limit'
                ? 'You have reached the maximum number of stacks.'
                : data.error || 'Could not fork this stack.';
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

export async function handleForkStack(button, {
    authManager = auth,
    attribution = authAttribution,
    navigate = url => {
        if (typeof window !== 'undefined') window.location.href = url;
    },
} = {}) {
    await authManager.initialize();
    if (!authManager.isAuthenticated()) {
        attribution.open('stack_add');
        return { status: 'unauthenticated' };
    }

    const username = button.dataset?.stackUsername || '';
    const slug = button.dataset?.stackSlug || '';
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Forking…';

    try {
        const result = await postFork(username, slug);
        if (result.editorUrl) {
            navigate(result.editorUrl);
        }
        return { status: 'forked', editorUrl: result.editorUrl };
    } catch (error) {
        if (error.status === 401) {
            await authManager.signOut();
            attribution.open('stack_add');
            button.disabled = false;
            button.textContent = originalLabel;
            return { status: 'unauthenticated' };
        }
        button.disabled = false;
        button.textContent = error.message || 'Could not fork stack';
        setTimeout(() => {
            button.textContent = originalLabel;
        }, 2500);
        return { status: 'error', message: error.message };
    }
}

export async function handleCopySnippet(button, root = document) {
    const targetId = button.dataset?.copyTarget;
    const rawValue = button.dataset?.copyValue;
    const target = targetId ? root.getElementById?.(targetId) : null;
    const text = rawValue ?? target?.textContent ?? '';
    if (!text) return false;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
    }
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => {
        button.textContent = original;
    }, 1500);
    return true;
}

const initializedRoots = new WeakSet();

export function initializeStackShare({
    authManager = auth,
    attribution = authAttribution,
    root = document,
    navigate,
} = {}) {
    if (initializedRoots.has(root)) return;
    initializedRoots.add(root);

    root.addEventListener('click', event => {
        const forkBtn = event.target?.closest?.('[data-fork-stack]');
        if (forkBtn) {
            event.preventDefault();
            void handleForkStack(forkBtn, { authManager, attribution, navigate });
            return;
        }
        const copyBtn = event.target?.closest?.('[data-copy-snippet]');
        if (copyBtn) {
            event.preventDefault();
            void handleCopySnippet(copyBtn, root);
        }
    });
}
