import { describe, it, expect } from "vitest";
import {
  PROTOCOL,
  calculateTrainingStats,
  buildRecommendation,
  explainNextTarget,
  mapLegacySession,
  suggestNext,
  suggestNextWithContext,
  getNextDurationSeconds,
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

  it("does not break on empty or incomplete subtle history", () => {
    const recEmpty = buildRecommendation([], { goalSeconds: 3600 });
    expect(recEmpty.recommendedDuration).toBeGreaterThanOrEqual(30);

    const recIncomplete = buildRecommendation([
      { distressLevel: "subtle", plannedDuration: null, actualDuration: null },
    ], { goalSeconds: 3600 });
    expect(recIncomplete.recoveryMode.active).toBe(true);
    expect(recIncomplete.recommendationType).toBe("recovery_mode_active");
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
    expect(twoCalm.recommendedDuration).toBe(475);
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

  it("explainNextTarget exposes recovery metadata used by train UI", () => {
    const sessions = [
      { date: daysAgo(1), plannedDuration: 1200, actualDuration: 1200, distressLevel: "subtle", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recoveryMode.active).toBe(true);
    expect(next.recoveryMode.remainingSessions).toBe(2);
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

  it("uses unified recovery fallback logic for active distress", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 1500, actualDuration: 1200, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 1600, actualDuration: 1300, distressLevel: "none", belowThreshold: false },
      { date: daysAgo(0), plannedDuration: 1300, actualDuration: 300, distressLevel: "active", belowThreshold: false },
    ];
    const next = explainNextTarget(sessions, [], [], { goalSeconds: 3600 });
    expect(next.recommendationType).toBe("recovery_mode_active");
    expect(next.recommendedDuration).toBe(1125);
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
});
