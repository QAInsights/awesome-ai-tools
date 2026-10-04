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
        const message = response.status === 429
            ? 'Too many changes. Wait a minute and try again.'
            : data.error || 'Request failed';
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

function readCatalog(root) {
    try {
        const data = JSON.parse(root.getElementById('stack-tools-data')?.textContent || '[]');
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

export async function initializeStackEditor({ authManager = auth, root = document } = {}) {
    const loading = root.getElementById('editorLoading');
    const signedOut = root.getElementById('editorSignedOut');
    const missing = root.getElementById('editorMissing');
    const error = root.getElementById('editorError');
    const editor = root.getElementById('stackEditor');
    const titleInput = root.getElementById('stackTitle');
    const slugInput = root.getElementById('stackSlug');
    const descriptionInput = root.getElementById('stackDescription');
    const urlPreview = root.getElementById('publicUrlPreview');
    const sharingToggle = root.getElementById('sharingToggle');
    const sharingStatus = root.getElementById('sharingStatus');
    const copyButton = root.getElementById('copyStackLink');
    const usernamePicker = root.getElementById('usernamePicker');
    const usernameInput = root.getElementById('usernameInput');
    const usernamePickerStatus = root.getElementById('usernamePickerStatus');
    const enableSharingButton = root.getElementById('enableSharingButton');
    const cancelUsernameButton = root.getElementById('cancelUsernameButton');
    const searchInput = root.getElementById('toolSearch');
    const searchResults = root.getElementById('toolSearchResults');
    const itemsContainer = root.getElementById('stackItems');
    const itemsEmpty = root.getElementById('stackItemsEmpty');
    const saveButton = root.getElementById('saveStackButton');
    const deleteButton = root.getElementById('deleteStackButton');
    const saveStatus = root.getElementById('stackSaveStatus');
    const catalog = readCatalog(root);
    const toolsBySlug = new Map(catalog.map(tool => [tool.slug, tool]));
    const id = new URLSearchParams(location.search).get('id');
    let stack = null;
    let items = [];
    let username = null;
    let suggestion = '';

    function hideStates() {
        [loading, signedOut, missing, error, editor].forEach(element => element?.classList.add('hidden'));
    }

    function setToggle(element, value) {
        element?.setAttribute('aria-checked', value ? 'true' : 'false');
        element?.classList.toggle('bg-[#c9aa6e]', value);
        element?.classList.toggle('bg-[#333]', !value);
        element?.querySelector('span')?.classList.toggle('translate-x-5', value);
        element?.querySelector('span')?.classList.toggle('translate-x-0', !value);
    }

    function publicUrl() {
        if (!username || !stack) return '';
        return `${location.origin}/u/${encodeURIComponent(username)}/${encodeURIComponent(stack.slug)}`;
    }

    function updatePreview() {
        const profile = username ? encodeURIComponent(username) : '<username>';
        const slug = encodeURIComponent(slugInput.value.trim() || '<stack-name>');
        urlPreview.textContent = `ai.dosa.dev/u/${profile}/${slug}`;
    }

    function renderSharingState() {
        setToggle(sharingToggle, stack.isPublic);
        sharingStatus.textContent = stack.isPublic ? 'Public — anyone can view this stack' : 'Private — only you can see this';
        copyButton.classList.toggle('hidden', !stack.isPublic || !username);
        copyButton.disabled = !stack.isPublic || !username;
        updatePreview();
    }

    function renderItems() {
        itemsContainer.replaceChildren();
        items.forEach((item, index) => {
            const tool = toolsBySlug.get(item.slug);
            const card = root.createElement('article');
            card.className = 'border border-[#292929] bg-black/20 rounded-lg p-4';
            const displayName = tool?.name ?? item.slug;
            card.innerHTML = `
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <a href="/tools/${encodeURIComponent(item.slug)}" class="font-semibold text-white hover:text-[#e2c48a]">${escapeHtml(displayName)}</a>
                        <p class="text-[11px] font-mono uppercase tracking-wide text-[#737373] mt-1">${escapeHtml(tool?.company ?? 'Catalog item')} · ${escapeHtml(tool?.category ?? '')}</p>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" data-action="up" data-index="${index}" aria-label="Move ${escapeHtml(displayName)} up" ${index === 0 ? 'disabled' : ''} class="px-2 py-1 rounded border border-[#333] text-[#a3a3a3] hover:text-white disabled:opacity-30">↑</button>
                        <button type="button" data-action="down" data-index="${index}" aria-label="Move ${escapeHtml(displayName)} down" ${index === items.length - 1 ? 'disabled' : ''} class="px-2 py-1 rounded border border-[#333] text-[#a3a3a3] hover:text-white disabled:opacity-30">↓</button>
                        <button type="button" data-action="remove" data-index="${index}" class="ml-1 px-2 py-1 rounded border border-red-400/20 text-red-200 hover:bg-red-400/10 text-[12px]">Remove</button>
                    </div>
                </div>
                <label class="block mt-4">
                    <span class="block text-[11px] text-[#a3a3a3] mb-1.5">Purpose</span>
                    <input data-field="purpose" data-index="${index}" maxlength="60" value="${escapeHtml(item.purpose)}" class="w-full rounded-lg border border-[#303030] bg-black/30 px-3 py-2 text-sm text-white focus:border-[#c9aa6e] focus:outline-none" />
                </label>
                <label class="block mt-3">
                    <span class="block text-[11px] text-[#a3a3a3] mb-1.5">How I use it</span>
                    <textarea data-field="usageNotes" data-index="${index}" maxlength="500" rows="2" class="w-full rounded-lg border border-[#303030] bg-black/30 px-3 py-2 text-sm text-white focus:border-[#c9aa6e] focus:outline-none">${escapeHtml(item.usageNotes ?? '')}</textarea>
                </label>
                <div class="flex items-center gap-3 mt-3">
                    <button type="button" data-action="enabled" data-index="${index}" role="switch" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="Show ${escapeHtml(displayName)} on public page" class="relative w-9 h-5 shrink-0 rounded-full ${item.enabled ? 'bg-[#c9aa6e]' : 'bg-[#333]'} transition-colors">
                        <span class="absolute ${item.enabled ? 'left-4' : 'left-1'} top-1 w-3 h-3 rounded-full bg-white transition-all"></span>
                    </button>
                    <span class="text-[12px] text-[#a3a3a3]">Show on public page</span>
                </div>`;
            itemsContainer.append(card);
        });
        itemsEmpty.classList.toggle('hidden', items.length > 0);
    }

    function renderSearchResults() {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            searchResults.classList.add('hidden');
            searchResults.replaceChildren();
            return;
        }
        const present = new Set(items.map(item => item.slug));
        const matches = catalog.filter(tool => !present.has(tool.slug)
            && `${tool.name} ${tool.company} ${tool.category} ${tool.slug}`.toLowerCase().includes(query)).slice(0, 12);
        if (!matches.length) {
            searchResults.innerHTML = '<p class="p-3 text-[12px] text-[#737373]">No matching catalog tools.</p>';
            searchResults.classList.remove('hidden');
            return;
        }
        searchResults.innerHTML = matches.map(tool => `
            <button type="button" data-add-slug="${escapeHtml(tool.slug)}" class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left border-b border-[#222] last:border-0 hover:bg-white/[0.04]">
                <span class="min-w-0"><b class="block text-[13px] text-white">${escapeHtml(tool.name)}</b><small class="block text-[11px] text-[#737373] mt-0.5">${escapeHtml(tool.company)} · ${escapeHtml(tool.category)}</small></span>
                <span class="text-[18px] text-[#c9aa6e]">+</span>
            </button>`).join('');
        searchResults.classList.remove('hidden');
    }

    function renderStack() {
        titleInput.value = stack.title;
        slugInput.value = stack.slug;
        descriptionInput.value = stack.description ?? '';
        items = (stack.items || []).map(item => ({ ...item }));
        renderSharingState();
        renderItems();
    }

    async function setPublicSharing(enabled) {
        if (enabled && !username) {
            usernameInput.value = suggestion;
            usernamePickerStatus.textContent = '';
            usernamePicker.classList.remove('hidden');
            setToggle(sharingToggle, false);
            usernameInput.focus();
            return;
        }
        sharingToggle.disabled = true;
        try {
            const result = await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPublic: enabled }),
            });
            stack = result.stack;
            username = result.username;
            renderSharingState();
        } catch (sharingError) {
            saveStatus.textContent = sharingError.message || 'Could not update sharing.';
            saveStatus.classList.add('text-red-200');
            setToggle(sharingToggle, stack.isPublic);
        } finally {
            sharingToggle.disabled = false;
        }
    }

    async function load() {
        hideStates();
        if (!authManager.isAuthenticated()) {
            signedOut?.classList.remove('hidden');
            return;
        }
        if (!id) {
            missing?.classList.remove('hidden');
            return;
        }
        loading?.classList.remove('hidden');
        try {
            const [stackResult, usernameResult] = await Promise.all([
                requestJson(`/api/stacks/${encodeURIComponent(id)}`),
                requestJson('/api/account/username'),
            ]);
            stack = stackResult.stack;
            username = usernameResult.username;
            suggestion = usernameResult.suggestion;
            hideStates();
            editor?.classList.remove('hidden');
            renderStack();
        } catch (loadError) {
            hideStates();
            if (loadError.status === 401) signedOut?.classList.remove('hidden');
            else if (loadError.status === 404) missing?.classList.remove('hidden');
            else error?.classList.remove('hidden');
        }
    }

    sharingToggle?.addEventListener('click', () => {
        if (!stack || sharingToggle.disabled) return;
        void setPublicSharing(sharingToggle.getAttribute('aria-checked') !== 'true');
    });
    cancelUsernameButton?.addEventListener('click', () => {
        usernamePicker.classList.add('hidden');
        setToggle(sharingToggle, stack?.isPublic);
    });
    enableSharingButton?.addEventListener('click', async () => {
        if (!stack || enableSharingButton.disabled) return;
        enableSharingButton.disabled = true;
        usernamePickerStatus.textContent = '';
        try {
            const profile = await requestJson('/api/account/username', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput.value }),
            });
            username = profile.username;
            const result = await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPublic: true }),
            });
            stack = result.stack;
            username = result.username;
            usernamePicker.classList.add('hidden');
            renderSharingState();
        } catch (pickerError) {
            usernamePickerStatus.textContent = pickerError.message || 'Could not enable sharing.';
            usernamePickerStatus.classList.add('text-red-200');
        } finally {
            enableSharingButton.disabled = false;
        }
    });

    titleInput?.addEventListener('input', updatePreview);
    slugInput?.addEventListener('input', updatePreview);
    searchInput?.addEventListener('input', renderSearchResults);
    searchResults?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-add-slug]');
        if (!button) return;
        const tool = toolsBySlug.get(button.dataset.addSlug);
        if (!tool || items.some(item => item.slug === tool.slug)) return;
        items.push({
            slug: tool.slug,
            purpose: tool.category,
            usageNotes: null,
            enabled: true,
            position: items.length,
        });
        searchInput.value = '';
        renderSearchResults();
        renderItems();
    });
    itemsContainer?.addEventListener('input', event => {
        const field = event.target.dataset.field;
        const item = items[Number(event.target.dataset.index)];
        if (!item) return;
        if (field === 'purpose') item.purpose = event.target.value;
        if (field === 'usageNotes') item.usageNotes = event.target.value || null;
    });
    itemsContainer?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-action]');
        if (!button) return;
        const index = Number(button.dataset.index);
        if (button.dataset.action === 'remove') items.splice(index, 1);
        if (button.dataset.action === 'up' && index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
        if (button.dataset.action === 'down' && index < items.length - 1) [items[index + 1], items[index]] = [items[index], items[index + 1]];
        if (button.dataset.action === 'enabled') items[index].enabled = !items[index].enabled;
        items.forEach((item, position) => { item.position = position; });
        renderItems();
    });

    copyButton?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(publicUrl());
            saveStatus.textContent = 'Public link copied.';
            saveStatus.classList.remove('text-red-200');
        } catch {
            saveStatus.textContent = 'Could not copy the public link.';
            saveStatus.classList.add('text-red-200');
        }
    });

    saveButton?.addEventListener('click', async () => {
        if (!stack || saveButton.disabled) return;
        saveButton.disabled = true;
        saveStatus.textContent = 'Saving…';
        saveStatus.classList.remove('text-red-200');
        try {
            await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            const result = await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: titleInput.value,
                    description: descriptionInput.value,
                    slug: slugInput.value,
                }),
            });
            stack = result.stack;
            username = result.username;
            renderStack();
            saveStatus.textContent = 'Changes saved.';
        } catch (saveError) {
            saveStatus.textContent = saveError.message || 'Could not save changes.';
            saveStatus.classList.add('text-red-200');
        } finally {
            saveButton.disabled = false;
        }
    });

    deleteButton?.addEventListener('click', async () => {
        if (!stack || !window.confirm(`Delete “${stack.title}”? This cannot be undone.`)) return;
        deleteButton.disabled = true;
        try {
            await requestJson(`/api/stacks/${encodeURIComponent(stack.id)}`, { method: 'DELETE' });
            window.location.href = '/stacks';
        } catch (deleteError) {
            saveStatus.textContent = deleteError.message || 'Could not delete stack.';
            saveStatus.classList.add('text-red-200');
            deleteButton.disabled = false;
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

document.addEventListener('DOMContentLoaded', () => initializeStackEditor());
