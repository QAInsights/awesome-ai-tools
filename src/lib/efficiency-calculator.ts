export const VOLUME_WEIGHT = 0.2;

export type EfficiencyGrade = 'healthy' | 'satisfactory' | 'needs-improvement' | 'unknown';

export interface EfficiencySettings {
  workdaysPerMonth: number;
  benchmarkCostPerHour: number;
  benchmarkHoursPerDay: number;
  engineerHourlyCost: number;
  baseMonthlyLimit: number;
  autoApproveCeiling: number;
  healthyThreshold: number;
  satisfactoryThreshold: number;
  minSessionsForGrade: number;
}

export const DEFAULT_EFFICIENCY_SETTINGS: EfficiencySettings = {
  workdaysPerMonth: 22,
  benchmarkCostPerHour: 40,
  benchmarkHoursPerDay: 1.5,
  engineerHourlyCost: 100,
  baseMonthlyLimit: 1000,
  autoApproveCeiling: 6000,
  healthyThreshold: 65,
  satisfactoryThreshold: 50,
  minSessionsForGrade: 5,
};

export interface EngineerUsageInput {
  id: string;
  name: string;
  monthlySpend: number;
  sessionsPerMonth: number;
  usefulRate: number;
  hoursPerUsefulSession: number;
}

export interface ScoreBreakdown {
  score: number;
  exact: number;
  basePoints: number;
  volumePoints: number;
  maxVolumePoints: number;
}

export type ApprovalStatus = 'within-limit' | 'auto-raised' | 'auto-raised-partial' | 'admin-review';

export interface ApprovalOutcome {
  status: ApprovalStatus;
  demand: number;
  baseLimit: number;
  autoApproved: number;
  pendingAdmin: number;
  effectiveLimit: number;
  hoursUnderBlanketCap: number;
  hoursUnderEfficiencyPolicy: number;
}

export interface EngineerEfficiencyResult extends EngineerUsageInput {
  usefulSessions: number;
  productiveHours: number;
  hoursPerDay: number;
  costPerProductiveHour: number | null;
  costPerUsefulSession: number | null;
  efficiencyRating: number;
  volumeRating: number;
  score: ScoreBreakdown;
  grade: EfficiencyGrade;
  wastedSpend: number;
  valueDelivered: number;
  roiMultiple: number | null;
  approval: ApprovalOutcome;
  costPerHourForSatisfactory: number | null;
}

export interface TeamEfficiencySummary {
  engineers: EngineerEfficiencyResult[];
  totalSpend: number;
  totalProductiveHours: number;
  blendedCostPerProductiveHour: number | null;
  totalValue: number;
  roiMultiple: number | null;
  wastedSpend: number;
  gradeCounts: Record<EfficiencyGrade, number>;
  averageScore: number | null;
  autoApprovedSpend: number;
  pendingAdminSpend: number;
  adminQueueCount: number;
  hoursUnderBlanketCap: number;
  hoursUnderEfficiencyPolicy: number;
  hoursUnlocked: number;
}

export const BLOG_SCORE_EXAMPLES: ReadonlyArray<{ id: string; label: string; e: number; v: number; score: number }> = [
  { id: 'typical', label: 'Typical', e: 0.5, v: 0.5, score: 55 },
  { id: 'power', label: 'Power user', e: 0.5, v: 0.95, score: 60 },
  { id: 'wasteful', label: 'Heavy but wasteful', e: 0.27, v: 0.95, score: 41 },
  { id: 'careful', label: 'Careful, low volume', e: 0.75, v: 0.17, score: 76 },
];

