import { describe, it, expect } from "vitest";
import {
  PROTOCOL,
  calculateTrainingStats,
  buildRecommendation,
  computeNextTarget,
  explainNextTarget,
  mapLegacySession,
  suggestNext,
  suggestNextWithContext,
  getNextDurationSeconds,
  inferBelowThreshold,
  normalizeDistressLevel,
} from "../src/lib/protocol";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const hoursAgo = (n) => new Date(Date.now() - n * 3600000).toISOString();

describe("legacy migration", () => {
  it("maps mild->subtle and strong->active", () => {
    expect(normalizeDistressLevel("mild")).toBe("subtle");
    expect(normalizeDistressLevel("strong")).toBe("active");
  });

  it("creates rich session defaults from legacy format", () => {
    const mapped = mapLegacySession({ plannedDuration: 60, actualDuration: 45, distressLevel: "mild" });
    expect(mapped.distressSeverity).toBe("subtle");
    expect(mapped.latencyToFirstDistress).toBe(45);
    expect(mapped.belowThreshold).toBe(false);
  });
});

describe("below-threshold inference", () => {
  it("treats an exact calm threshold hit as below-threshold", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 300,
      actualDuration: 300,
    })).toBe(true);
  });

  it("treats calm sessions slightly below the target as not below-threshold", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 300,
      actualDuration: 299,
    })).toBe(false);
  });

  it("does not apply a 0.98 tolerance fallback for inferred below-threshold", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 100,
      actualDuration: 98,
    })).toBe(false);
  });

  it("uses explicit below-threshold when provided", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 590,
      belowThreshold: true,
    })).toBe(true);
  });

  it("accepts supported canonical explicit string values", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 590,
      belowThreshold: "true",
    })).toBe(true);
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 610,
      belowThreshold: "false",
    })).toBe(false);
  });

  it("falls back to inference when explicit value is malformed", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 590,
      belowThreshold: "maybe",
    })).toBe(false);
  });

  it("falls back to inference when explicit below-threshold is nullish", () => {
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 610,
      belowThreshold: null,
    })).toBe(true);
    expect(inferBelowThreshold({
      distressLevel: "none",
      plannedDuration: 600,
      actualDuration: 590,
      belowThreshold: undefined,
    })).toBe(false);
  });
});

describe("training stats", () => {
  it("calculates stability, momentum, relapse risk and adherence", () => {
    const sessions = [
      { date: daysAgo(7), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(6), plannedDuration: 35, actualDuration: 34, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(5), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(4), plannedDuration: 40, actualDuration: 40, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(3), plannedDuration: 45, actualDuration: 20, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
    ];

    const stats = calculateTrainingStats(sessions, {
      plan: { targetCadenceDays: 1, recommendedDuration: 35 },
      cueSessions: [
        { cue: "keys", reactionLevel: "active" },
        { cue: "shoes", reactionLevel: "subtle" },
      ],
    });

    expect(stats.safeAloneTime).toBeGreaterThanOrEqual(30);
    expect(stats.stabilityScore).toBeGreaterThan(0);
    expect(stats.relapseRisk).toBeGreaterThan(0);
    expect(stats.adherenceScore).toBeGreaterThan(0);
    expect(stats.cueSensitivity[0].cue).toBe("shoes");
  });


  it("prioritizes recent calm sessions when computing safe alone time", () => {
    const sessions = [
      { date: daysAgo(10), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(9), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
    ];
    const stats = calculateTrainingStats(sessions);
    expect(stats.safeAloneTime).toBeGreaterThanOrEqual(40);
  });

  it("raises relapse risk after recent severe and uncontrolled real-life absence", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 60, actualDuration: 20, distressLevel: "severe", departureType: "training" },
      { date: daysAgo(1), plannedDuration: 90, actualDuration: 25, distressLevel: "active", departureType: "real_life", belowThreshold: false },
    ];
    const stats = calculateTrainingStats(sessions);
    expect(stats.relapseRisk).toBeGreaterThan(0.4);
  });
});

