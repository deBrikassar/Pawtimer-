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
import { canonicalDogId, buildSupabaseUpsert, mergeRemoteFirst } from "../src/lib/sync";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("migration compatibility", () => {
  it("maps legacy distress labels and new session fields", () => {
    expect(normalizeDistressLevel("mild")).toBe("subtle");
    expect(normalizeDistressLevel("strong")).toBe("active");

    const mapped = mapLegacySession({ plannedDuration: 60, actualDuration: 45, distressLevel: "mild" });
    expect(mapped.distressSeverity).toBe("subtle");
    expect(mapped.latency_to_first_stress).toBe(45);
    expect(mapped.below_threshold).toBe(false);
    expect(mapped.rating_confidence).toBeGreaterThan(0);
  });
});

describe("cross-device synchronization helpers", () => {
  it("canonicalizes dog id and upserts by primary key", () => {
    expect(canonicalDogId(" luna-1234 ")).toBe("LUNA-1234");

    const upsert = buildSupabaseUpsert("session", "luna-1234", {
      id: "s1",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 100,
      belowThreshold: false,
      latencyToFirstStress: 40,
      distressSeverity: "active",
      distressType: "active",
      ratingConfidence: 0.9,
    });

    expect(upsert.table).toBe("sessions");
    expect(upsert.conflictTarget).toBe("id");
    expect(upsert.payload.dog_id).toBe("LUNA-1234");
  });

  it("keeps server rows authoritative while merging", () => {
    const merged = mergeRemoteFirst(
      [{ id: "s1", date: daysAgo(0), actualDuration: 40 }, { id: "local-only", date: daysAgo(1), actualDuration: 25 }],
      [{ id: "s1", date: daysAgo(0), actualDuration: 90 }],
    );

    expect(merged.find((s) => s.id === "s1").actualDuration).toBe(90);
    expect(merged.some((s) => s.id === "local-only")).toBe(true);
  });
});

describe("training progression and relapse", () => {
  it("requires multiple stable sessions before progression", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 30, actualDuration: 30, distressSeverity: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 30, actualDuration: 30, distressSeverity: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeLessThanOrEqual(33);
  });

  it("triggers stabilization mode on repeated distress", () => {
    const sessions = [
      { date: daysAgo(3), plannedDuration: 70, actualDuration: 20, distressSeverity: "active", belowThreshold: false },
      { date: daysAgo(2), plannedDuration: 60, actualDuration: 12, distressSeverity: "severe", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 55, actualDuration: 10, distressSeverity: "active", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeLessThan(55);
    expect(["stabilization_mode", "reduce_duration", "avoid_training_today"]).toContain(rec.recommendationType);
  });
});

describe("readiness + context correlations + statistics", () => {
  it("calculates readiness, feeding, walk and cue metrics", () => {
    const sessions = [
      { date: daysAgo(4), plannedDuration: 60, actualDuration: 60, distressSeverity: "none", belowThreshold: true, context: { timeOfDay: "morning" } },
      { date: daysAgo(3), plannedDuration: 60, actualDuration: 55, distressSeverity: "subtle", belowThreshold: false, context: { timeOfDay: "morning" } },
      { date: daysAgo(2), plannedDuration: 55, actualDuration: 55, distressSeverity: "none", belowThreshold: true, context: { timeOfDay: "afternoon" } },
      { date: daysAgo(1), plannedDuration: 55, actualDuration: 50, distressSeverity: "none", belowThreshold: true, context: { timeOfDay: "morning" } },
    ];

    const stats = calculateTrainingStats(sessions, {
      feedingEvents: [
        { eatenDuringSession: "yes", latencyToStartEating: 12, stoppedEatingWhenOwnerLeft: false },
        { eatenDuringSession: "partial", latencyToStartEating: 50, stoppedEatingWhenOwnerLeft: false },
      ],
      walks: [
        { walkType: "sniffy_decompression", intensity: 2, duration: 1800 },
        { walkType: "intense_exercise", intensity: 5, duration: 1200 },
      ],
      dailyContext: [{ visitors: true, noisyEnvironment: false, poorSleep: false }],
      cueSessions: [{ cue: "keys", reactionLevel: "active" }, { cue: "coat", reactionLevel: "subtle" }],
      plan: { targetCadenceDays: 1, recommendedDuration: 55 },
    });

    expect(stats.safeAloneTime).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
    expect(stats.foodEngagementUnderAbsence).toBeGreaterThan(0);
    expect(stats.dailyReadinessScore).toBeGreaterThan(0);
    expect(stats.readiness.bestTimeOfDay).toBe("afternoon");
    expect(stats.cueSensitivity.length).toBe(2);
  });

  it("includes safe absence management in recommendation output", () => {
    const sessions = [{ date: daysAgo(1), plannedDuration: 40, actualDuration: 40, distressSeverity: "none", belowThreshold: true }];
    const rec = buildRecommendation(sessions, { goalSeconds: 1200, plannedRealAbsenceSeconds: 240 });
    expect(rec.safeAbsenceAlert).toBe(true);
    expect(rec.warnings.join(" ")).toMatch(/exceeds current safe duration/i);
  });
});

describe("compatibility APIs", () => {
  it("returns bounded next durations", () => {
    expect(suggestNext([], { currentMaxCalm: 120 })).toBe(96);
    expect(getNextDurationSeconds(120, { goalSeconds: 180 })).toBeLessThanOrEqual(180);
  });

  it("uses contextual APIs without throwing", () => {
    const next = suggestNextWithContext(
      [{ date: daysAgo(1), plannedDuration: 60, actualDuration: 60, distressSeverity: "none", belowThreshold: true }],
      [{ date: daysAgo(1), duration: 1200, walkType: "regular_walk", intensity: 2 }],
      [{ date: daysAgo(1), type: "keys", reactionLevel: "subtle" }],
      { goalSeconds: 3600, feedingEvents: [{ eatenDuringSession: "yes" }], dailyContext: [{ visitors: false }] },
    );
    expect(next).toBeGreaterThanOrEqual(PROTOCOL.minDurationSeconds);
  });
});
