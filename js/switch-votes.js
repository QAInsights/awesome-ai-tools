import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { takeTurnstileToken, prefetchTurnstileToken } from './turnstile.js';

export function optimisticSwitch(data, target) {
    const counts = new Map(data.counts.map(row => [row.tool, row.votes]));
    if (data.mine) counts.set(data.mine, Math.max(0, (counts.get(data.mine) ?? 0) - 1));
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
    const rows = [...counts].filter(([, votes]) => votes > 0).map(([tool, votes]) => ({ tool, votes }))
        .sort((a, b) => b.votes - a.votes || a.tool.localeCompare(b.tool));
    return { total: rows.reduce((sum, row) => sum + row.votes, 0), counts: rows, mine: target };
}

export function createSwitchVotes({ tool, request = globalThis.fetch, getToken = takeTurnstileToken, prefetchToken = prefetchTurnstileToken, track = analytics.track, sourcePath = globalThis.location?.pathname ?? '', onChange = () => {}, authManager = auth, now = () => performance.now() }) {
    const state = { data: { total: 0, counts: [], mine: null }, busy: false, saving: false, loaded: false, error: '' };
    let identityVersion = 0;
    let votingVersion = null;
    let rollbackData = null;
    async function fetchData(options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await request(`/api/v1/switches?tool=${encodeURIComponent(tool)}`, { cache: 'no-store', ...options, signal: controller.signal });
            if (!response.ok) {
                let body;
                if (response.status === 403) { try { body = await response.json(); } catch {} }
                throw new Error(response.status === 429 ? 'Too many votes. Please wait a minute and retry.' : response.status === 403 && body?.error === 'turnstile_failed' ? 'Security check failed. Please retry.' : 'Community picks are unavailable. Please retry.');
            }
            const data = await response.json();
            if (!Number.isFinite(data.total) || !Array.isArray(data.counts) || !(data.mine === null || typeof data.mine === 'string')) throw new Error('Invalid community picks response. Please retry.');
            return data;
        } finally { clearTimeout(timeout); }
    }
    async function load(identityChanged = false) {
        if (state.busy && !identityChanged) return;
        const version = ++identityVersion;
        if (identityChanged) {
            state.loaded = false;
            state.data = { ...(rollbackData ?? state.data), mine: null };
            state.saving = false;
        }
        state.busy = true;
        state.error = identityChanged && votingVersion !== null ? 'Your sign-in state changed while voting. Please choose your pick again.' : '';
        onChange(state);
        try {
            const data = await fetchData();
            if (version !== identityVersion) return;
            state.data = data; state.loaded = true;
        }
        catch (error) { if (version === identityVersion) state.error = error.message || 'Could not load community picks. Please retry.'; }
        finally { if (version === identityVersion) { state.busy = false; onChange(state); } }
    }
    async function vote(pick) {
        if (state.busy || !state.loaded) return false;
        const previous = state.data.mine;
        const previousData = state.data;
        const target = previous === pick ? null : pick;
        const version = identityVersion;
        votingVersion = version;
        rollbackData = previousData;
        state.data = optimisticSwitch(previousData, target);
        state.busy = true; state.saving = true; state.error = ''; onChange(state);
        try {
            const tokenStart = now();
            const result = await getToken();
            const token_ms = Math.max(0, now() - tokenStart);
            const { token, prefetched = false } = typeof result === 'string' ? { token: result } : result;
            if (version !== identityVersion) return false;
            const requestStart = now();
            const data = await fetchData({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, target, token }) });
            const request_ms = Math.max(0, now() - requestStart);
            if (version !== identityVersion) return false;
            state.data = data;
            try { track(EVENTS.SWITCH_VOTE, { trigger: 'alternatives', subject: tool, target: target ?? previous, action: target === null ? 'undo' : previous ? 'change' : 'set', source_path: sourcePath, token_ms, request_ms, token_prefetched: prefetched }); } catch {}
            return true;
        } catch (error) {
            if (version === identityVersion) { state.data = previousData; state.error = error.message || 'Could not save your pick. Please retry.'; }
            return false;
        }
        finally {
            if (votingVersion === version) { votingVersion = null; rollbackData = null; }
            if (version === identityVersion) { state.busy = false; state.saving = false; onChange(state); }
        }
    }
    authManager.onAuthChange(({ event }) => {
        if (['signin', 'signout'].includes(event)) return load(true);
    });
    return { state, load, vote, prefetch: () => Promise.resolve().then(prefetchToken).catch(() => {}) };
}

