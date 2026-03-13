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

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

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


  it("steps up by about 20% after calm sessions before first stress event", () => {
    const sessions = [
      { date: daysAgo(0), plannedDuration: 50, actualDuration: 50, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(60);
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
    expect(rec.recommendedDuration).toBeLessThanOrEqual(60);
    expect(["repeat_current_duration", "insert_easy_sessions", "departure_cues_first"]).toContain(rec.recommendationType);
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

  it("rolls back and enters stabilization mode after repeated active distress", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 60, actualDuration: 20, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(3), plannedDuration: 50, actualDuration: 12, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 40, actualDuration: 10, distressLevel: "severe", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 35, actualDuration: 9, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(0), plannedDuration: 30, actualDuration: 6, distressLevel: "severe", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(["stabilization_block", "departure_cues_first"]).toContain(rec.recommendationType);
    expect(rec.recommendedDuration).toBeLessThan(35);
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
});

describe("public compatibility APIs", () => {
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

  it("getNextDurationSeconds remains bounded and deterministic", () => {
    const next = getNextDurationSeconds(120, { goalSeconds: 180 });
    expect(next).toBeLessThanOrEqual(180);
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });
});