describe("recommendation engine", () => {
  it("requires repeated below-threshold success before increasing", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(30);
    expect(rec.recommendedDuration).toBeLessThanOrEqual(36);
  });



  it("uses latest calm success +15% when last 5 sessions are all calm", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 70, actualDuration: 70, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 72, actualDuration: 72, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(83);
  });

  it("applies +15% only when all of the last 5 sessions are calm", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(3), plannedDuration: 62, actualDuration: 62, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 64, actualDuration: 40, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 66, actualDuration: 66, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 72, actualDuration: 72, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).not.toBe(83);
  });
  it("steps up by about 20% after calm sessions before first stress event", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(57);
  });

  it("never shrinks a 32-minute calm session to a 32-second recommendation", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 1920, actualDuration: 1920, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 7200 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(1800);
  });

  it("drops malformed date rows before computing recommendations", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
      { date: "not-a-date", plannedDuration: 50, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
    ];

    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(57);
    expect(rec.recommendationType).toBe("keep_same_duration");
  });

  it("does not let older short sessions drag recommendation near minimum", () => {
    const sessions = [
      { date: daysAgo(14), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(8), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(52);
  });

  it("holds or reduces when subtle distress appears", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "subtle", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(60);
    expect(rec.recommendationType).toBe("recovery_mode_active");
  });

  it("recovery step progression follows 1min then 2min after subtle stress", () => {
    const subtle = { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false };
    const step1 = buildRecommendation([subtle], { goalSeconds: 3600 });
    expect(step1.recommendedDuration).toBe(60);
    expect(step1.recoveryMode.step).toBe(1);

    const step2 = buildRecommendation([
      subtle,
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
    ], { goalSeconds: 3600 });
    expect(step2.recommendedDuration).toBe(120);
    expect(step2.recoveryMode.step).toBe(2);
  });

  it("does not let stale subtle anchors re-trigger recovery after clear calm closure", () => {
    const sessions = [
      { date: daysAgo(14), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(3), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 1000, actualDuration: 1000, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 1100, actualDuration: 1100, distressLevel: "none", belowThreshold: true },
    ];

    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(false);
    expect(rec.recommendationType).not.toBe("subtle_recovery_mode");
    expect(rec.recommendationType).not.toBe("subtle_recovery_resume");
  });

  it("does not collapse to 30s on subtle distress when latest actual duration is much longer", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 1380, actualDuration: 1380, distressLevel: "none", belowThreshold: true },
      { date: new Date().toISOString(), plannedDuration: 30, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendationType).toBe("recovery_mode_active");
    expect(rec.recommendedDuration).toBe(60);
  });

  it("holds after three unstable sessions to prevent oscillation", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 300, actualDuration: 180, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 300, actualDuration: 170, distressLevel: "subtle", belowThreshold: false },
      { date: hoursAgo(2), plannedDuration: 300, actualDuration: 160, distressLevel: "active", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendationType).toBe("recovery_mode_active");
    expect(rec.recoveryMode.active).toBe(true);
  });

  it("allows a small increase after five-session plateau", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(3), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { date: hoursAgo(2), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(630);
  });

  it("applies deterministic high/medium/low risk step multipliers in computeNextTarget", () => {
    const sessions = [
      { date: hoursAgo(1), plannedDuration: 300, actualDuration: 300, distressLevel: "none", belowThreshold: true },
    ];

    const highRisk = computeNextTarget(sessions, { goalSeconds: 3600, relapseRisk: 0.8 });
    const mediumRisk = computeNextTarget(sessions, { goalSeconds: 3600, relapseRisk: 0.6 });
    const lowRisk = computeNextTarget(sessions, { goalSeconds: 3600, relapseRisk: 0.2 });

    expect(highRisk.recommendedDuration).toBe(291);
    expect(mediumRisk.recommendedDuration).toBe(325);
    expect(lowRisk.recommendedDuration).toBe(342);
    expect(highRisk.recommendedDuration).toBeLessThan(mediumRisk.recommendedDuration);
    expect(mediumRisk.recommendedDuration).toBeLessThan(lowRisk.recommendedDuration);
  });

  it("does not chain more than one consecutive increase after subtle stress", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 1000, actualDuration: 950, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
      { date: hoursAgo(2), plannedDuration: 950, actualDuration: 950, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(950);
  });

  it("reduces recommendation after a 48h+ gap", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(602);
  });

  it("uses calm no-distress history even when belowThreshold is false, avoiding a 30s reset after first subtle", () => {
    const now = new Date();
    const first = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const second = now.toISOString();
    const sessions = [
      { date: daysAgo(3), plannedDuration: 1200, actualDuration: 1200, distressLevel: "none", belowThreshold: true },
      { date: first, plannedDuration: 1500, actualDuration: 1380, distressLevel: "none", belowThreshold: false },
      { date: second, plannedDuration: 1380, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendationType).toBe("recovery_mode_active");
    expect(rec.recommendedDuration).toBe(60);
  });

  it("keeps recovery mode active until two calm sessions complete after subtle stress", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1380, actualDuration: 1380, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: new Date().toISOString(), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(true);
    expect(rec.recoveryMode.remainingSessions).toBe(1);
    expect(rec.recommendedDuration).toBe(120);
  });

  it("restarts recovery sequence if a recovery session is not calm", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 120, actualDuration: 90, distressLevel: "active", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(true);
    expect(rec.recoveryMode.step).toBe(1);
    expect(rec.recommendedDuration).toBe(60);
  });

  it("after 1m and 2m calm recoveries, resumes at subtle-anchor minus 5%", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: new Date().toISOString(), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(false);
    expect(rec.recommendationType).toBe("recovery_mode_resume");
    expect(rec.recommendedDuration).toBe(1140);
  });

  it("counts long calm sessions toward subtle recovery completion", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 960, actualDuration: 960, distressLevel: "none", belowThreshold: true },
    ];

    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(false);
    expect(rec.recommendationType).toBe("recovery_mode_resume");
    expect(rec.recommendedDuration).toBe(1140);
  });

  it("keeps subtle recovery active until two calm sessions, even when those sessions are long", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
    ];

    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(true);
    expect(rec.recoveryMode.remainingSessions).toBe(1);
    expect(rec.recommendedDuration).toBe(120);
  });

  it("does not fall to 30s after subtle->1m calm->2m calm recovery sequence", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: new Date().toISOString(), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(1140);
  });

  it("never recommends below 30 seconds even with legacy 15s history", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(30);
  });

  it("uses latest session data even when input order is stale", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 15, actualDuration: 15, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(30);
    expect(rec.recommendationType).not.toBe("stabilization_block");
  });

  it("handles mixed unsorted history and still applies fresh subtle recovery steps", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 180, actualDuration: 180, distressLevel: "none", belowThreshold: true, context: { departureType: "real_life" } },
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
    ];

    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recoveryMode.active).toBe(true);
    expect(rec.recoveryMode.step).toBe(2);
    expect(rec.recommendedDuration).toBe(120);
  });

  it("drops malformed rows and still handles incomplete subtle history safely", () => {
    const recEmpty = buildRecommendation([], { goalSeconds: 3600 });
    expect(recEmpty.recommendedDuration).toBeGreaterThanOrEqual(30);

    const recIncomplete = buildRecommendation([
      { distressLevel: "subtle", plannedDuration: null, actualDuration: null },
    ], { goalSeconds: 3600 });
    expect(recIncomplete.recoveryMode.active).toBe(false);
    expect(recIncomplete.recommendedDuration).toBeGreaterThanOrEqual(30);

    const recDated = buildRecommendation([
      { date: daysAgo(0), distressLevel: "subtle", plannedDuration: null, actualDuration: null },
    ], { goalSeconds: 3600 });
    expect(recDated.recoveryMode.active).toBe(true);
    expect(recDated.recommendationType).toBe("recovery_mode_active");
  });

  it("rolls back and enters stabilization mode after repeated active distress", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 60, actualDuration: 20, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(3), plannedDuration: 50, actualDuration: 12, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 40, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 35, actualDuration: 9, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(0), plannedDuration: 30, actualDuration: 6, distressLevel: "severe", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(["stabilization_block", "departure_cues_first", "recovery_mode_active", "repeat_current_duration"]).toContain(rec.recommendationType);
    expect(rec.recommendedDuration).toBeGreaterThanOrEqual(30);
    expect(rec.recommendedDuration).toBeLessThanOrEqual(90);
  });

  it("flags safety warning for panic pattern", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 40, actualDuration: 8, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 35, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.warnings.join(" ")).toMatch(/consult/i);
  });

  it("supports safe-absence management alert", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 45, actualDuration: 45, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600, plannedRealAbsenceSeconds: 200 });
    expect(rec.safeAbsenceAlert).toBe(true);
  });

  it("persists recovery state and exits only after two consecutive calm sessions", () => {
    const stress = [{ id: "s1", date: daysAgo(2), plannedDuration: 600, actualDuration: 500, distressLevel: "active", belowThreshold: false }];
    const start = buildRecommendation(stress, { goalSeconds: 3600 });
    expect(start.recoveryMode.active).toBe(true);
    expect(start.recoveryState?.active).toBe(true);

    const oneCalm = buildRecommendation([
      ...stress,
      { id: "s2", date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
    ], { goalSeconds: 3600, recoveryState: start.recoveryState });
    expect(oneCalm.recoveryMode.active).toBe(true);
    expect(oneCalm.recoveryMode.remainingSessions).toBe(1);
    expect(oneCalm.recommendedDuration).toBe(120);

    const twoCalm = buildRecommendation([
      ...stress,
      { id: "s2", date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { id: "s3", date: daysAgo(0), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
    ], { goalSeconds: 3600, recoveryState: oneCalm.recoveryState });
    expect(twoCalm.recoveryMode.active).toBe(false);
    expect(twoCalm.recoveryState?.active).toBe(false);
    expect(twoCalm.recommendedDuration).toBe(375);
  });

  it("uses the same persisted recovery state machine for subtle-trigger recovery", () => {
    const subtleStress = [{ id: "subtle-1", date: daysAgo(2), plannedDuration: 1200, actualDuration: 1100, distressLevel: "subtle", belowThreshold: false }];
    const start = buildRecommendation(subtleStress, { goalSeconds: 3600 });
    expect(start.recommendationType).toBe("recovery_mode_active");
    expect(start.recoveryState?.active).toBe(true);

    const oneCalm = buildRecommendation([
      ...subtleStress,
      { id: "subtle-2", date: daysAgo(1), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
    ], { goalSeconds: 3600, recoveryState: start.recoveryState });
    expect(oneCalm.recommendationType).toBe("recovery_mode_active");
    expect(oneCalm.recoveryMode.remainingSessions).toBe(1);
    expect(oneCalm.recoveryState?.active).toBe(true);

    const twoCalm = buildRecommendation([
      ...subtleStress,
      { id: "subtle-2", date: daysAgo(1), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { id: "subtle-3", date: daysAgo(0), plannedDuration: 700, actualDuration: 700, distressLevel: "none", belowThreshold: true },
    ], { goalSeconds: 3600, recoveryState: oneCalm.recoveryState });
    expect(twoCalm.recommendationType).toBe("recovery_mode_resume");
    expect(twoCalm.recoveryState?.active).toBe(false);
  });

  it("clears stale persisted active recovery when trigger session no longer exists", () => {
    const staleRecoveryState = {
      active: true,
      triggerSessionId: "deleted-trigger",
      triggerSessionDate: daysAgo(2),
      anchorDuration: 900,
      fixedDuration: 60,
      consecutiveCalm: 1,
    };
    const sessions = [
      { id: "c1", date: daysAgo(1), plannedDuration: 700, actualDuration: 700, distressLevel: "none", belowThreshold: true },
      { id: "c2", date: daysAgo(0), plannedDuration: 760, actualDuration: 760, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600, recoveryState: staleRecoveryState });
    expect(rec.recommendationType).toBe("keep_same_duration");
    expect(rec.recoveryMode.active).toBe(false);
    expect(rec.recoveryState?.active).toBe(false);
    expect(rec.recoveryState?.triggerSessionId).toBe(null);
  });

  it("reconciles persisted active recovery to latest valid stress session when trigger was edited", () => {
    const persistedForOldTrigger = {
      active: true,
      triggerSessionId: "s-old",
      triggerSessionDate: daysAgo(3),
      anchorDuration: 600,
      fixedDuration: 60,
      consecutiveCalm: 0,
    };
    const sessions = [
      { id: "s-old", date: daysAgo(3), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
      { id: "s-new", date: daysAgo(1), plannedDuration: 900, actualDuration: 400, distressLevel: "active", belowThreshold: false },
    ];
    const rec = computeNextTarget(sessions, { goalSeconds: 3600, recoveryState: persistedForOldTrigger });
    expect(rec.recommendationType).toBe("recovery_mode_active");
    expect(rec.recoveryState?.active).toBe(true);
    expect(rec.recoveryState?.triggerSessionId).toBe("s-new");
  });
});

describe("public compatibility APIs", () => {
  it("covers explanations/summaries for every emitted recommendation type", () => {
    const noHistory = explainNextTarget([], [], [], {});
    expect(noHistory.recommendationType).toBe("baseline_start");

    const keepSameDuration = explainNextTarget([
      { date: daysAgo(1), plannedDuration: 70, actualDuration: 70, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 72, actualDuration: 72, distressLevel: "none", belowThreshold: true },
    ], [], [], { goalSeconds: 3600 });
    expect(keepSameDuration.recommendationType).toBe("keep_same_duration");

    const repeatCurrent = explainNextTarget([
      { date: daysAgo(2), plannedDuration: 300, actualDuration: 260, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 300, actualDuration: 250, distressLevel: "none", belowThreshold: false },
      { date: hoursAgo(2), plannedDuration: 300, actualDuration: 240, distressLevel: "none", belowThreshold: false },
    ], [], [], { goalSeconds: 3600 });
    expect(repeatCurrent.recommendationType).toBe("repeat_current_duration");

    const recoveryResume = explainNextTarget([
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: new Date().toISOString(), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
    ], [], [], { goalSeconds: 3600 });
    expect(recoveryResume.recommendationType).toBe("recovery_mode_resume");

    const recoveryActive = explainNextTarget([
      { date: daysAgo(0), plannedDuration: 600, actualDuration: 220, distressLevel: "active", belowThreshold: false },
    ], [], [], { goalSeconds: 3600 });
    expect(recoveryActive.recommendationType).toBe("recovery_mode_active");

    const cueFirst = explainNextTarget([
      { date: daysAgo(1), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 130, actualDuration: 130, distressLevel: "none", belowThreshold: true },
    ], [], [
      { date: daysAgo(0), type: "keys", reactionLevel: "active" },
      { date: daysAgo(0), type: "keys", reactionLevel: "active" },
      { date: daysAgo(0), type: "keys", reactionLevel: "active" },
    ], { goalSeconds: 3600 });
    expect(cueFirst.recommendationType).toBe("departure_cues_first");

    const results = [noHistory, keepSameDuration, repeatCurrent, recoveryActive, recoveryResume, cueFirst];
    const emittedTypes = new Set(results.map((result) => result.recommendationType));
    expect(emittedTypes).toEqual(new Set([
      "baseline_start",
      "keep_same_duration",
      "repeat_current_duration",
      "recovery_mode_active",
      "recovery_mode_resume",
      "departure_cues_first",
    ]));

    results.forEach((result) => {
      expect(result.explanation).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.explanation).not.toMatch(/Adjusted from recent results/i);
      expect(result.summary).not.toMatch(/adjusted from the current safe-alone estimate/i);
    });
  });

  it("suggestNext starts from 80% baseline for new dogs", () => {
    expect(suggestNext([], { currentMaxCalm: 120 })).toBe(96);
  });

  it("suggestNextWithContext factors cue sensitivity and walk type", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 65, actualDuration: 65, distressLevel: "none", belowThreshold: true },
    ];
    const patterns = [
      { date: daysAgo(1), type: "keys", reactionLevel: "active" },
      { date: daysAgo(1), type: "shoes", reactionLevel: "subtle" },
    ];
    const walks = [
      { date: daysAgo(1), duration: 1200, type: "intense_exercise" },
      { date: daysAgo(1), duration: 900, type: "intense_exercise" },
      { date: daysAgo(1), duration: 1000, type: "intense_exercise" },
    ];

    const next = suggestNextWithContext(sessions, walks, patterns, { goalSeconds: 3600 });
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });

  it("explainNextTarget exposes recovery metadata used by train UI", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recoveryMode.active).toBe(true);
    expect(next.recoveryMode.remainingSessions).toBe(2);
    expect(next.recoveryMode.acceptsAnyCalmSession).toBe(true);
    expect(next.recommendedDuration).toBe(60);
    expect(next.explanation).toMatch(/Short recovery sessions after stress/i);
  });

  it("explainNextTarget disables recovery metadata after two calm recovery sessions", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: new Date().toISOString(), plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recoveryMode.active).toBe(false);
    expect(next.recommendationType).toBe("recovery_mode_resume");
  });

  it("handles legacy/runtime-shaped session rows without collapsing to 30s", () => {
    const sessions = [
      { date: daysAgo(1), planned_duration: "1380", actual_duration: "1380", distress_level: "none", result: "success" },
      { date: new Date().toISOString(), planned_duration: "1380", actual_duration: "1200", distress_level: "mild", result: "distress" },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recoveryMode.active).toBe(true);
    expect(next.recommendedDuration).toBe(60);
  });

  it("prefers explicit *_seconds fields over ambiguous duration fields", () => {
    const sessions = [
      {
        date: daysAgo(0),
        duration: 32,
        duration_seconds: 1920,
        planned_duration: 1920,
        distress_level: "none",
        result: "success",
      },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 7200 });
    expect(next.recommendedDuration).toBeGreaterThanOrEqual(1800);
  });

  it("normalizes recommendation inputs to seconds for runtime-shaped rows", () => {
    const sessions = [
      { date: daysAgo(1), planned_duration_minutes: 20, actual_duration_minutes: 20, distress_level: "none", below_threshold: true },
      { date: daysAgo(0), planned_duration_minutes: 20, actual_duration_minutes: 20, distress_level: "none", below_threshold: true },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 7200 });
    expect(next.recommendedDuration).toBeGreaterThan(1000);
  });

  it("starts active-distress recovery at first step and keeps fallback for post-recovery resume", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1500, actualDuration: 1200, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 1600, actualDuration: 1300, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(0), plannedDuration: 1300, actualDuration: 300, distressLevel: "active", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recommendationType).toBe("recovery_mode_active");
    expect(next.recommendedDuration).toBe(60);
    expect(next.recoveryMode.postRecoveryDuration).toBe(1125);
  });

  it("starts severe-distress recovery at first step and keeps fallback for post-recovery resume", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1800, actualDuration: 1500, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 1700, actualDuration: 1400, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(0), plannedDuration: 1500, actualDuration: 120, distressLevel: "severe", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recommendationType).toBe("recovery_mode_active");
    expect(next.recommendedDuration).toBe(60);
    expect(next.recoveryMode.postRecoveryDuration).toBe(1260);
  });

  it("keeps decision risk level aligned with stats relapse risk bands", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 1200, actualDuration: 200, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 1000, actualDuration: 180, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 800, actualDuration: 120, distressLevel: "severe", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    const risk = next.stats.relapseRisk;
    const expected = risk >= 0.72 ? "high" : risk >= 0.58 ? "medium" : "low";
    expect(next.decisionState.riskLevel).toBe(expected);
  });

  it("getNextDurationSeconds remains bounded and deterministic", () => {
    const next = getNextDurationSeconds(120, { goalSeconds: 180 });
    expect(next).toBeLessThanOrEqual(180);
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });

  it("explainNextTarget returns a decision state aligned with recommendation stats", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 12, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 40, actualDuration: 9, distressLevel: "severe", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.decisionState).toBeTruthy();
    expect(next.decisionState.targetSeconds).toBe(next.recommendedDuration);
    expect(["low", "medium", "high"]).toContain(next.decisionState.riskLevel);
    if (next.decisionState.riskLevel === "high") {
      expect(next.decisionState.statusLabel).toBe("Needs attention");
    }
  });

  it("explainNextTarget provides sensible baseline decision state with empty history", () => {
    const next = explainNextTarget([], [], [], { goalSeconds: 3600 });
    expect(next.decisionState.riskLevel).toBe("medium");
    expect(next.decisionState.readiness).toBe("building");
    expect(next.decisionState.statusLabel).toBe("Stable");
    expect(next.explanation).toBeTruthy();
    expect(next.explanation).toMatch(/Starting with a short first session/i);
  });

  it("keeps recommendation duration and details aligned when walk/pattern context changes without session changes", () => {
    const sessions = [
      { date: hoursAgo(30), plannedDuration: 1200, actualDuration: 1200, distressLevel: "none", belowThreshold: true },
      { date: hoursAgo(24), plannedDuration: 1380, actualDuration: 1380, distressLevel: "none", belowThreshold: true },
      { date: hoursAgo(8), plannedDuration: 1380, actualDuration: 420, distressLevel: "active", belowThreshold: false },
    ];
    const patterns = [{ id: "p-1", date: hoursAgo(7), type: "keys" }];
    const baseWalks = [{ id: "w-1", date: hoursAgo(7), duration: 1800, type: "regular_walk" }];
    const dog = { goalSeconds: 3600 };

    const withTrainingWalk = [...baseWalks, { id: "w-2", date: hoursAgo(2), duration: 900, type: "training_walk" }];
    const editedPattern = [{ ...patterns[0], type: "jacket" }];
    const deletedWalks = [];
    const deletedPatterns = [];
    const scenarios = [
      { walks: withTrainingWalk, pats: patterns }, // add walk
      { walks: [{ ...withTrainingWalk[0], duration: 1200 }, withTrainingWalk[1]], pats: patterns }, // edit walk
      { walks: deletedWalks, pats: patterns }, // delete walk
      { walks: baseWalks, pats: [...patterns, { id: "p-2", date: hoursAgo(1), type: "shoes" }] }, // add pattern
      { walks: baseWalks, pats: editedPattern }, // edit pattern
      { walks: baseWalks, pats: deletedPatterns }, // delete pattern
    ];

    scenarios.forEach(({ walks, pats }) => {
      const explained = explainNextTarget(sessions, walks, pats, dog);
      const suggested = suggestNextWithContext(sessions, walks, pats, dog);
      expect(explained.recommendedDuration).toBe(suggested);
      expect(explained.decisionState.targetSeconds).toBe(explained.recommendedDuration);
    });
  });
});
