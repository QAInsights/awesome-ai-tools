import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { auth } from './auth.js';
import { turnstileToken } from './turnstile.js';

export function createSwitchVotes({ tool, request = globalThis.fetch, getToken = turnstileToken, track = analytics.track, sourcePath = globalThis.location?.pathname ?? '', onChange = () => {}, authManager = auth }) {
    const state = { data: { total: 0, counts: [], mine: null }, busy: false, loaded: false, error: '' };
    let identityVersion = 0;
    async function fetchData(options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await request(`/api/v1/switches?tool=${encodeURIComponent(tool)}`, { cache: 'no-store', ...options, signal: controller.signal });
            if (!response.ok) throw new Error(response.status === 429 ? 'Too many votes. Please wait a minute and retry.' : 'Community picks are unavailable. Please retry.');
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
            state.data = { ...state.data, mine: null };
        }
        state.busy = true; state.error = ''; onChange(state);
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
        const target = previous === pick ? null : pick;
        const version = identityVersion;
        state.busy = true; state.error = ''; onChange(state);
        try {
            const token = await getToken();
            if (version !== identityVersion) return false;
            const data = await fetchData({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, target, token }) });
            if (version !== identityVersion) return false;
            state.data = data;
            try { track(EVENTS.SWITCH_VOTE, { trigger: 'alternatives', subject: tool, target: target ?? previous, action: target === null ? 'undo' : previous ? 'change' : 'set', source_path: sourcePath }); } catch {}
            return true;
        } catch (error) { if (version === identityVersion) state.error = error.message || 'Could not save your pick. Please retry.'; return false; }
        finally { if (version === identityVersion) { state.busy = false; onChange(state); } }
    }
    authManager.onAuthChange(({ event }) => {
        if (['signin', 'signout', 'session_restored'].includes(event)) return load(true);
    });
    return { state, load, vote };
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
    const documentRef = widget.ownerDocument;
    const controller = createSwitchVotes({ ...options, tool: widget.dataset.switchVotes, onChange(state) {
        widget.setAttribute('aria-busy', String(state.busy));
        total.textContent = state.loaded ? `${state.data.total.toLocaleString()} ${state.data.total === 1 ? 'vote' : 'votes'}` : 'Loading community picks…';
        status.textContent = state.error || (state.busy ? 'Loading…' : state.loaded && !state.data.total ? 'Be the first to vote. Choose an alternative below.' : state.data.mine ? `Your pick: ${names.get(state.data.mine) ?? state.data.mine}. Choose another tool to change it, or undo your pick.` : 'Choose an alternative below to add your pick.');
        retry.hidden = !state.error;
        share.hidden = !state.data.mine;
        for (const button of buttons) {
            const selected = button.dataset.switchTarget === state.data.mine;
            button.disabled = state.busy || !state.loaded;
            button.setAttribute('aria-pressed', String(selected));
            button.textContent = selected ? 'Undo my pick' : 'I switched to this';
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
    for (const button of buttons) button.addEventListener('click', () => { void controller.vote(button.dataset.switchTarget); });
    controller.ready = controller.load();
    return controller;
}

if (typeof document !== 'undefined') initializeSwitchVotes();
