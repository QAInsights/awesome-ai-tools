import { describe, expect, test } from 'bun:test';
import { calculateTeamEfficiency, formatEfficiencySummaryText, SAMPLE_TEAM } from './efficiency-calculator.js';

describe('efficiency calculator summary text', () => {
  test('includes team efficiency and approval details with a canonical footer', () => {
    const summary = formatEfficiencySummaryText(calculateTeamEfficiency(SAMPLE_TEAM));
    expect(summary).toContain('Monthly spend: $19,956');
    expect(summary).toContain('Productive hours: 329.8 h');
    expect(summary).toContain('55 (Satisfactory)');
    expect(summary).toContain('41 (Needs Improvement)');
    expect(summary).toContain('Pending admin review: $11,700 across 1 engineers');
    expect(summary.endsWith('Calculated via https://ai.dosa.dev/tools/cost-calculator?view=efficiency')).toBe(true);
  });
});