export const SAMPLE_TEAM: ReadonlyArray<EngineerUsageInput> = [
  {
    id: 'typical',
    name: 'Typical engineer',
    monthlySpend: 1320,
    sessionsPerMonth: 40,
    usefulRate: 0.6,
    hoursPerUsefulSession: 1.375,
  },
  {
    id: 'power',
    name: 'Power user',
    monthlySpend: 5760,
    sessionsPerMonth: 120,
    usefulRate: 0.75,
    hoursPerUsefulSession: 1.6,
  },
  {
    id: 'wasteful',
    name: 'Heavy but wasteful',
    monthlySpend: 12700,
    sessionsPerMonth: 150,
    usefulRate: 0.4,
    hoursPerUsefulSession: 2.4,
  },
  {
    id: 'careful',
    name: 'Careful, low volume',
    monthlySpend: 176,
    sessionsPerMonth: 8,
    usefulRate: 1,
    hoursPerUsefulSession: 1.1,
  },
];

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function saturatingRating(value: number, halfPoint: number): number {
  if (Number.isNaN(value) || Number.isNaN(halfPoint) || value <= 0 || halfPoint <= 0) return 0;
  if (value === Infinity) return 1;
  return Math.min(1 - Number.EPSILON, 1 - 2 ** (-value / halfPoint));
}

export function computeEfficiencyScore(e: number, v: number, lambda = VOLUME_WEIGHT): ScoreBreakdown {
  const efficiency = clamp01(e);
  const volume = clamp01(v);
  const basePoints = 100 * efficiency;
  const maxVolumePoints = 100 * lambda * (1 - efficiency);
  const volumePoints = maxVolumePoints * volume;
  const exact = basePoints + volumePoints;
  return {
    score: Math.round(exact + 1e-9),
    exact,
    basePoints,
    volumePoints,
    maxVolumePoints,
  };
}

export function gradeForScore(score: number, settings: EfficiencySettings, hasEnoughData: boolean): EfficiencyGrade {
  if (!hasEnoughData) return 'unknown';
  if (score >= settings.healthyThreshold) return 'healthy';
  if (score >= settings.satisfactoryThreshold) return 'satisfactory';
  return 'needs-improvement';
}

export function costPerHourForTargetScore(
  targetScore: number,
  volumeRating: number,
  settings: EfficiencySettings,
  lambda = VOLUME_WEIGHT,
): number | null {
  const volume = clamp01(volumeRating);
  const volumeContribution = lambda * volume;
  const efficiency = (targetScore / 100 - volumeContribution) / (1 - volumeContribution);
  if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency >= 1) return null;
  return settings.benchmarkCostPerHour / -Math.log2(1 - efficiency);
}

export function evaluateApproval(
  demand: number,
  grade: EfficiencyGrade,
  productiveHours: number,
  settings: EfficiencySettings,
): ApprovalOutcome {
  const baseLimit = settings.baseMonthlyLimit;
  const ceiling = Math.max(baseLimit, settings.autoApproveCeiling);
  let status: ApprovalStatus;
  let autoApproved = 0;
  let pendingAdmin = 0;

  if (demand <= baseLimit) {
    status = 'within-limit';
  } else if (grade === 'healthy' || grade === 'satisfactory') {
    autoApproved = Math.min(demand, ceiling) - baseLimit;
    pendingAdmin = Math.max(0, demand - ceiling);
    status = pendingAdmin > 0 ? 'auto-raised-partial' : 'auto-raised';
  } else {
    pendingAdmin = demand - baseLimit;
    status = 'admin-review';
  }

  const effectiveLimit = Math.min(demand, baseLimit + autoApproved);
  return {
    status,
    demand,
    baseLimit,
    autoApproved,
    pendingAdmin,
    effectiveLimit,
    hoursUnderBlanketCap: demand > 0 ? productiveHours * Math.min(1, baseLimit / demand) : productiveHours,
    hoursUnderEfficiencyPolicy:
      demand > 0 ? productiveHours * Math.min(1, effectiveLimit / demand) : productiveHours,
  };
}

