import { describe, expect, it } from "vitest";
import { normalizeFeedings, normalizePatterns, normalizeSession } from "../src/features/app/storage";

describe("storage normalization", () => {
  it("keeps feeding revision/updatedAt non-null when provided", () => {
    const rows = normalizeFeedings([{
      id: "feeding-1",
      date: "2026-04-01T09:00:00.000Z",
      food_type: "meal",
      amount: "medium",
      revision: "12",
      updated_at: "2026-04-01T09:10:00.000Z",
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(12);
    expect(rows[0].updatedAt).toBe("2026-04-01T09:10:00.000Z");
  });

  it("keeps pattern revision/updatedAt non-null when provided", () => {
    const rows = normalizePatterns([{
      id: "pattern-1",
      date: "2026-04-01T08:00:00.000Z",
      type: "keys",
      revision: "7",
      updated_at: "2026-04-01T08:30:00.000Z",
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(7);
    expect(rows[0].updatedAt).toBe("2026-04-01T08:30:00.000Z");
  });

  it("does not default to distress when distress metadata is missing", () => {
    const session = normalizeSession({
      id: "s-missing-distress",
      result: "success",
      plannedDuration: 120,
      actualDuration: 120,
    });

    expect(session.distressLevel).toBe("none");
  });

  it("normalizes explicit distress result when distress level is missing", () => {
    const session = normalizeSession({
      id: "s-missing-level",
      result: "distress",
      plannedDuration: 120,
      actualDuration: 60,
    });

    expect(session.distressLevel).toBe("active");
  });

  it("defaults malformed rows with missing result and distress metadata to neutral", () => {
    const session = normalizeSession({
      id: "s-missing-both",
      plannedDuration: 120,
      actualDuration: 60,
    });

    expect(session.distressLevel).toBe("none");
  });

  it("keeps explicit known distress levels", () => {
    const session = normalizeSession({
      id: "s-explicit-severe",
      distressLevel: "severe",
      result: "distress",
    });

    expect(session.distressLevel).toBe("severe");
  });

  it("normalizes known legacy distress aliases", () => {
    const session = normalizeSession({
      id: "s-legacy-strong",
      distress_level: "strong",
      result: "distress",
    });

    expect(session.distressLevel).toBe("active");
    expect(session.distressSeverity).toBe("active");
  });

  it("keeps known success rows calm", () => {
    const session = normalizeSession({
      id: "s-success",
      result: "success",
      distressLevel: "none",
    });

    expect(session.distressLevel).toBe("none");
  });

  it("uses explicit distress metadata when result contradicts it", () => {
    const session = normalizeSession({
      id: "s-contradict",
      distressLevel: "severe",
      result: "success",
    });

    expect(session.distressLevel).toBe("severe");
    expect(session.distressSeverity).toBe("severe");
  });

  it("keeps malformed rows canonical and consistent", () => {
    const session = normalizeSession({
      id: "s-malformed-distress",
      distressLevel: "unknown-value",
      distressSeverity: "invalid-value",
      result: "not-a-real-result",
    });

    expect(session.distressLevel).toBe("none");
    expect(session.distressSeverity).toBe("none");
  });

  it("canonicalizes explicit distress rows from distressLevel", () => {
    const session = normalizeSession({
      id: "s-explicit-active",
      distressLevel: "active",
      distressSeverity: "none",
      result: "success",
    });

    expect(session.distressLevel).toBe("active");
    expect(session.distressSeverity).toBe("active");
  });

  it("prefers reconstructed legacy severe level over conflicting raw severity", () => {
    const session = normalizeSession({
      id: "s-legacy-reconstructed-severe",
      distressLevel: "active",
      distressSeverity: "none",
      distressType: "__severity:severe|panic",
      result: "distress",
    });

    expect(session.distressLevel).toBe("severe");
    expect(session.distressSeverity).toBe("severe");
    expect(session.distressType).toBe("panic");
  });

  it("does not allow malformed explicit below-threshold values to override inference", () => {
    const session = normalizeSession({
      id: "s-invalid-below-threshold",
      plannedDuration: 120,
      actualDuration: 90,
      distressLevel: "none",
      below_threshold: "maybe",
    });

    expect(session.belowThreshold).toBe(false);
  });

  it("accepts canonical explicit below-threshold string values", () => {
    const trueSession = normalizeSession({
      id: "s-string-true",
      plannedDuration: 120,
      actualDuration: 90,
      distressLevel: "none",
      below_threshold: "true",
    });
    const falseSession = normalizeSession({
      id: "s-string-false",
      plannedDuration: 120,
      actualDuration: 120,
      distressLevel: "none",
      below_threshold: "false",
    });

    expect(trueSession.belowThreshold).toBe(true);
    expect(falseSession.belowThreshold).toBe(false);
  });

  it("overrides explicit below-threshold truthy flags when distress is present", () => {
    const activeSession = normalizeSession({
      id: "s-active-contradict",
      plannedDuration: 120,
      actualDuration: 120,
      distressLevel: "active",
      below_threshold: true,
    });
    const severeSession = normalizeSession({
      id: "s-severe-contradict",
      plannedDuration: 120,
      actualDuration: 120,
      distress_level: "severe",
      belowThreshold: "true",
    });

    expect(activeSession.belowThreshold).toBe(false);
    expect(severeSession.belowThreshold).toBe(false);
  });

  it("forces contradictory legacy rows to non-below-threshold when distress metadata indicates stress", () => {
    const legacyContradictory = normalizeSession({
      id: "s-legacy-contradict",
      result: "success",
      distress_level: "strong",
      plannedDuration: 180,
      actualDuration: 180,
      below_threshold: 1,
    });

    expect(legacyContradictory.distressLevel).toBe("active");
    expect(legacyContradictory.belowThreshold).toBe(false);
  });
});
