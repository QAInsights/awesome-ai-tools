import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';

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

export async function initializeStacksPage({ authManager = auth, root = document } = {}) {
    const loading = root.getElementById('stacksLoading');
    const signedOut = root.getElementById('stacksSignedOut');
    const error = root.getElementById('stacksError');
    const content = root.getElementById('stacksContent');
    const empty = root.getElementById('stacksEmpty');
    const list = root.getElementById('stacksList');
    const count = root.getElementById('stackCount');
    const form = root.getElementById('newStackForm');
    const title = root.getElementById('newStackTitle');
    const description = root.getElementById('newStackDescription');
    const submit = root.getElementById('createStackButton');
    const status = root.getElementById('newStackStatus');
    let stacks = [];

    function hideStates() {
        [loading, signedOut, error, content].forEach(element => element?.classList.add('hidden'));
    }

    function renderStacks() {
        list.replaceChildren();
        stacks.forEach(stack => {
            const card = root.createElement('article');
            const publicBadge = stack.isPublic
                ? '<span class="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] text-emerald-200">Public</span>'
                : '<span class="rounded-full border border-[#333] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#a3a3a3]">Private</span>';
            const updated = stack.updatedAt
                ? new Date(stack.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                : '—';
            card.className = 'border border-[#222] bg-white/[0.02] rounded-xl p-5 transition-colors hover:border-[#333]';
            card.innerHTML = `
                <div class="flex items-start justify-between gap-4 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h2 class="text-lg font-semibold">${escapeHtml(stack.title)}</h2>
                            ${publicBadge}
                        </div>
                        <p class="text-[12px] text-[#737373] mt-1 font-mono">/${escapeHtml(stack.slug)}</p>
                    </div>
                    <span class="text-[12px] text-[#737373]">${stack.itemCount} ${stack.itemCount === 1 ? 'tool' : 'tools'}</span>
                </div>
                ${stack.description ? `<p class="text-[13px] text-[#a3a3a3] mt-3">${escapeHtml(stack.description)}</p>` : ''}
                <div class="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-[#222]">
                    <span class="text-[12px] text-[#737373]">Updated ${escapeHtml(updated)}</span>
                    <div class="flex items-center gap-2">
                        ${stack.isPublic && stack.publicUrl ? `<button type="button" data-copy-url="${escapeHtml(stack.publicUrl)}" class="py-1.5 px-3 border border-[#333] rounded-md text-[12px] text-[#a3a3a3] hover:text-white hover:border-[#555]">Copy public link</button>` : ''}
                        <a href="/stacks/edit?id=${encodeURIComponent(stack.id)}" class="py-1.5 px-3 bg-white text-black rounded-md text-[12px] font-semibold hover:bg-gray-200">Edit</a>
                    </div>
                </div>
                <p data-copy-status role="status" class="text-[11px] text-[#a3a3a3] mt-2"></p>`;
            list.append(card);
        });

        const hasStacks = stacks.length > 0;
        empty.classList.toggle('hidden', hasStacks);
        list.classList.toggle('hidden', !hasStacks);
        count.textContent = `${stacks.length} ${stacks.length === 1 ? 'stack' : 'stacks'}`;
        count.classList.toggle('hidden', !hasStacks);
    }

    async function load() {
        hideStates();
        if (!authManager.isAuthenticated()) {
            signedOut?.classList.remove('hidden');
            return;
        }
        loading?.classList.remove('hidden');
        try {
            const result = await requestJson('/api/stacks');
            stacks = result.stacks || [];
            hideStates();
            content?.classList.remove('hidden');
            renderStacks();
        } catch (loadError) {
            hideStates();
            if (loadError.status === 401) signedOut?.classList.remove('hidden');
            else error?.classList.remove('hidden');
        }
    }

    form?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!authManager.isAuthenticated() || submit.disabled) return;
        submit.disabled = true;
        status.textContent = '';
        try {
            const result = await requestJson('/api/stacks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.value, description: description.value }),
            });
            window.location.href = `/stacks/edit?id=${encodeURIComponent(result.stack.id)}`;
        } catch (createError) {
            status.textContent = createError.message || 'Could not create stack.';
            status.classList.add('text-red-200');
        } finally {
            submit.disabled = false;
        }
    });

    list?.addEventListener('click', async event => {
        const button = event.target.closest?.('[data-copy-url]');
        if (!button) return;
        const message = button.closest('article')?.querySelector('[data-copy-status]');
        try {
            await navigator.clipboard.writeText(new URL(button.dataset.copyUrl, location.origin).href);
            message.textContent = 'Public link copied.';
        } catch {
            message.textContent = 'Could not copy link. Open the stack and copy its URL.';
        }
    });

    try {
        const session = await bindAuthSession({ authManager, root });
        session.subscribe(() => { void load(); }, { emitCurrent: false });
        await load();
    } catch {
        hideStates();
        error?.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => initializeStacksPage());
