import { describe, expect, it } from "vitest";
import { suggestNextWithContext } from "../src/lib/protocol";
import { mergeSessionWithDerivedFields, normalizeSession } from "../src/features/app/storage";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("mergeSessionWithDerivedFields", () => {
  it("recomputes duration-dependent fields for calm sessions", () => {
    const updated = mergeSessionWithDerivedFields({
      id: "sess-1",
      date: daysAgo(0),
      plannedDuration: 60,
      actualDuration: 60,
      distressLevel: "none",
      belowThreshold: true,
      latencyToFirstDistress: 60,
      result: "success",
      distressType: "none",
      recoverySeconds: 0,
    }, { actualDuration: 45 });

    expect(updated.actualDuration).toBe(45);
    expect(updated.belowThreshold).toBe(false);
    expect(updated.latencyToFirstDistress).toBe(45);
    expect(updated.result).toBe("success");
    expect(updated.distressType).toBe("none");
    expect(updated.recoverySeconds).toBe(0);
  });

  it("clamps stored latency for distress sessions when duration is shortened", () => {
    const updated = mergeSessionWithDerivedFields({
      id: "sess-2",
      date: daysAgo(0),
      plannedDuration: 90,
      actualDuration: 80,
      distressLevel: "active",
      belowThreshold: false,
      latencyToFirstDistress: 70,
      result: "distress",
      distressType: "barking",
    }, { actualDuration: 30 });

    expect(updated.actualDuration).toBe(30);
    expect(updated.belowThreshold).toBe(false);
    expect(updated.latencyToFirstDistress).toBe(30);
    expect(updated.result).toBe("distress");
    expect(updated.distressSeverity).toBe("active");
    expect(updated.distressType).toBe("barking");
  });
});

describe("edited sessions and target recomputation", () => {
  it("changes the recommended target when the latest session duration no longer meets threshold", () => {
    const sessions = [
      {
        id: "sess-old",
        date: daysAgo(1),
        plannedDuration: 60,
        actualDuration: 60,
        distressLevel: "none",
        belowThreshold: true,
        latencyToFirstDistress: 60,
        result: "success",
      },
      {
        id: "sess-last",
        date: daysAgo(0),
        plannedDuration: 70,
        actualDuration: 70,
        distressLevel: "none",
        belowThreshold: true,
        latencyToFirstDistress: 70,
        result: "success",
      },
    ];

    const baselineTarget = suggestNextWithContext(sessions, [], [], { goalSeconds: 3600 });
    const editedSessions = [
      sessions[0],
      mergeSessionWithDerivedFields(sessions[1], { actualDuration: 40 }),
    ];
    const editedTarget = suggestNextWithContext(editedSessions, [], [], { goalSeconds: 3600 });

    expect(baselineTarget).toBeGreaterThan(editedTarget);
  });
});

describe("duration normalization", () => {
  it("normalizes mixed-unit legacy session rows to canonical seconds", () => {
    const normalized = normalizeSession({
      id: "legacy-1",
      date: daysAgo(0),
      duration: 32,
      duration_seconds: 1920,
      planned_duration: 1920,
      distress_level: "none",
      result: "success",
    });

    expect(normalized.actualDuration).toBe(1920);
    expect(normalized.plannedDuration).toBe(1920);
  });

  it("keeps known distress rows when distressLevel is missing but result is distress", () => {
    const normalized = normalizeSession({
      id: "legacy-distress-only-result",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 40,
      result: "distress",
    });

    expect(normalized.distressLevel).toBe("active");
  });

  it("uses explicit distress level when result is missing", () => {
    const normalized = normalizeSession({
      id: "legacy-missing-result",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 80,
      distress_level: "mild",
    });

    expect(normalized.distressLevel).toBe("subtle");
  });

  it("defaults malformed rows with both distressLevel and result missing to no-distress", () => {
    const normalized = normalizeSession({
      id: "legacy-missing-both",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 80,
    });

    expect(normalized.distressLevel).toBe("none");
  });

  it("preserves known legacy distress aliases", () => {
    const normalized = normalizeSession({
      id: "legacy-alias",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 40,
      distress_level: "strong",
      result: "distress",
    });

    expect(normalized.distressLevel).toBe("active");
  });

  it("preserves known success rows", () => {
    const normalized = normalizeSession({
      id: "legacy-success",
      date: daysAgo(0),
      plannedDuration: 120,
      actualDuration: 120,
      result: "success",
    });

    expect(normalized.distressLevel).toBe("none");
  it("infers belowThreshold when explicit field is missing", () => {
    const normalized = normalizeSession({
      id: "legacy-2",
      date: daysAgo(0),
      planned_duration: 120,
      actual_duration: 120,
      distress_level: "none",
      result: "success",
    });

    expect(normalized.belowThreshold).toBe(true);
  });
});