export function initializeSwitchVotes(root = document, options = {}) {
    const widget = root.querySelector('[data-switch-votes]');
    if (!widget || widget.dataset.initialized) return;
    widget.dataset.initialized = 'true';
    const buttons = [...root.querySelectorAll('[data-switch-target]')];
    const names = new Map(buttons.map(button => [button.dataset.switchTarget, button.dataset.switchName]));
    const list = widget.querySelector('[data-switch-results]');
    const total = widget.querySelector('[data-switch-total]');
    const status = widget.querySelector('[data-switch-status]');
    const retry = widget.querySelector('[data-switch-retry]');
    const share = widget.querySelector('[data-switch-share]');
    const undo = widget.querySelector('[data-switch-undo]');
    const other = widget.querySelector('[data-switch-other]');
    const otherVote = widget.querySelector('[data-switch-other-vote]');
    const documentRef = widget.ownerDocument;
    const controller = createSwitchVotes({ ...options, tool: widget.dataset.switchVotes, onChange(state) {
        widget.setAttribute('aria-busy', String(state.busy));
        total.textContent = state.loaded ? `${state.data.total.toLocaleString()} ${state.data.total === 1 ? 'vote' : 'votes'}` : 'Loading community picks…';
        status.textContent = state.error || (state.saving ? 'Saving…' : state.busy ? 'Loading…' : state.loaded && !state.data.total ? 'Be the first to vote. Pick the tool you switched to.' : state.data.mine ? `Your pick: ${names.get(state.data.mine) ?? state.data.mine}.` : 'Pick the tool you switched to.');
        retry.hidden = !state.error;
        share.hidden = !state.data.mine;
        if (undo) { undo.hidden = !state.data.mine; undo.disabled = state.busy || !state.loaded; }
        if (other) {
            other.disabled = state.busy || !state.loaded;
            other.value = [...other.options].some(option => option.value === state.data.mine) ? state.data.mine : '';
            other.classList.toggle('switch-selected', Boolean(other.value));
        }
        if (otherVote) otherVote.disabled = state.busy || !state.loaded || !other?.value;
        for (const button of buttons) {
            const selected = button.dataset.switchTarget === state.data.mine;
            button.disabled = state.busy || !state.loaded;
            button.setAttribute('aria-pressed', String(selected));
            button.textContent = selected ? 'Undo my pick' : button.dataset.switchLabel ?? `I switched to ${button.dataset.switchName}`;
            button.closest('.fo-rank')?.classList.toggle('switch-selected', selected);
        }
        list.replaceChildren();
        for (const row of state.data.counts.filter(row => names.has(row.tool)).slice(0, 5)) {
            const item = documentRef.createElement('li');
            item.className = 'rounded-xl border border-border bg-white/[0.02] p-4';
            const label = documentRef.createElement('p');
            const percentage = state.data.total ? Math.round(row.votes / state.data.total * 100) : 0;
            label.textContent = `${names.get(row.tool)} · ${row.votes} ${row.votes === 1 ? 'vote' : 'votes'} · ${percentage}%`;
            const track = documentRef.createElement('div');
            track.className = 'h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden';
            track.setAttribute('aria-hidden', 'true');
            const bar = documentRef.createElement('div');
            bar.className = 'h-full bg-gold rounded-full';
            bar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
            track.append(bar); item.append(label, track); list.append(item);
        }
    } });
    retry.addEventListener('click', () => { void controller.load(); });
    for (const button of buttons) button.addEventListener('click', () => controller.vote(button.dataset.switchTarget));
    undo?.addEventListener('click', () => controller.vote(null));
    other?.addEventListener('change', () => {
        if (otherVote) otherVote.disabled = controller.state.busy || !controller.state.loaded || !other.value;
        other.classList.toggle('switch-selected', other.value === controller.state.data.mine);
    });
    otherVote?.addEventListener('click', () => {
        if (other?.value && other.value !== controller.state.data.mine) return controller.vote(other.value);
    });
    for (const control of [...buttons, undo, other, otherVote].filter(Boolean)) {
        for (const event of ['pointerenter', 'focus']) control.addEventListener(event, () => { if (!controller.state.busy) void controller.prefetch(); });
    }
    const Observer = options.IntersectionObserver ?? globalThis.IntersectionObserver;
    if (Observer) {
        const observer = new Observer(entries => {
            if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void controller.prefetch(); }
        }, { rootMargin: '200px' });
        observer.observe(widget);
    }
    controller.ready = controller.load();
    return controller;
}

if (typeof document !== 'undefined') initializeSwitchVotes();