export function evaluateEngineer(
  input: EngineerUsageInput,
  settings: EfficiencySettings,
): EngineerEfficiencyResult {
  const usefulRate = clamp01(input.usefulRate);
  const usefulSessions = input.sessionsPerMonth * usefulRate;
  const productiveHours = usefulSessions * input.hoursPerUsefulSession;
  const hoursPerDay = productiveHours / Math.max(1, settings.workdaysPerMonth);
  const efficiencyRating =
    input.monthlySpend <= 0
      ? productiveHours > 0
        ? 1
        : 0
      : saturatingRating(productiveHours / input.monthlySpend, 1 / settings.benchmarkCostPerHour);
  const volumeRating = saturatingRating(hoursPerDay, settings.benchmarkHoursPerDay);
  const score = computeEfficiencyScore(efficiencyRating, volumeRating);
  const hasEnoughData =
    input.sessionsPerMonth >= settings.minSessionsForGrade && input.monthlySpend > 0;
  const grade = gradeForScore(score.score, settings, hasEnoughData);
  const costPerProductiveHour = productiveHours > 0 ? input.monthlySpend / productiveHours : null;
  const costPerUsefulSession = usefulSessions > 0 ? input.monthlySpend / usefulSessions : null;

  return {
    ...input,
    usefulSessions,
    productiveHours,
    hoursPerDay,
    costPerProductiveHour,
    costPerUsefulSession,
    efficiencyRating,
    volumeRating,
    score,
    grade,
    wastedSpend: input.monthlySpend * (1 - usefulRate),
    valueDelivered: productiveHours * settings.engineerHourlyCost,
    roiMultiple: input.monthlySpend > 0 ? (productiveHours * settings.engineerHourlyCost) / input.monthlySpend : null,
    approval: evaluateApproval(input.monthlySpend, grade, productiveHours, settings),
    costPerHourForSatisfactory:
      grade === 'needs-improvement'
        ? costPerHourForTargetScore(settings.satisfactoryThreshold, volumeRating, settings)
        : null,
  };
}

export function calculateTeamEfficiency(
  engineers: ReadonlyArray<EngineerUsageInput>,
  settings: EfficiencySettings = DEFAULT_EFFICIENCY_SETTINGS,
): TeamEfficiencySummary {
  const results = engineers.map(engineer => evaluateEngineer(engineer, settings));
  const totalSpend = results.reduce((sum, engineer) => sum + engineer.monthlySpend, 0);
  const totalProductiveHours = results.reduce((sum, engineer) => sum + engineer.productiveHours, 0);
  const totalValue = results.reduce((sum, engineer) => sum + engineer.valueDelivered, 0);
  const hoursUnderBlanketCap = results.reduce((sum, engineer) => sum + engineer.approval.hoursUnderBlanketCap, 0);
  const hoursUnderEfficiencyPolicy = results.reduce(
    (sum, engineer) => sum + engineer.approval.hoursUnderEfficiencyPolicy,
    0,
  );
  const gradeCounts: Record<EfficiencyGrade, number> = {
    healthy: 0,
    satisfactory: 0,
    'needs-improvement': 0,
    unknown: 0,
  };
  for (const engineer of results) gradeCounts[engineer.grade] += 1;
  const scoredEngineers = results.filter(engineer => engineer.grade !== 'unknown');

  return {
    engineers: results,
    totalSpend,
    totalProductiveHours,
    blendedCostPerProductiveHour: totalProductiveHours > 0 ? totalSpend / totalProductiveHours : null,
    totalValue,
    roiMultiple: totalSpend > 0 ? totalValue / totalSpend : null,
    wastedSpend: results.reduce((sum, engineer) => sum + engineer.wastedSpend, 0),
    gradeCounts,
    averageScore:
      scoredEngineers.length > 0
        ? Math.round(scoredEngineers.reduce((sum, engineer) => sum + engineer.score.score, 0) / scoredEngineers.length)
        : null,
    autoApprovedSpend: results.reduce((sum, engineer) => sum + engineer.approval.autoApproved, 0),
    pendingAdminSpend: results.reduce((sum, engineer) => sum + engineer.approval.pendingAdmin, 0),
    adminQueueCount: results.filter(engineer => engineer.approval.pendingAdmin > 0).length,
    hoursUnderBlanketCap,
    hoursUnderEfficiencyPolicy,
    hoursUnlocked: hoursUnderEfficiencyPolicy - hoursUnderBlanketCap,
  };
}
