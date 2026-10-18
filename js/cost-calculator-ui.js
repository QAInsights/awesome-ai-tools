/**
 * DOM controller for /tools/cost-calculator.
 *
 * Kept in a dedicated module so pure calculation/caching logic (`js/cost-calculator.js`)
 * and interactive DOM rendering each stay single-responsibility and under 500 lines.
 */

import {
  MAX_TEAM_SIZE, WORKLOAD_PRESETS, buildCalculatorUrlSearch, calculateStackCost,
  formatStackSummaryText, formatUsd, loadModelsPricing, parseCalculatorStateFromUrl,
  sliderToTeamSize, teamSizeToSlider,
} from './cost-calculator.js';

const POPULAR_TOOL_SLUGS = [
  'cursor', 'github-copilot', 'claude-code', 'windsurf', 'devin',
  'zed', 'supermaven', 'jetbrains-ai-assistant', 'augment-code',
];

const esc = str =>
  String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function initCostCalculatorUI(catalog) {
  const paidCatalog = catalog.filter(t => Array.isArray(t.plans) && t.plans.length > 0);
  const state = parseCalculatorStateFromUrl(window.location.search);
  // Always start Negotiated / Commit Discount at 0% (List Price) by default on load
  state.discountPercent = 0;

  state.selectedSeats = state.selectedSeats.filter(s => paidCatalog.some(t => t.slug === s.slug));
  if (!state.seatsExplicit && state.selectedSeats.length === 0 && paidCatalog.length > 0) {
    const fallbackTool = paidCatalog.find(t => t.slug === 'cursor') ?? paidCatalog[0];
    state.selectedSeats = [{ slug: fallbackTool.slug, planName: fallbackTool.plans[0]?.name }];
  }

  let models = [];
  let activeProvider = 'All';
  let toolSearchQuery = '';
  let lastBreakdown = null;

  const byId = id => document.getElementById(id);
  const els = {
    teamSlider: byId('teamSizeSlider'), teamInput: byId('teamSizeInput'),
    teamDecBtn: byId('teamSizeDecBtn'), teamIncBtn: byId('teamSizeIncBtn'),
    teamPresets: document.querySelectorAll('[data-team-preset]'),
    discountSlider: byId('discountSlider'), discountVal: byId('discountVal'),
    discountSavingsBadge: byId('discountSavingsBadge'),
    cycleBtns: document.querySelectorAll('[data-cycle]'),
    presetChips: byId('popularToolChips'), toolSearch: byId('toolSearchInput'),
    toolDropdown: byId('toolSearchResults'), selectedSeatsList: byId('selectedSeatsList'),
    providerTabs: byId('providerTabs'), modelPickerGrid: byId('modelPickerGrid'),
    workloadBtns: document.querySelectorAll('[data-workload]'),
    inputSlider: byId('inputTokensSlider'), outputSlider: byId('outputTokensSlider'),
    cacheSlider: byId('cacheHitSlider'), inputVal: byId('inputTokensVal'),
    outputVal: byId('outputTokensVal'), cacheVal: byId('cacheHitVal'),
    cacheBadge: byId('modelsCacheBadge'), refreshModelsBtn: byId('refreshModelsBtn'),
    totalPrimary: byId('totalPrimaryValue'), totalPrimaryUnit: byId('totalPrimaryUnit'),
    totalSecondary: byId('totalSecondaryValue'), perDevValue: byId('perDevValue'),
    seatTotalValue: byId('seatTotalValue'), apiTotalValue: byId('apiTotalValue'),
    seatBarFill: byId('seatBarFill'), apiBarFill: byId('apiBarFill'),
    lineItemsList: byId('lineItemsList'), alternativesList: byId('alternativesList'),
    copyBtn: byId('copySummaryBtn'), shareBtn: byId('shareCalcBtn'),
  };

  function syncUrl() {
    const search = buildCalculatorUrlSearch({ ...state, discountPercent: 0 });
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }

  function renderPopularChips() {
    if (!els.presetChips) return;
    const selectedSet = new Set(state.selectedSeats.map(s => s.slug));
    const popular = POPULAR_TOOL_SLUGS.map(slug => paidCatalog.find(t => t.slug === slug)).filter(Boolean);
    els.presetChips.innerHTML = popular
      .map(tool => {
        const active = selectedSet.has(tool.slug);
        const entry = tool.plans[0];
        return `<button type="button" data-quick-slug="${esc(tool.slug)}" class="cc-chip ${active ? 'active' : ''}">
          <span>${esc(tool.name)}</span>
          <span class="cc-chip-price">${esc(entry.price)}${esc(entry.unit)}</span>
        </button>`;
      })
      .join('');

    els.presetChips.querySelectorAll('[data-quick-slug]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-quick-slug');
        const idx = state.selectedSeats.findIndex(s => s.slug === slug);
        if (idx >= 0) {
          state.selectedSeats.splice(idx, 1);
        } else {
          const tool = paidCatalog.find(t => t.slug === slug);
          if (tool) state.selectedSeats.push({ slug: tool.slug, planName: tool.plans[0]?.name });
        }
        recalc();
      });
    });
  }

  function renderToolSearchResults() {
    if (!els.toolDropdown) return;
    const q = toolSearchQuery.trim().toLowerCase();
    if (!q) {
      els.toolDropdown.style.display = 'none';
      return;
    }
    const selectedSet = new Set(state.selectedSeats.map(s => s.slug));
    const matches = paidCatalog
      .filter(
        t =>
          !selectedSet.has(t.slug) &&
          (t.name.toLowerCase().includes(q) ||
            t.company.toLowerCase().includes(q) ||
            t.categoryShort.toLowerCase().includes(q)),
      )
      .slice(0, 8);

    if (matches.length === 0) {
      els.toolDropdown.innerHTML = `<div class="px-3 py-2 text-xs text-[#737373] font-mono">No matching paid tools found</div>`;
      els.toolDropdown.style.display = 'block';
      return;
    }

    els.toolDropdown.innerHTML = matches
      .map(
        t => `<button type="button" data-add-slug="${esc(t.slug)}" class="cc-search-item">
          <div>
            <span class="font-medium text-[#f4f4f2]">${esc(t.name)}</span>
            <span class="text-[11px] text-[#737373] ml-1.5">${esc(t.categoryShort)}</span>
          </div>
          <span class="text-xs font-mono text-[#e2c48a]">from ${esc(t.plans[0].price)}${esc(t.plans[0].unit)}</span>
        </button>`,
      )
      .join('');
    els.toolDropdown.style.display = 'block';

    els.toolDropdown.querySelectorAll('[data-add-slug]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = paidCatalog.find(t => t.slug === btn.getAttribute('data-add-slug'));
        if (tool) {
          state.selectedSeats.push({ slug: tool.slug, planName: tool.plans[0]?.name });
          toolSearchQuery = '';
          if (els.toolSearch) els.toolSearch.value = '';
          els.toolDropdown.style.display = 'none';
          recalc();
        }
      });
    });
  }

  function renderSelectedSeats() {
    if (!els.selectedSeatsList) return;
    if (state.selectedSeats.length === 0) {
      els.selectedSeatsList.innerHTML = `<div class="text-xs font-mono text-[#737373] py-3 text-center border border-dashed border-[#222] rounded-lg">No paid seat subscriptions selected (pure BYOK / open-source stack)</div>`;
      return;
    }

    els.selectedSeatsList.innerHTML = state.selectedSeats
      .map((sel, index) => {
        const tool = paidCatalog.find(t => t.slug === sel.slug);
        if (!tool) return '';
        const optionsHtml = tool.plans
          .map(
            p =>
              `<option value="${esc(p.name)}" ${p.name === sel.planName ? 'selected' : ''}>${esc(p.name)} — ${esc(p.price)}${esc(p.unit)}</option>`,
          )
          .join('');
        return `<div class="cc-selected-row">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <a href="/tools/${esc(tool.slug)}" class="text-sm font-medium text-[#f4f4f2] hover:text-[#e2c48a] transition-colors truncate">${esc(tool.name)}</a>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#151515] text-[#8b8b88] border border-[#262626]">${esc(tool.categoryShort)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <select data-seat-plan="${index}" aria-label="${esc(tool.name)} tier" class="cc-plan-select">${optionsHtml}</select>
            <button type="button" data-remove-seat="${index}" class="cc-remove-btn" title="Remove tool" aria-label="Remove ${esc(tool.name)}">&times;</button>
          </div>
        </div>`;
      })
      .join('');

    els.selectedSeatsList.querySelectorAll('[data-seat-plan]').forEach(selEl => {
      selEl.addEventListener('change', () => {
        const idx = Number(selEl.getAttribute('data-seat-plan'));
        if (state.selectedSeats[idx]) {
          state.selectedSeats[idx].planName = selEl.value;
          recalc();
        }
      });
    });

    els.selectedSeatsList.querySelectorAll('[data-remove-seat]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedSeats.splice(Number(btn.getAttribute('data-remove-seat')), 1);
        recalc();
      });
    });
  }

  function renderProviderTabs() {
    if (!els.providerTabs) return;
    const providers = ['All', ...new Set(models.map(m => m.provider))];
    els.providerTabs.innerHTML = providers
      .map(
        p =>
          `<button type="button" data-provider="${esc(p)}" class="cc-provider-tab ${p === activeProvider ? 'active' : ''}">${esc(p)}</button>`,
      )
      .join('');

    els.providerTabs.querySelectorAll('[data-provider]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeProvider = btn.getAttribute('data-provider');
        renderProviderTabs();
        renderModelPicker();
      });
    });
  }

  function renderModelPicker() {
    if (!els.modelPickerGrid) return;
    const selectedIds = new Set(state.selectedModels.map(m => m.id));
    const filtered = (activeProvider === 'All' ? models : models.filter(m => m.provider === activeProvider)).slice(0, 24);

    els.modelPickerGrid.innerHTML = filtered
      .map(m => {
        const isSelected = selectedIds.has(m.id) || selectedIds.has(m.canonicalId);
        return `<button type="button" data-model-id="${esc(m.id)}" class="cc-model-card ${isSelected ? 'active' : ''}">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-medium text-[#f4f4f2] truncate">${esc(m.name)}</span>
            <span class="text-[10px] font-mono text-[#8b8b88] shrink-0">${esc(m.provider)}</span>
          </div>
          <div class="flex items-center justify-between text-[11px] font-mono text-[#a3a3a3]">
            <span>In: $${m.cost.input}/1M</span>
            <span>Out: $${m.cost.output}/1M</span>
          </div>
        </button>`;
      })
      .join('');

    els.modelPickerGrid.querySelectorAll('[data-model-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-model-id');
        const idx = state.selectedModels.findIndex(m => m.id === id);
        if (idx >= 0) state.selectedModels.splice(idx, 1);
        else state.selectedModels.push({ id });
        recalc();
      });
    });
  }

  function renderDashboard(breakdown) {
    const isAnnual = state.billingCycle === 'annual';
    const primaryAmount = isAnnual ? breakdown.annualTotal : breakdown.monthlyTotal;
    const secondaryAmount = isAnnual ? breakdown.monthlyTotal : breakdown.annualTotal;

    if (els.totalPrimary) els.totalPrimary.textContent = formatUsd(primaryAmount);
    if (els.totalPrimaryUnit) els.totalPrimaryUnit.textContent = isAnnual ? '/ year' : '/ month';
    if (els.totalSecondary) {
      els.totalSecondary.textContent = isAnnual
        ? `${formatUsd(secondaryAmount)}/mo equivalent`
        : `${formatUsd(secondaryAmount)}/yr projected`;
    }
    if (els.discountSavingsBadge) {
      if (breakdown.discountPercent > 0 && breakdown.discountMonthlySavings > 0) {
        els.discountSavingsBadge.style.display = 'block';
        els.discountSavingsBadge.textContent = `List: ${formatUsd(breakdown.listMonthlyTotal)}/mo · Saving ${formatUsd(breakdown.discountMonthlySavings)}/mo (-${breakdown.discountPercent}% negotiated)`;
      } else {
        els.discountSavingsBadge.style.display = 'none';
      }
    }
    if (els.perDevValue) els.perDevValue.textContent = `${formatUsd(breakdown.perDevMonthly)}/mo`;
    if (els.seatTotalValue) els.seatTotalValue.textContent = `${formatUsd(breakdown.seatMonthlyTotal)}/mo`;
    if (els.apiTotalValue) els.apiTotalValue.textContent = `${formatUsd(breakdown.apiMonthlyTotal)}/mo`;

    const total = breakdown.monthlyTotal || 1;
    const seatPct = breakdown.monthlyTotal > 0 ? Math.round((breakdown.seatMonthlyTotal / total) * 100) : 50;
    if (els.seatBarFill) els.seatBarFill.style.width = `${seatPct}%`;
    if (els.apiBarFill) els.apiBarFill.style.width = `${100 - seatPct}%`;

    if (els.lineItemsList) {
      els.lineItemsList.innerHTML =
        breakdown.lineItems.length === 0
          ? `<div class="text-xs font-mono text-[#737373] py-4 text-center">Select at least one tool or API model to see itemized costs.</div>`
          : breakdown.lineItems
              .map(
                item => `<div class="cc-line-item">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full ${item.kind === 'seat' ? 'bg-[#d6b77a]' : 'bg-[#8b8b88]'}"></span>
                  <span class="text-sm font-medium text-[#f4f4f2] truncate">${esc(item.name)}</span>
                </div>
                <div class="text-[11px] font-mono text-[#737373] pl-4 truncate">${esc(item.subtitle)}</div>
              </div>
              <div class="text-right shrink-0 font-mono">
                <div class="text-sm font-semibold text-[#f4f4f2]">${formatUsd(item.teamMonthly)}<span class="text-[11px] text-[#737373] font-normal">/mo</span></div>
                <div class="text-[10px] text-[#737373]">${formatUsd(item.perDevMonthly)}/dev</div>
              </div>
            </div>`,
              )
              .join('');
    }

    if (els.alternativesList) {
      els.alternativesList.innerHTML =
        breakdown.alternatives.length === 0
          ? `<div class="text-xs font-mono text-[#e2c48a] py-3 px-3.5 rounded-lg bg-[#211c16] border border-[#4c4030]">✦ Your stack is already well-optimized for this workload.</div>`
          : breakdown.alternatives
              .map(
                (alt, idx) => `<div class="cc-alt-card">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-[#f4f4f2] mb-0.5">${esc(alt.title)}</div>
                  <p class="text-[11px] text-[#a3a3a3] leading-relaxed">${esc(alt.description)}</p>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs font-mono font-semibold text-[#e2c48a]">Save ${formatUsd(alt.monthlySavings)}/mo</div>
                  <div class="text-[10px] font-mono text-[#737373]">${formatUsd(alt.annualSavings)}/yr</div>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2.5 mt-2.5">
                ${alt.href ? `<a href="${esc(alt.href)}" class="text-[11px] font-mono text-[#8b8b88] hover:text-[#f4f4f2] underline underline-offset-2">Inspect tool</a>` : ''}
                ${alt.kind !== 'byok-swap' ? `<button type="button" data-apply-alt="${idx}" class="cc-apply-btn">Apply swap</button>` : ''}
              </div>
            </div>`,
              )
              .join('');

      els.alternativesList.querySelectorAll('[data-apply-alt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const alt = breakdown.alternatives[Number(btn.getAttribute('data-apply-alt'))];
          if (!alt) return;
          if (alt.kind === 'tool-swap') {
            const targetTool = paidCatalog.find(t => t.slug === alt.toSlugOrId);
            const seatIdx = state.selectedSeats.findIndex(s => s.slug === alt.fromId);
            if (targetTool && seatIdx >= 0) {
              state.selectedSeats[seatIdx] = { slug: targetTool.slug, planName: targetTool.plans[0]?.name };
            }
          } else if (alt.kind === 'model-swap') {
            const modelIdx = state.selectedModels.findIndex(m => m.id === alt.fromId);
            if (modelIdx >= 0) state.selectedModels[modelIdx] = { id: alt.toSlugOrId };
          }
          recalc();
        });
      });
    }
  }

  function syncControlsFromState() {
    if (els.teamSlider) els.teamSlider.value = String(teamSizeToSlider(state.teamSize));
    if (els.teamInput && document.activeElement !== els.teamInput) {
      els.teamInput.value = String(state.teamSize);
    }
    els.teamPresets?.forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-team-preset')) === state.teamSize);
    });
    if (els.discountSlider) els.discountSlider.value = String(state.discountPercent || 0);
    if (els.discountVal) {
      els.discountVal.textContent = state.discountPercent > 0 ? `${state.discountPercent}% off` : '0% (List Price)';
    }
    els.cycleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cycle') === state.billingCycle);
    });
    els.workloadBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-workload') === state.preset);
    });
    if (els.inputSlider) els.inputSlider.value = String(state.usage.inputMillionsPerDevDay);
    if (els.outputSlider) els.outputSlider.value = String(state.usage.outputMillionsPerDevDay);
    if (els.cacheSlider) els.cacheSlider.value = String(Math.round(state.usage.cacheHitRatio * 100));
    if (els.inputVal) els.inputVal.textContent = `${state.usage.inputMillionsPerDevDay.toFixed(2)}M / day`;
    if (els.outputVal) els.outputVal.textContent = `${state.usage.outputMillionsPerDevDay.toFixed(2)}M / day`;
    if (els.cacheVal) els.cacheVal.textContent = `${Math.round(state.usage.cacheHitRatio * 100)}%`;
  }

  function recalc() {
    syncControlsFromState();
    renderPopularChips();
    renderSelectedSeats();
    renderModelPicker();
    lastBreakdown = calculateStackCost({
      catalog, models, selectedSeats: state.selectedSeats, selectedModels: state.selectedModels,
      teamSize: state.teamSize, billingCycle: state.billingCycle, discountPercent: state.discountPercent, usage: state.usage,
    });
    renderDashboard(lastBreakdown);
    syncUrl();
  }

  els.teamSlider?.addEventListener('input', e => {
    state.teamSize = sliderToTeamSize(e.target.value);
    if (els.teamInput) els.teamInput.value = String(state.teamSize);
    recalc();
  });
  const onTeamInputChange = e => {
    state.teamSize = Math.max(1, Math.min(MAX_TEAM_SIZE, Math.round(Number(e.target.value) || 1)));
    recalc();
  };
  els.teamInput?.addEventListener('input', onTeamInputChange);
  els.teamInput?.addEventListener('change', e => {
    onTeamInputChange(e);
    if (els.teamInput) els.teamInput.value = String(state.teamSize);
  });
  const stepTeamSize = delta => {
    state.teamSize = Math.max(1, Math.min(MAX_TEAM_SIZE, (Number(state.teamSize) || 1) + delta));
    if (els.teamInput) els.teamInput.value = String(state.teamSize);
    recalc();
  };
  els.teamDecBtn?.addEventListener('click', () => stepTeamSize(-1));
  els.teamIncBtn?.addEventListener('click', () => stepTeamSize(1));
  els.teamPresets?.forEach(btn => {
    btn.addEventListener('click', () => {
      state.teamSize = Math.max(1, Math.min(MAX_TEAM_SIZE, Number(btn.getAttribute('data-team-preset')) || 1));
      if (els.teamInput) els.teamInput.value = String(state.teamSize);
      recalc();
    });
  });
  els.discountSlider?.addEventListener('input', e => {
    state.discountPercent = Math.max(0, Math.min(50, Number(e.target.value) || 0));
    recalc();
  });
  els.cycleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.billingCycle = btn.getAttribute('data-cycle') === 'annual' ? 'annual' : 'monthly';
      recalc();
    });
  });
  els.toolSearch?.addEventListener('input', e => {
    toolSearchQuery = e.target.value;
    renderToolSearchResults();
  });
  els.workloadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-workload');
      if (WORKLOAD_PRESETS[id]) {
        state.preset = id;
        state.usage = { ...WORKLOAD_PRESETS[id] };
        recalc();
      }
    });
  });

  const onCustomUsageInput = () => {
    state.preset = 'custom';
    state.usage = {
      inputMillionsPerDevDay: Number(els.inputSlider?.value ?? 1),
      outputMillionsPerDevDay: Number(els.outputSlider?.value ?? 0.2),
      cacheHitRatio: Number(els.cacheSlider?.value ?? 65) / 100,
      workdaysPerMonth: 22,
    };
    recalc();
  };
  els.inputSlider?.addEventListener('input', onCustomUsageInput);
  els.outputSlider?.addEventListener('input', onCustomUsageInput);
  els.cacheSlider?.addEventListener('input', onCustomUsageInput);

  els.refreshModelsBtn?.addEventListener('click', async () => {
    if (els.cacheBadge) els.cacheBadge.textContent = 'Refreshing models.dev…';
    const result = await loadModelsPricing({ forceRefresh: true });
    models = result.models;
    updateCacheBadge(result);
    renderProviderTabs();
    recalc();
  });

  els.copyBtn?.addEventListener('click', async () => {
    if (!lastBreakdown) return;
    try {
      await navigator.clipboard.writeText(formatStackSummaryText(lastBreakdown, state.usage));
      const orig = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyBtn.textContent = orig), 2000);
    } catch {}
  });

  els.shareBtn?.addEventListener('click', async () => {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}${buildCalculatorUrlSearch(state)}`;
      await navigator.clipboard.writeText(shareUrl);
      const orig = els.shareBtn.textContent;
      els.shareBtn.textContent = 'Link Copied!';
      setTimeout(() => (els.shareBtn.textContent = orig), 2000);
    } catch {}
  });

  function updateCacheBadge(res) {
    if (!els.cacheBadge) return;
    const labelMap = {
      live: 'Live from models.dev (cached 6h)', 'edge-cache': 'Edge cached from models.dev',
      'client-cache': 'Cached locally from models.dev', 'stale-cache': 'Offline stale cache',
      fallback: 'Built-in fallback snapshot',
    };
    els.cacheBadge.textContent = `${res.models.length} models · ${labelMap[res.source] || 'Ready'}`;
  }

  (async () => {
    const res = await loadModelsPricing();
    models = res.models;
    updateCacheBadge(res);
    renderProviderTabs();
    recalc();
  })();
}
