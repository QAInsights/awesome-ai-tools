/**
 * DOM controller for /tools/stack-matcher.
 *
 * Keeps all rendering, quiz wiring, and the save-to-stack flow out of the
 * pure engine (`js/stack-matcher.js`) so both stay single-responsibility.
 */

import {
  PERSONA_PRESETS,
  QUIZ_DIMENSIONS,
  buildMatcherUrlSearch,
  formatRecommendedStackMarkdown,
  normalizeAnswers,
  parseMatcherUrlState,
  recommendStack,
} from './stack-matcher.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

const PENDING_STACK_KEY = 'dosa_pending_matcher_stack';
const PENDING_TTL_MS = 15 * 60 * 1000;

const esc = str =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let data = {};
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    const message =
      response.status === 429
        ? 'Too many changes. Wait a minute and try again.'
        : data.error || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function optionLabel(dimId, optionId) {
  return QUIZ_DIMENSIONS.find(d => d.id === dimId)?.options.find(o => o.id === optionId)?.label ?? optionId;
}

function sameAnswers(a, b) {
  return QUIZ_DIMENSIONS.every(dim => a[dim.id] === b[dim.id]);
}

export function initStackMatcherUI({ catalog = {}, switchPairs = [] } = {}) {
  const byId = id => document.getElementById(id);
  const els = {
    title: byId('smTitle'),
    summary: byId('smSummary'),
    estimate: byId('smEstimate'),
    chips: byId('smAnswerChips'),
    slots: byId('smSlots'),
    switchLinks: byId('smSwitchLinks'),
    costLink: byId('smCostLink'),
    rulesLink: byId('smRulesLink'),
    saveBtn: byId('smSaveBtn'),
    copyBtn: byId('smCopyBtn'),
    shareBtn: byId('smShareBtn'),
    status: byId('smStatus'),
    radios: document.querySelectorAll('fieldset.sm-panel input[type="radio"]'),
    personaBtns: document.querySelectorAll('[data-persona]'),
  };
  if (!els.slots) return;

  const parsed = parseMatcherUrlState(window.location.search);
  let answers = parsed.answers;
  let overrides = parsed.overrides;
  let lastRec = null;
  let statusTimer = null;
  let createdStackId = null;
  let saving = false;

  function setStatus(message, { sticky = false } = {}) {
    if (!els.status) return;
    els.status.textContent = message;
    if (statusTimer) clearTimeout(statusTimer);
    if (message && !sticky) {
      statusTimer = setTimeout(() => {
        els.status.textContent = '';
      }, 3000);
    }
  }

  function syncControls() {
    els.radios.forEach(radio => {
      if (Object.hasOwn(answers, radio.name)) {
        radio.checked = radio.value === answers[radio.name];
      }
    });
    els.personaBtns.forEach(btn => {
      const preset = PERSONA_PRESETS.find(p => p.id === btn.getAttribute('data-persona'));
      btn.classList.toggle('active', Boolean(preset && sameAnswers(answers, preset.answers)));
    });
  }

  function chipSeatLabel(seatLabel) {
    if (seatLabel.startsWith('$0 seat')) return '$0 + API';
    const idx = seatLabel.indexOf(' · ');
    return idx > 0 ? seatLabel.slice(0, idx) : seatLabel;
  }

  function slotCardHtml(slot) {
    const sel = slot.selected;
    const meta = [sel.company, sel.categoryShort].filter(Boolean).join(' · ');
    const alts = slot.alternatives
      .map(
        a =>
          `<button type="button" class="sm-swap-chip" data-swap-slot="${esc(slot.slotId)}" data-swap-slug="${esc(a.slug)}"><span>${esc(a.name)}</span><span class="sm-swap-price">${esc(chipSeatLabel(a.seatLabel))}</span></button>`,
      )
      .join('');
    const reset = sel.overridden
      ? `<button type="button" class="sm-swap-chip sm-swap-reset" data-reset-slot="${esc(slot.slotId)}">Reset</button>`
      : '';
    return `<article class="sm-slot">
      <div class="sm-slot-head">
        <span class="sm-slot-step">${esc(slot.step)}</span>
        <div class="min-w-0">
          <div class="sm-slot-label">${esc(slot.slotLabel)}</div>
          <div class="sm-slot-blurb">${esc(slot.blurb)}</div>
        </div>
      </div>
      <div class="sm-slot-tool">
        <a href="${esc(sel.url)}" class="sm-slot-name">${esc(sel.name)}</a>
        ${meta ? `<span class="sm-pill">${esc(meta)}</span>` : ''}
        <span class="sm-pill sm-pill-seat">${esc(sel.seatLabel)}</span>
      </div>
      <p class="sm-why">${esc(sel.whyItFits)}</p>
      ${sel.relaxed ? `<div class="sm-relaxed">Loosened the ${esc(sel.relaxed)} filter — no exact match in the catalog</div>` : ''}
      <div class="sm-swaps">
        <span class="sm-swaps-label">Also fits:</span>
        ${alts}
        ${reset}
      </div>
    </article>`;
  }

  function render(rec) {
    if (els.title) els.title.textContent = rec.title;
    if (els.summary) els.summary.textContent = rec.summary;
    if (els.estimate) els.estimate.textContent = rec.estimatedMonthlyText;
    if (els.chips) {
      els.chips.innerHTML = QUIZ_DIMENSIONS.map(
        dim => `<span class="sm-chip">${esc(optionLabel(dim.id, rec.answers[dim.id]))}</span>`,
      ).join('');
    }
    els.slots.innerHTML = rec.slots.map(slotCardHtml).join('');
    if (els.costLink) els.costLink.href = rec.costCalculatorUrl;
    if (els.rulesLink) els.rulesLink.href = rec.rulesConverterUrl;
    if (els.switchLinks) {
      if (rec.switchLinks.length === 0) {
        els.switchLinks.style.display = 'none';
        els.switchLinks.innerHTML = '';
      } else {
        els.switchLinks.style.display = '';
        els.switchLinks.innerHTML = `<div class="sm-label mb-2">Migration guides</div>
          <div class="flex flex-col gap-1.5">${rec.switchLinks
            .map(
              l =>
                `<a href="${esc(l.href)}" class="sm-switch-link">${esc(l.fromName)} → ${esc(l.toName)}</a>`,
            )
            .join('')}</div>`;
      }
    }
  }

  function recompute() {
    syncControls();
    lastRec = recommendStack(answers, { catalog, switchPairs }, overrides);
    render(lastRec);
    const search = buildMatcherUrlSearch({ answers, overrides });
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }

  function cancelPendingSave() {
    clearPending();
    createdStackId = null;
  }

  els.radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      answers = normalizeAnswers({ ...answers, [radio.name]: radio.value });
      overrides = {};
      cancelPendingSave();
      recompute();
    });
  });

  els.personaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PERSONA_PRESETS.find(p => p.id === btn.getAttribute('data-persona'));
      if (!preset) return;
      answers = normalizeAnswers(preset.answers);
      overrides = {};
      cancelPendingSave();
      recompute();
    });
  });

  els.slots.addEventListener('click', event => {
    const swap = event.target.closest?.('[data-swap-slot][data-swap-slug]');
    if (swap) {
      overrides = { ...overrides, [swap.getAttribute('data-swap-slot')]: swap.getAttribute('data-swap-slug') };
      cancelPendingSave();
      recompute();
      return;
    }
    const reset = event.target.closest?.('[data-reset-slot]');
    if (reset) {
      const next = { ...overrides };
      delete next[reset.getAttribute('data-reset-slot')];
      overrides = next;
      cancelPendingSave();
      recompute();
    }
  });

  function readPending() {
    try {
      const raw = sessionStorage.getItem(PENDING_STACK_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || typeof p.savedAt !== 'number' || Date.now() - p.savedAt > PENDING_TTL_MS) {
        sessionStorage.removeItem(PENDING_STACK_KEY);
        return null;
      }
      return p;
    } catch {
      try { sessionStorage.removeItem(PENDING_STACK_KEY); } catch {}
      return null;
    }
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_STACK_KEY); } catch {}
  }

  function stashPending() {
    try {
      sessionStorage.setItem(
        PENDING_STACK_KEY,
        JSON.stringify({ answers, overrides, stackId: createdStackId, savedAt: Date.now() }),
      );
    } catch {}
  }

  function promptSignIn() {
    stashPending();
    setStatus("Sign in to save this stack — we'll finish saving when you're back.", { sticky: true });
    authAttribution.open('stack_add');
  }

  async function runSave() {
    if (!lastRec || !els.saveBtn || saving) return;
    saving = true;
    try {
      await auth.initialize();
      if (!auth.isAuthenticated()) {
        promptSignIn();
        return;
      }
      els.saveBtn.disabled = true;
      setStatus('Saving…');
      if (createdStackId === null) {
        try {
          const created = await requestJson('/api/stacks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: lastRec.stackPayload.title, description: lastRec.stackPayload.description }),
          });
          createdStackId = created.stack.id;
        } catch (error) {
          if (error.status === 409 && error.message === 'stack_limit') {
            setStatus("You've reached the 20-stack limit. Delete one in My Stacks first.", { sticky: true });
          } else if (error.status === 401) {
            await auth.signOut();
            promptSignIn();
          } else {
            setStatus(error.message || 'Could not save this stack.');
          }
          return;
        }
      }
      try {
        await requestJson(`/api/stacks/${encodeURIComponent(createdStackId)}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: lastRec.stackPayload.items }),
        });
      } catch (error) {
        setStatus(`Stack created, but adding the tools failed (${error.message}). Click Save again to retry.`, {
          sticky: true,
        });
        return;
      }
      clearPending();
      const stackId = createdStackId;
      createdStackId = null;
      window.location.href = `/stacks/edit?id=${encodeURIComponent(stackId)}`;
    } finally {
      saving = false;
      els.saveBtn.disabled = false;
    }
  }

  els.saveBtn?.addEventListener('click', () => {
    void runSave();
  });

  els.copyBtn?.addEventListener('click', async () => {
    if (!lastRec) return;
    try {
      await navigator.clipboard.writeText(formatRecommendedStackMarkdown(lastRec, window.location.origin));
      setStatus('Markdown copied to clipboard.');
    } catch {
      setStatus('Copy failed — select the summary text instead.');
    }
  });

  els.shareBtn?.addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}${buildMatcherUrlSearch({ answers, overrides })}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Share link copied to clipboard.');
    } catch {
      setStatus('Copy failed — copy the address bar instead.');
    }
  });

  auth.onAuthChange(({ event }) => {
    if (event === 'signin' && readPending()) void runSave();
  });

  // Initial render, then pick up a stack queued before a sign-in redirect.
  const pending = readPending();
  if (pending) {
    answers = normalizeAnswers(pending.answers);
    overrides = pending.overrides && typeof pending.overrides === 'object' ? pending.overrides : {};
    createdStackId = pending.stackId ?? null;
  }

  syncControls();
  recompute();

  if (pending) {
    void (async () => {
      await auth.initialize();
      if (auth.isAuthenticated()) {
        void runSave();
      } else {
        setStatus('Sign in to finish saving your stack.', { sticky: true });
      }
    })();
  }
}
