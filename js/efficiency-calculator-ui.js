import {
  BLOG_SCORE_EXAMPLES,
  DEFAULT_EFFICIENCY_SETTINGS,
  SAMPLE_TEAM,
  calculateTeamEfficiency,
  computeEfficiencyScore,
  formatEfficiencySummaryText,
  gradeForScore,
  parseNumericField,
} from './efficiency-calculator.js';

const esc = value =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const usd = value => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const compact = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const gradeNames = {
  healthy: 'Healthy',
  satisfactory: 'Satisfactory',
  'needs-improvement': 'Needs Improvement',
  unknown: 'Unknown',
};

export function initEfficiencyCalculatorUI() {
  const root = document.getElementById('efficiencyCalculator');
  if (!root) return;

  const state = {
    settings: { ...DEFAULT_EFFICIENCY_SETTINGS },
    engineers: SAMPLE_TEAM.map(engineer => ({ ...engineer })),
    nextId: SAMPLE_TEAM.length + 1,
    explorerE: 0.5,
    explorerV: 0.5,
  };
  const byId = id => document.getElementById(id);
  const setText = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value;
  };

  function renderExplorer() {
    const score = computeEfficiencyScore(state.explorerE, state.explorerV);
    const grade = gradeForScore(score.score, state.settings, true);
    const activeExample = BLOG_SCORE_EXAMPLES.find(example => example.e === state.explorerE && example.v === state.explorerV)?.id;
    setText('explorerEValue', state.explorerE.toFixed(2));
    setText('explorerVValue', state.explorerV.toFixed(2));
    setText(
      'explorerFormula',
      `100 × (${state.explorerE.toFixed(2)} + 0.2 × ${state.explorerV.toFixed(2)} × ${(1 - state.explorerE).toFixed(2)}) = ${score.score}`,
    );
    setText('explorerBasePoints', `${compact(score.basePoints)} points`);
    setText('explorerVolumePoints', `${compact(score.volumePoints)} points`);
    setText('explorerMaxPoints', `${compact(score.maxVolumePoints)} points`);
    const gradeElement = byId('explorerGrade');
    if (gradeElement) {
      gradeElement.textContent = gradeNames[grade];
      gradeElement.className = `ec-grade ec-grade-${grade}`;
    }
    root.querySelectorAll('[data-explorer]').forEach(input => {
      if (input.dataset.explorer === 'e') input.value = String(state.explorerE);
      if (input.dataset.explorer === 'v') input.value = String(state.explorerV);
    });
    root.querySelectorAll('[data-example]').forEach(button => {
      button.classList.toggle('active', button.dataset.example === activeExample);
    });
  }

  function approvalText(approval) {
    if (approval.status === 'within-limit') return 'Within limit';
    if (approval.status === 'auto-raised') return `Auto-raised +${usd(approval.autoApproved)}`;
    if (approval.status === 'auto-raised-partial') {
      return `Partial: +${usd(approval.autoApproved)} auto, ${usd(approval.pendingAdmin)} to admin`;
    }
    return `Admin review ${usd(approval.pendingAdmin)}`;
  }

  function renderRowDerived(engineer) {
    const costPerHour = engineer.costPerProductiveHour === null ? 'Not available' : `${usd(engineer.costPerProductiveHour)}/h`;
    const targetCost =
      engineer.costPerHourForSatisfactory === null
        ? ''
        : `<p class="ec-hint">Reach Satisfactory at ≤ ${usd(engineer.costPerHourForSatisfactory)} per productive hour</p>`;
    return `<dl class="ec-derived-grid">
      <div><dt>Productive hrs</dt><dd>${compact(engineer.productiveHours)}</dd></div>
      <div><dt>Cost / productive hr</dt><dd>${costPerHour}</dd></div>
      <div><dt>E</dt><dd>${engineer.efficiencyRating.toFixed(2)}</dd></div>
      <div><dt>V</dt><dd>${engineer.volumeRating.toFixed(2)}</dd></div>
      <div><dt>Score</dt><dd>${engineer.score.score}</dd></div>
      <div><dt>Grade</dt><dd><span class="ec-grade ec-grade-${engineer.grade}">${gradeNames[engineer.grade]}</span></dd></div>
    </dl>
    <p class="ec-approval"><span>Limit outcome</span><strong>${approvalText(engineer.approval)}</strong></p>
    ${targetCost}`;
  }

  function renderRows(summary) {
    const container = byId('engineerRows');
    if (!container) return;
    container.innerHTML = summary.engineers
      .map((engineer, index) => `<article class="ec-engineer-card">
        <div class="ec-engineer-heading">
          <label class="ec-field ec-name-field"><span>Name</span><input type="text" data-row-index="${index}" data-field="name" value="${esc(engineer.name)}" aria-label="Engineer name" /></label>
          <button type="button" class="ec-remove" data-remove-row="${index}" aria-label="Remove ${esc(engineer.name)}">Remove</button>
        </div>
        <div class="ec-input-grid">
          <label class="ec-field"><span>Monthly spend ($)</span><input type="number" min="0" step="1" data-row-index="${index}" data-field="monthlySpend" value="${esc(engineer.monthlySpend)}" /></label>
          <label class="ec-field"><span>Sessions / mo</span><input type="number" min="0" step="1" data-row-index="${index}" data-field="sessionsPerMonth" value="${esc(engineer.sessionsPerMonth)}" /></label>
          <label class="ec-field"><span>Useful-work rate (%)</span><input type="number" min="0" max="100" step="1" data-row-index="${index}" data-field="usefulRate" value="${esc(engineer.usefulRate * 100)}" /></label>
          <label class="ec-field"><span>Productive h / useful session</span><input type="number" min="0" step="0.1" data-row-index="${index}" data-field="hoursPerUsefulSession" value="${esc(engineer.hoursPerUsefulSession)}" /></label>
        </div>
        <div data-row-derived="${index}">${renderRowDerived(engineer)}</div>
      </article>`)
      .join('');
  }

  function renderDerived(summary) {
    summary.engineers.forEach((engineer, index) => {
      const container = root.querySelector(`[data-row-derived="${index}"]`);
      if (container) container.innerHTML = renderRowDerived(engineer);
    });
  }

  function renderSummary(summary) {
    setText('summarySpend', usd(summary.totalSpend));
    setText('summaryHours', `${compact(summary.totalProductiveHours)} h`);
    setText(
      'summaryBlendedCost',
      summary.blendedCostPerProductiveHour === null ? 'Not available' : `${usd(summary.blendedCostPerProductiveHour)}/h`,
    );
    setText(
      'summaryValue',
      `${usd(summary.totalValue)}${summary.roiMultiple === null ? '' : ` · ${summary.roiMultiple.toFixed(2)}x ROI`}`,
    );
    setText('summaryWastedSpend', usd(summary.wastedSpend));
    setText(
      'summaryGrades',
      `${summary.gradeCounts.healthy} Healthy · ${summary.gradeCounts.satisfactory} Satisfactory · ${summary.gradeCounts['needs-improvement']} Needs Improvement · ${summary.gradeCounts.unknown} Unknown`,
    );
    setText('summaryAverage', summary.averageScore === null ? 'Not available' : String(summary.averageScore));
    setText('summaryBlanketHours', `${compact(summary.hoursUnderBlanketCap)} h`);
    setText('summaryPolicyHours', `${compact(summary.hoursUnderEfficiencyPolicy)} h`);
    setText('summaryUnlockedHours', `${compact(summary.hoursUnlocked)} h`);
    setText('summaryAutoApproved', usd(summary.autoApprovedSpend));
    const engineerWord = summary.adminQueueCount === 1 ? 'engineer' : 'engineers';
    setText('summaryAdminQueue', `${usd(summary.pendingAdminSpend)} · ${summary.adminQueueCount} ${engineerWord}`);
  }

  function recalculate({ rebuildRows = false } = {}) {
    const summary = calculateTeamEfficiency(state.engineers, state.settings);
    if (rebuildRows) renderRows(summary);
    else renderDerived(summary);
    renderSummary(summary);
    renderExplorer();
  }

  function renderSettings() {
    root.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      if (key && key in state.settings) input.value = String(state.settings[key]);
    });
  }

  function restoreNumericInput(target) {
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
    const setting = target.dataset.setting;
    if (setting && setting in state.settings) {
      target.value = String(state.settings[setting]);
      return;
    }
    if (target.dataset.rowIndex === undefined) return;
    const engineer = state.engineers[Number(target.dataset.rowIndex)];
    const field = target.dataset.field;
    if (!engineer || !field || field === 'name' || !(field in engineer)) return;
    const value = field === 'usefulRate' ? engineer.usefulRate * 100 : engineer[field];
    if (typeof value === 'number') target.value = String(value);
  }

  async function copySummary(button, text) {
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    window.setTimeout(() => {
      button.textContent = 'Copy Summary';
    }, 1400);
  }

  root.querySelectorAll('[data-explorer]').forEach(input => {
    input.addEventListener('input', () => {
      if (input.dataset.explorer === 'e') state.explorerE = Number(input.value);
      if (input.dataset.explorer === 'v') state.explorerV = Number(input.value);
      renderExplorer();
    });
  });

  root.querySelectorAll('[data-example]').forEach(button => {
    button.addEventListener('click', () => {
      const example = BLOG_SCORE_EXAMPLES.find(item => item.id === button.dataset.example);
      if (example) {
        state.explorerE = example.e;
        state.explorerV = example.v;
        renderExplorer();
      }
    });
  });

  root.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.rowIndex !== undefined) {
      const rowIndex = Number(target.dataset.rowIndex);
      const engineer = state.engineers[rowIndex];
      const field = target.dataset.field;
      if (!engineer || !field) return;
      if (field === 'name') {
        engineer.name = target.value;
        root.querySelector(`[data-remove-row="${rowIndex}"]`)?.setAttribute('aria-label', `Remove ${engineer.name}`);
      } else {
        const value = parseNumericField(field, target.value);
        if (value === null) return;
        engineer[field] = field === 'usefulRate' ? value / 100 : value;
      }
      recalculate();
    }
    if (target instanceof HTMLInputElement && target.dataset.setting) {
      const key = target.dataset.setting;
      const value = parseNumericField(key, target.value);
      if (value === null) return;
      state.settings[key] = value;
      recalculate();
    }
  });

  root.addEventListener('change', event => restoreNumericInput(event.target));
  root.addEventListener('focusout', event => restoreNumericInput(event.target));

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addEngineer') {
      if (state.engineers.length >= 25) return;
      state.engineers.push({
        id: `engineer-${state.nextId++}`,
        name: `Engineer ${state.nextId - 1}`,
        monthlySpend: 1000,
        sessionsPerMonth: 10,
        usefulRate: 0.7,
        hoursPerUsefulSession: 1.5,
      });
      recalculate({ rebuildRows: true });
    }
    if (button.id === 'resetExamples') {
      state.engineers = SAMPLE_TEAM.map(engineer => ({ ...engineer }));
      state.nextId = SAMPLE_TEAM.length + 1;
      recalculate({ rebuildRows: true });
    }
    if (button.dataset.removeRow !== undefined) {
      state.engineers.splice(Number(button.dataset.removeRow), 1);
      recalculate({ rebuildRows: true });
    }
    if (button.id === 'copyEfficiencySummary') {
      const summary = calculateTeamEfficiency(state.engineers, state.settings);
      void copySummary(button, formatEfficiencySummaryText(summary, state.settings));
    }
  });

  renderSettings();
  recalculate({ rebuildRows: true });
}
