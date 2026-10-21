import {
  BLOG_SCORE_EXAMPLES,
  DEFAULT_EFFICIENCY_SETTINGS,
  SAMPLE_TEAM,
  VOLUME_WEIGHT,
  calculateTeamEfficiency,
  computeEfficiencyScore,
  costPerHourForTargetScore,
  evaluateApproval,
  evaluateEngineer,
  gradeForScore,
  saturatingRating,
} from '../src/lib/efficiency-calculator';

export {
  BLOG_SCORE_EXAMPLES,
  DEFAULT_EFFICIENCY_SETTINGS,
  SAMPLE_TEAM,
  VOLUME_WEIGHT,
  calculateTeamEfficiency,
  computeEfficiencyScore,
  costPerHourForTargetScore,
  evaluateApproval,
  evaluateEngineer,
  gradeForScore,
  saturatingRating,
};

const usd = value => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const hours = value => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
const gradeNames = {
  healthy: 'Healthy',
  satisfactory: 'Satisfactory',
  'needs-improvement': 'Needs Improvement',
  unknown: 'Unknown',
};

export function formatEfficiencySummaryText(summary, settings = DEFAULT_EFFICIENCY_SETTINGS) {
  const lines = [
    'AI Efficiency Calculator',
    `Monthly spend: ${usd(summary.totalSpend)}`,
    `Productive hours: ${hours(summary.totalProductiveHours)}`,
    `Blended cost per productive hour: ${
      summary.blendedCostPerProductiveHour === null ? 'Not available' : usd(summary.blendedCostPerProductiveHour)
    }`,
    `Value delivered: ${usd(summary.totalValue)}${summary.roiMultiple === null ? '' : ` (${summary.roiMultiple.toFixed(2)}x ROI)`}`,
    `Spend without useful work: ${usd(summary.wastedSpend)}`,
    `Grades: ${summary.gradeCounts.healthy} Healthy, ${summary.gradeCounts.satisfactory} Satisfactory, ${summary.gradeCounts['needs-improvement']} Needs Improvement, ${summary.gradeCounts.unknown} Unknown`,
    `Average score: ${summary.averageScore === null ? 'Not available' : summary.averageScore}`,
    '',
    'Efficiency-based approvals',
    `Hours under blanket cap: ${hours(summary.hoursUnderBlanketCap)}`,
    `Hours under efficiency policy: ${hours(summary.hoursUnderEfficiencyPolicy)}`,
    `Hours unlocked: ${hours(summary.hoursUnlocked)}`,
    `Auto-approved above base limits: ${usd(summary.autoApprovedSpend)}`,
    `Pending admin review: ${usd(summary.pendingAdminSpend)} across ${summary.adminQueueCount} engineers`,
    `Base monthly limit: ${usd(settings.baseMonthlyLimit)}, auto-approval ceiling: ${usd(settings.autoApproveCeiling)}`,
    '',
    'Engineer scores',
    ...summary.engineers.map(
      engineer =>
        `${engineer.name}: ${engineer.score.score} (${gradeNames[engineer.grade]}), ${usd(engineer.monthlySpend)} spend, ${hours(engineer.productiveHours)} productive`,
    ),
    '',
    'Calculated via https://ai.dosa.dev/tools/cost-calculator?view=efficiency',
  ];
  return lines.join('\n');
}

export { initEfficiencyCalculatorUI } from './efficiency-calculator-ui.js';
