/**
 * DOM controller for /tools/rules-converter.
 *
 * Keeps UI and state synchronization separated from pure transformation logic.
 */

import {
  RULE_FORMATS,
  STARTER_TEMPLATES,
  buildConverterUrlSearch,
  convertRules,
  detectRuleFormat,
  estimateTokens,
  parseConverterUrlState,
} from './rules-converter.js';

export function initRulesConverterUI() {
  const urlState = parseConverterUrlState(window.location.search);
  const state = {
    fromFormat: urlState.fromFormat || 'claude-md',
    toFormat: urlState.toFormat || 'cursor-mdc',
    templateKey: urlState.templateKey || '',
    mdcOptions: {
      description: '',
      globs: '*',
      alwaysApply: true,
    },
  };

  const byId = id => document.getElementById(id);
  const els = {
    sourceFormatSelect: byId('sourceFormatSelect'),
    targetFormatSelect: byId('targetFormatSelect'),
    swapFormatsBtn: byId('swapFormatsBtn'),
    starterChips: document.querySelectorAll('[data-starter-tpl]'),
    sourceText: byId('sourceText'),
    outputText: byId('outputText'),
    fileInput: byId('fileInput'),
    uploadBtn: byId('uploadBtn'),
    copyBtn: byId('copyOutputBtn'),
    downloadBtn: byId('downloadOutputBtn'),
    clearBtn: byId('clearSourceBtn'),
    shareBtn: byId('shareLinkBtn'),
    autoDetectBadge: byId('autoDetectBadge'),
    sourceStats: byId('sourceStats'),
    outputStats: byId('outputStats'),
    targetFilenameBadge: byId('targetFilenameBadge'),
    targetToolLink: byId('targetToolLink'),
    mdcOptionsPanel: byId('mdcOptionsPanel'),
    mdcDescriptionInput: byId('mdcDescriptionInput'),
    mdcGlobsInput: byId('mdcGlobsInput'),
    mdcAlwaysApplyCheck: byId('mdcAlwaysApplyCheck'),
  };

  function syncUrl() {
    const search = buildConverterUrlSearch(state);
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }

  function getTargetFormatInfo() {
    return RULE_FORMATS.find(f => f.id === state.toFormat) ?? RULE_FORMATS[0];
  }

  function updateMdcVisibility() {
    if (!els.mdcOptionsPanel) return;
    const isMdc = state.toFormat === 'cursor-mdc';
    els.mdcOptionsPanel.style.display = isMdc ? 'grid' : 'none';
  }

  function convert() {
    const raw = els.sourceText?.value ?? '';
    const detected = detectRuleFormat(raw);

    if (els.autoDetectBadge) {
      const detectedInfo = RULE_FORMATS.find(f => f.id === detected);
      els.autoDetectBadge.textContent = detectedInfo ? `Detected: ${detectedInfo.label}` : 'Markdown';
    }

    const converted = convertRules(raw, state.toFormat, state.mdcOptions);
    if (els.outputText) els.outputText.value = converted;

    // Update target info
    const targetInfo = getTargetFormatInfo();
    if (els.targetFilenameBadge) els.targetFilenameBadge.textContent = targetInfo.targetFile;
    if (els.targetToolLink) {
      els.targetToolLink.href = `/tools/${targetInfo.toolSlug}`;
      els.targetToolLink.textContent = `Inspect ${targetInfo.toolName} →`;
    }

    // Update stats
    const inChars = raw.length;
    const inTokens = estimateTokens(raw);
    const outChars = converted.length;
    const outTokens = estimateTokens(converted);

    if (els.sourceStats) els.sourceStats.textContent = `${inChars.toLocaleString()} chars · ~${inTokens.toLocaleString()} tokens`;
    if (els.outputStats) els.outputStats.textContent = `${outChars.toLocaleString()} chars · ~${outTokens.toLocaleString()} tokens`;

    syncUrl();
  }

  function loadTemplate(key) {
    const tpl = STARTER_TEMPLATES[key];
    if (!tpl) return;
    state.templateKey = key;
    if (els.sourceText) els.sourceText.value = tpl.content;
    state.fromFormat = tpl.format;
    if (els.sourceFormatSelect) els.sourceFormatSelect.value = tpl.format;
    // Highlight active chip
    els.starterChips?.forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-starter-tpl') === key);
    });
    convert();
  }

  // Bind dropdowns
  els.sourceFormatSelect?.addEventListener('change', e => {
    state.fromFormat = e.target.value;
    state.templateKey = '';
    convert();
  });

  els.targetFormatSelect?.addEventListener('change', e => {
    state.toFormat = e.target.value;
    updateMdcVisibility();
    convert();
  });

  // Swap button
  els.swapFormatsBtn?.addEventListener('click', () => {
    const tempFormat = state.fromFormat;
    state.fromFormat = state.toFormat;
    state.toFormat = tempFormat;

    if (els.sourceFormatSelect) els.sourceFormatSelect.value = state.fromFormat;
    if (els.targetFormatSelect) els.targetFormatSelect.value = state.toFormat;

    // Swap text if output has content
    if (els.outputText?.value && els.sourceText) {
      els.sourceText.value = els.outputText.value;
    }
    updateMdcVisibility();
    convert();
  });

  // Live input
  els.sourceText?.addEventListener('input', () => {
    state.templateKey = '';
    els.starterChips?.forEach(chip => chip.classList.remove('active'));
    convert();
  });

  // MDC Frontmatter controls
  els.mdcDescriptionInput?.addEventListener('input', e => {
    state.mdcOptions.description = e.target.value;
    convert();
  });
  els.mdcGlobsInput?.addEventListener('input', e => {
    state.mdcOptions.globs = e.target.value;
    convert();
  });
  els.mdcAlwaysApplyCheck?.addEventListener('change', e => {
    state.mdcOptions.alwaysApply = e.target.checked;
    convert();
  });

  // Starter chips
  els.starterChips?.forEach(btn => {
    btn.addEventListener('click', () => {
      loadTemplate(btn.getAttribute('data-starter-tpl'));
    });
  });

  // File upload
  els.uploadBtn?.addEventListener('click', () => els.fileInput?.click());
  els.fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (els.sourceText) {
        els.sourceText.value = String(ev.target?.result ?? '');
        state.templateKey = '';
        els.starterChips?.forEach(chip => chip.classList.remove('active'));
        convert();
      }
    };
    reader.readAsText(file);
  });

  // Copy output
  els.copyBtn?.addEventListener('click', async () => {
    const out = els.outputText?.value ?? '';
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out);
      const orig = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyBtn.textContent = orig), 2000);
    } catch {}
  });

  // Download file with proper target filename
  els.downloadBtn?.addEventListener('click', () => {
    const out = els.outputText?.value ?? '';
    if (!out) return;
    const targetInfo = getTargetFormatInfo();
    const filename = targetInfo.targetFile.split('/').pop() || 'rules.md';
    const blob = new Blob([out], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Clear source
  els.clearBtn?.addEventListener('click', () => {
    if (els.sourceText) els.sourceText.value = '';
    state.templateKey = '';
    els.starterChips?.forEach(chip => chip.classList.remove('active'));
    convert();
  });

  // Share link
  els.shareBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const orig = els.shareBtn.textContent;
      els.shareBtn.textContent = 'Link Copied!';
      setTimeout(() => (els.shareBtn.textContent = orig), 2000);
    } catch {}
  });

  // Initialize
  if (els.sourceFormatSelect) els.sourceFormatSelect.value = state.fromFormat;
  if (els.targetFormatSelect) els.targetFormatSelect.value = state.toFormat;
  updateMdcVisibility();

  if (state.templateKey && STARTER_TEMPLATES[state.templateKey]) {
    loadTemplate(state.templateKey);
  } else {
    loadTemplate('astro-cf');
  }
}

export { initRulesConverterUI as default };
