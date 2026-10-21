import { describe, expect, test } from 'bun:test';
import {
  calculateTeamEfficiency,
  formatEfficiencySummaryText,
  parseNumericField,
  SAMPLE_TEAM,
} from './efficiency-calculator.js';

describe('efficiency calculator numeric fields', () => {
  test('rejects empty, non-finite, and out-of-domain values', () => {
    expect(parseNumericField('monthlySpend', '')).toBeNull();
    expect(parseNumericField('monthlySpend', 'abc')).toBeNull();
    expect(parseNumericField('benchmarkCostPerHour', '0')).toBeNull();
    expect(parseNumericField('benchmarkCostPerHour', '2.5')).toBe(2.5);
    expect(parseNumericField('usefulRate', '101')).toBeNull();
    expect(parseNumericField('hoursPerUsefulSession', '-1')).toBeNull();
    expect(parseNumericField('healthyThreshold', '100')).toBe(100);
    expect(parseNumericField('baseMonthlyLimit', '0')).toBe(0);
    expect(parseNumericField('unknownField', '2')).toBeNull();
  });
});

describe('efficiency calculator summary text', () => {
  test('includes team efficiency and approval details with a canonical footer', () => {
    const summary = formatEfficiencySummaryText(calculateTeamEfficiency(SAMPLE_TEAM));
    expect(summary).toContain('Monthly spend: $19,956');
    expect(summary).toContain('Spend without useful work (est.): $9,588');
    expect(summary).toContain('Productive hours: 329.8 h');
    expect(summary).toContain('55 (Satisfactory)');
    expect(summary).toContain('41 (Needs Improvement)');
    expect(summary).toContain('Pending admin review: $11,700 across 1 engineers');
    expect(summary.endsWith('Calculated via https://ai.dosa.dev/tools/cost-calculator?view=efficiency')).toBe(true);
  });
});
