import { describe, it, expect } from "vitest";
import {
  PROTOCOL,
  calculateTrainingStats,
  buildRecommendation,
  mapLegacySession,
  suggestNext,
  suggestNextWithContext,
  getNextDurationSeconds,
  normalizeDistressLevel,
} from "../src/lib/protocol";

const daysAgo = (n, hour = 10) => {
  const date = new Date(Date.now() - n * 86400000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

describe("migration compatibility", () => {
  it("maps legacy distress levels", () => {
    expect(normalizeDistressLevel("mild")).toBe("subtle");
    expect(normalizeDistressLevel("strong")).toBe("active");
    expect(normalizeDistressLevel("panic")).toBe("severe");
  });

  it("creates rich defaults and preserves legacy fields", () => {
    const mapped = mapLegacySession({ plannedDuration: 60, actualDuration: 45, distressLevel: "mild" });
    expect(mapped.distressSeverity).toBe("subtle");
    expect(mapped.latencyToFirstDistress).toBe(45);
    expect(mapped.feeding.offeredDuringSession).toBe(false);
    expect(mapped.walkContext.walkType).toBe("regular");
  });
});

describe("stats formulas", () => {
  it("calculates core progress and context metrics", () => {
    const sessions = [
      { date: daysAgo(8), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(7), plannedDuration: 35, actualDuration: 34, distressLevel: "subtle", belowThreshold: false, feeding: { offeredDuringSession: true, engagedDuringAbsence: true, ateAmount: "partially", latencyToStartEatingSec: 35 } },
      { date: daysAgo(6), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true, walkContext: { walkType: "sniffy_decompression" } },
      { date: daysAgo(5), plannedDuration: 40, actualDuration: 40, distressLevel: "none", belowThreshold: true, feeding: { offeredDuringSession: true, engagedDuringAbsence: true, ateAmount: "fully", latencyToStartEatingSec: 20 } },
      { date: daysAgo(4), plannedDuration: 40, actualDuration: 18, distressLevel: "active", belowThreshold: false, walkContext: { walkType: "intense_exercise" } },
      { date: daysAgo(3), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 36, actualDuration: 36, distressLevel: "none", belowThreshold: true },
    ];

    const stats = calculateTrainingStats(sessions, {
      plan: { targetCadenceDays: 1, recommendedDuration: 35 },
      cueSessions: [
        { cue: "keys", reactionLevel: "active" },
        { cue: "shoes", reactionLevel: "subtle" },
      ],
    });

    expect(stats.safeAloneTime).toBeGreaterThanOrEqual(30);
    expect(stats.stabilityScore).toBeGreaterThan(0.5);
    expect(stats.relapseRisk).toBeGreaterThanOrEqual(0);
    expect(stats.adherenceScore).toBeGreaterThan(0.5);
    expect(stats.foodEngagementUnderAbsence).toBeGreaterThan(0.5);
    expect(stats.dailyReadinessScore).toBeGreaterThan(0.45);
    expect(stats.cueSensitivity[0].cue).toBe("shoes");
  });

  it("raises relapse risk with severe events and uncontrolled real absences", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 60, actualDuration: 20, distressLevel: "severe", departureType: "training", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 50, actualDuration: 15, distressLevel: "active", departureType: "training", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 90, actualDuration: 25, distressLevel: "active", departureType: "real_life", belowThreshold: false },
    ];
    const stats = calculateTrainingStats(sessions);
    expect(stats.relapseRisk).toBeGreaterThan(0.55);
  });
});

describe("recommendation engine", () => {
  it("does not jump aggressively after one easy success", () => {
    const sessions = [{ date: daysAgo(1), plannedDuration: 45, actualDuration: 45, distressLevel: "none", belowThreshold: true }];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeLessThanOrEqual(47);
  });

  it("reduces or repeats after subtle stress", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 58, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressLevel: "subtle", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeLessThanOrEqual(60);
    expect(["repeat_current_step", "keep_same_duration", "avoid_training_under_conditions"]).toContain(rec.recommendationType);
  });

  it("enters stabilization block after repeated instability", () => {
    const sessions = [
      { date: daysAgo(5), plannedDuration: 60, actualDuration: 18, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(4), plannedDuration: 50, actualDuration: 14, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(3), plannedDuration: 45, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 35, actualDuration: 9, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 30, actualDuration: 8, distressLevel: "severe", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.progressionPhase).toBe("stabilization");
    expect(rec.stabilizationMode).toBe(true);
    expect(rec.recommendedDuration).toBeLessThan(30);
  });

  it("inserts easy session on periodic cadence", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 40, actualDuration: 40, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(3), plannedDuration: 41, actualDuration: 41, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2), plannedDuration: 42, actualDuration: 42, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 43, actualDuration: 43, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(["insert_easy_sessions", "keep_same_duration"]).toContain(rec.recommendationType);
  });

  it("builds readiness and scheduler guidance", () => {
    const sessions = [
      { date: daysAgo(6, 8), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(5, 8), plannedDuration: 36, actualDuration: 36, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(4, 18), plannedDuration: 36, actualDuration: 20, distressLevel: "active", belowThreshold: false, dailyLoad: { noisyDay: true } },
      { date: daysAgo(3, 8), plannedDuration: 37, actualDuration: 37, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(2, 8), plannedDuration: 37, actualDuration: 37, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1, 18), plannedDuration: 37, actualDuration: 19, distressLevel: "active", belowThreshold: false, dailyLoad: { poorSleep: true } },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.scheduler.bestTimeOfDayWindow).toBeTruthy();
    expect(rec.scheduler.worstTimeOfDayWindow).toBeTruthy();
    expect(["low", "moderate", "high"]).toContain(rec.scheduler.dailyReadinessBand);
  });

  it("flags safe-absence alerts and severe warnings", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 45, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 45, actualDuration: 11, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 45, actualDuration: 44, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600, plannedRealAbsenceSeconds: 300 });
    expect(rec.safeAbsenceAlert).toBe(true);
    expect(rec.warnings.join(" ")).toMatch(/consult/i);
  });

  it("prioritizes cue work when cue sensitivity is high", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 32, actualDuration: 32, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, {
      goalSeconds: 3600,
      cueSessions: [
        { cue: "keys", reactionLevel: "severe" },
        { cue: "keys", reactionLevel: "active" },
        { cue: "door", reactionLevel: "severe" },
      ],
    });
    expect(rec.recommendationType).toBe("prioritize_cue_work_first");
  });
});

describe("public compatibility APIs", () => {
  it("suggestNext starts from 80% baseline for new dogs", () => {
    expect(suggestNext([], { currentMaxCalm: 120 })).toBe(96);
  });

  it("suggestNextWithContext uses walk-context as correlation", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 60, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 65, actualDuration: 65, distressLevel: "none", belowThreshold: true },
    ];
    const patterns = [{ date: daysAgo(1), type: "keys", reactionLevel: "active" }];
    const walks = [
      { date: daysAgo(1), duration: 1200, type: "intense_exercise" },
      { date: daysAgo(1), duration: 900, type: "intense_exercise" },
      { date: daysAgo(1), duration: 1000, type: "intense_exercise" },
    ];

    const next = suggestNextWithContext(sessions, walks, patterns, { goalSeconds: 3600 });
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });

  it("getNextDurationSeconds remains bounded", () => {
    const next = getNextDurationSeconds(120, { goalSeconds: 180 });
    expect(next).toBeLessThanOrEqual(180);
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });
});
