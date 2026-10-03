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
        const error = new Error(data.error || 'Request failed');
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
    popover.querySelector('[data-stack-result]').innerHTML = `
        <p class="${isError ? 'text-red-200' : 'text-emerald-200'} text-[12px]">${escapeHtml(message)}</p>
        ${editorUrl ? `<a href="${escapeHtml(editorUrl)}" class="inline-block mt-2 text-[12px] text-[#c9aa6e] hover:text-white">Edit this stack →</a>` : ''}`;
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
            attribution.open('favorite_heart');
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
        attribution.open('favorite_heart');
        return;
    }

    const wrapper = button.closest('[data-stack-control]') || button.parentElement;
    const popover = root.createElement('div');
    popover.className = 'absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[#303030] bg-[#111] p-4 shadow-2xl';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Add this tool to a stack');
    popover.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-3">
            <h2 class="text-sm font-semibold text-white">Add to a stack</h2>
            <button type="button" data-close-popover aria-label="Close" class="text-[#737373] hover:text-white">×</button>
        </div>
        <div data-stack-list class="max-h-56 overflow-y-auto -mx-1"></div>
        <button type="button" data-new-stack class="w-full mt-3 py-2.5 border border-[#3a3225] rounded-lg text-[12px] font-semibold text-[#e2c48a] hover:bg-[#211c16]">＋ New stack</button>
        <div data-stack-result role="status" class="mt-3"></div>`;
    wrapper.classList.add('relative');
    wrapper.append(popover);
    button.setAttribute('aria-expanded', 'true');
    activePopover = { button, popover };
    const tool = {
        slug: button.dataset.toolSlug,
        category: button.dataset.toolCategory || 'AI tools',
    };
    const list = popover.querySelector('[data-stack-list]');
    list.innerHTML = '<p class="px-2 py-3 text-[12px] text-[#737373]">Loading your stacks…</p>';

    try {
        const result = await requestJson('/api/stacks');
        const stacks = result.stacks || [];
        list.innerHTML = stacks.length ? stacks.map(stack => `
            <button type="button" data-stack-id="${escapeHtml(stack.id)}" class="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]">
                <span class="min-w-0"><b class="block truncate text-[12px] text-white">${escapeHtml(stack.title)}</b><small class="block mt-0.5 text-[10px] text-[#737373]">${stack.itemCount} ${stack.itemCount === 1 ? 'tool' : 'tools'} · ${stack.isPublic ? 'Public' : 'Private'}</small></span>
                <span class="text-[#737373]">→</span>
            </button>`).join('') : '<p class="px-2 py-2 text-[12px] text-[#737373]">Create your first stack to get started.</p>';

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
            attribution.open('favorite_heart');
        } else {
            list.innerHTML = `<p class="px-2 py-3 text-[12px] text-red-200">${escapeHtml(error.message || 'Could not load your stacks.')}</p>`;
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
