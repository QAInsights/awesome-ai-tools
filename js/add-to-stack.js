import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    let data = {};
    try {
        data = await response.json();
    } catch {}
    if (!response.ok) {
        const message = response.status === 429
            ? 'Too many changes. Wait a minute and try again.'
            : data.error || 'Request failed';
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

let activePopover = null;

function closePopover() {
    activePopover?.popover.remove();
    activePopover?.button.setAttribute('aria-expanded', 'false');
    activePopover = null;
}

function renderResult(popover, message, editorUrl, isError = false) {
    const messageClass = isError
        ? 'stack-popover-message is-error'
        : 'stack-popover-message is-success';
    popover.querySelector('[data-stack-result]').innerHTML = `
        <p class="${messageClass}">${escapeHtml(message)}</p>
        ${editorUrl ? `<a href="${escapeHtml(editorUrl)}" class="stack-popover-link">Edit this stack →</a>` : ''}`;
}

function stackEditorUrl(id) {
    return `/stacks/edit?id=${encodeURIComponent(id)}`;
}

async function appendTool(popover, stack, tool, authManager, attribution) {
    try {
        const result = await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: tool.slug, purpose: tool.category }),
        });
        renderResult(
            popover,
            result.status === 'exists' ? 'Already in this stack.' : 'Added to your stack.',
            stackEditorUrl(stack.id),
        );
    } catch (error) {
        if (error.status === 409 && error.message === 'item_exists') {
            renderResult(popover, 'Already in this stack.', stackEditorUrl(stack.id));
            return;
        }
        if (error.status === 401) {
            await authManager.signOut();
            attribution.open('stack_add');
            closePopover();
            return;
        }
        renderResult(popover, error.message || 'Could not add this tool.', '', true);
    }
}

async function openPopover(button, { authManager, attribution, root }) {
    if (activePopover?.button === button) {
        closePopover();
        return;
    }
    closePopover();

    await authManager.initialize();
    if (!authManager.isAuthenticated()) {
        attribution.open('stack_add');
        return;
    }

    const wrapper = button.closest('[data-stack-control]') || button.parentElement;
    const popover = root.createElement('div');
    popover.className = 'stack-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Add this tool to a stack');
    popover.innerHTML = `
        <div class="stack-popover-header">
            <h2 class="stack-popover-title">Add to a stack</h2>
            <button type="button" data-close-popover aria-label="Close" class="stack-popover-close">×</button>
        </div>
        <div data-stack-list class="stack-popover-list"></div>
        <button type="button" data-new-stack class="stack-new-button">＋ New stack</button>
        <div data-stack-result role="status" class="stack-popover-result"></div>`;
    const viewportPopover = root.defaultView?.matchMedia?.('(max-width: 600px)')?.matches;
    (viewportPopover && root.body ? root.body : wrapper).append(popover);
    button.setAttribute('aria-expanded', 'true');
    activePopover = { button, popover };
    const tool = {
        slug: button.dataset.toolSlug,
        category: button.dataset.toolCategory || 'AI tools',
    };
    const list = popover.querySelector('[data-stack-list]');
    list.innerHTML = '<p class="stack-popover-message">Loading your stacks…</p>';

    try {
        const result = await requestJson('/api/stacks');
        const stacks = result.stacks || [];
        list.innerHTML = stacks.length ? stacks.map(stack => `
            <button type="button" data-stack-id="${escapeHtml(stack.id)}" class="stack-option">
                <span class="stack-option-copy"><b class="stack-option-title">${escapeHtml(stack.title)}</b><small class="stack-option-meta">${stack.itemCount} ${stack.itemCount === 1 ? 'tool' : 'tools'} · ${stack.isPublic ? 'Public' : 'Private'}</small></span>
                <span class="stack-option-arrow">→</span>
            </button>`).join('') : '<p class="stack-popover-message">Create your first stack to get started.</p>';

        list.addEventListener('click', async event => {
            const item = event.target.closest?.('[data-stack-id]');
            if (!item) return;
            const stack = stacks.find(candidate => candidate.id === item.dataset.stackId);
            if (!stack) return;
            await appendTool(
                popover,
                stack,
                tool,
                authManager,
                attribution,
            );
        });
        const newStackButton = popover.querySelector('[data-new-stack]');
        newStackButton.addEventListener('click', async () => {
            newStackButton.disabled = true;
            try {
                const created = await requestJson('/api/stacks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'My AI stack' }),
                });
                await appendTool(popover, created.stack, tool, authManager, attribution);
            } catch (error) {
                renderResult(popover, error.message || 'Could not create a stack.', '', true);
                newStackButton.disabled = false;
            }
        });
    } catch (error) {
        if (error.status === 401) {
            await authManager.signOut();
            closePopover();
            attribution.open('stack_add');
        } else {
            list.innerHTML = `<p class="stack-popover-message is-error">${escapeHtml(error.message || 'Could not load your stacks.')}</p>`;
        }
    }
}

const initializedRoots = new WeakSet();

export function initializeAddToStack({
    authManager = auth,
    attribution = authAttribution,
    root = document,
} = {}) {
    if (initializedRoots.has(root)) return;
    initializedRoots.add(root);

    root.defaultView?.matchMedia?.('(max-width: 600px)')?.addEventListener('change', closePopover);
    root.addEventListener('click', event => {
        const button = event.target.closest?.('[data-add-to-stack]');
        if (button) {
            event.preventDefault();
            void openPopover(button, { authManager, attribution, root });
            return;
        }
        if (activePopover?.popover.contains(event.target)) {
            if (event.target.closest?.('[data-close-popover]')) closePopover();
            return;
        }
        closePopover();
    });

    root.addEventListener('keydown', event => {
        if (event.key === 'Escape') closePopover();
    });
}

document.addEventListener('DOMContentLoaded', () => initializeAddToStack());
