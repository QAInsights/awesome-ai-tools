import { describe, expect, test } from 'bun:test';
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
  type EfficiencyGrade,
} from './efficiency-calculator';

describe('efficiency-calculator engine', () => {
  test('matches the published score archetypes and decomposes points', () => {
    for (const example of BLOG_SCORE_EXAMPLES) {
      expect(computeEfficiencyScore(example.e, example.v).score).toBe(example.score);
    }

    const typical = computeEfficiencyScore(0.5, 0.5);
    expect(typical.basePoints).toBe(50);
    expect(typical.maxVolumePoints).toBe(10);
    expect(typical.volumePoints).toBe(5);
    expect(typical.score).toBe(55);

    const careful = computeEfficiencyScore(0.75, 0.17);
    expect(careful.maxVolumePoints).toBe(5);
    expect(computeEfficiencyScore(0.8, 0.5).maxVolumePoints).toBeCloseTo(4);
    expect(VOLUME_WEIGHT).toBe(0.2);
    expect(computeEfficiencyScore(2, -1).score).toBe(100);
  });

  test('saturates at the half point and is monotonic', () => {
    expect(saturatingRating(4, 4)).toBe(0.5);
    expect(saturatingRating(0, 4)).toBe(0);
    expect(saturatingRating(-1, 4)).toBe(0);
    expect(saturatingRating(1, 0)).toBe(0);
    expect(saturatingRating(1, -1)).toBe(0);
    expect(saturatingRating(Infinity, 4)).toBe(1);
    expect(saturatingRating(1, 4)).toBeLessThan(saturatingRating(2, 4));
    expect(saturatingRating(1000, 4)).toBeLessThan(1);
  });

  test('grades threshold boundaries and marks insufficient data unknown', () => {
    const settings = DEFAULT_EFFICIENCY_SETTINGS;
    expect(gradeForScore(65, settings, true)).toBe('healthy');
    expect(gradeForScore(64, settings, true)).toBe('satisfactory');
    expect(gradeForScore(50, settings, true)).toBe('satisfactory');
    expect(gradeForScore(49, settings, true)).toBe('needs-improvement');
    expect(gradeForScore(100, settings, false)).toBe('unknown');
    expect(
      evaluateEngineer(
        { id: 'few', name: 'Few sessions', monthlySpend: 100, sessionsPerMonth: 4, usefulRate: 1, hoursPerUsefulSession: 1 },
        settings,
      ).grade,
    ).toBe('unknown');
    expect(
      evaluateEngineer(
        { id: 'zero', name: 'Zero spend', monthlySpend: 0, sessionsPerMonth: 10, usefulRate: 1, hoursPerUsefulSession: 1 },
        settings,
      ).grade,
    ).toBe('unknown');
  });

  test('sample rows reproduce blog scores, grades, and approval statuses', () => {
    const team = calculateTeamEfficiency(SAMPLE_TEAM);
    expect(team.engineers.map(engineer => engineer.score.score)).toEqual([55, 60, 41, 76]);
    expect(team.engineers.map(engineer => engineer.grade)).toEqual([
      'satisfactory',
      'satisfactory',
      'needs-improvement',
      'healthy',
    ]);
    expect(team.engineers.map(engineer => engineer.approval.status)).toEqual([
      'auto-raised',
      'auto-raised',
      'admin-review',
      'within-limit',
    ]);
    expect(team.engineers[2]?.costPerHourForSatisfactory).not.toBeNull();
    expect(team.engineers[0]?.costPerHourForSatisfactory).toBeNull();
  });

  test('evaluates within-limit, raised, partial, and admin approval outcomes', () => {
    const settings = DEFAULT_EFFICIENCY_SETTINGS;
    const within = evaluateApproval(800, 'unknown', 20, settings);
    expect(within.status).toBe('within-limit');
    expect(within.effectiveLimit).toBe(800);

    const raised = evaluateApproval(3000, 'healthy', 30, settings);
    expect(raised.status).toBe('auto-raised');
    expect(raised.autoApproved).toBe(2000);
    expect(raised.pendingAdmin).toBe(0);

    const partial = evaluateApproval(8000, 'satisfactory', 80, settings);
    expect(partial.status).toBe('auto-raised-partial');
    expect(partial.autoApproved).toBe(5000);
    expect(partial.pendingAdmin).toBe(2000);
    expect(partial.effectiveLimit).toBe(6000);

    const needsReview = evaluateApproval(3000, 'needs-improvement', 30, settings);
    expect(needsReview.status).toBe('admin-review');
    expect(needsReview.autoApproved).toBe(0);
    expect(needsReview.pendingAdmin).toBe(2000);
    expect(evaluateApproval(3000, 'unknown', 30, settings).status).toBe('admin-review');
    const belowBaseCeiling = evaluateApproval(1500, 'healthy', 15, { ...settings, autoApproveCeiling: 500 });
    expect(belowBaseCeiling.effectiveLimit).toBe(1000);
    expect(belowBaseCeiling.pendingAdmin).toBe(500);
  });

  test('round-trips cost per productive hour for a target score and handles unreachable targets', () => {
    const settings = DEFAULT_EFFICIENCY_SETTINGS;
    const target = 60;
    const volumeRating = 0.4;
    const costPerHour = costPerHourForTargetScore(target, volumeRating, settings);
    expect(costPerHour).not.toBeNull();

    const efficiencyRating = saturatingRating(settings.benchmarkCostPerHour / (costPerHour ?? 1), 1);
    const score = computeEfficiencyScore(efficiencyRating, volumeRating).score;
    expect(Math.abs(score - target)).toBeLessThanOrEqual(1);
    expect(costPerHourForTargetScore(0, volumeRating, settings)).toBeNull();
    expect(costPerHourForTargetScore(100, volumeRating, settings)).toBeNull();
  });

  test('summarizes team totals and handles zero spend', () => {
    const team = calculateTeamEfficiency(SAMPLE_TEAM);
    expect(team.totalSpend).toBe(19_956);
    expect(team.totalProductiveHours).toBe(329.8);
    expect(team.totalValue).toBe(32_980);
    expect(team.gradeCounts).toEqual({
      healthy: 1,
      satisfactory: 2,
      'needs-improvement': 1,
      unknown: 0,
    });
    expect(team.averageScore).toBe(58);
    expect(team.autoApprovedSpend).toBe(5080);
    expect(team.pendingAdminSpend).toBe(11_700);
    expect(team.adminQueueCount).toBe(1);
    expect(team.hoursUnlocked).toBeGreaterThan(0);

    const zeroSpend = evaluateEngineer(
      { id: 'free', name: 'Free usage', monthlySpend: 0, sessionsPerMonth: 6, usefulRate: 1, hoursPerUsefulSession: 1 },
      DEFAULT_EFFICIENCY_SETTINGS,
    );
    expect(zeroSpend.efficiencyRating).toBe(1);
    expect(zeroSpend.costPerProductiveHour).toBe(0);
    expect(zeroSpend.roiMultiple).toBeNull();
    expect(zeroSpend.approval.hoursUnderBlanketCap).toBe(zeroSpend.productiveHours);
  });

  test('uses only known grades in the team average', () => {
    const unknownGrade: EfficiencyGrade = gradeForScore(80, DEFAULT_EFFICIENCY_SETTINGS, false);
    expect(unknownGrade).toBe('unknown');
    expect(
      calculateTeamEfficiency([
        { id: 'new', name: 'New', monthlySpend: 0, sessionsPerMonth: 1, usefulRate: 1, hoursPerUsefulSession: 1 },
      ]).averageScore,
    ).toBeNull();
  });
});
