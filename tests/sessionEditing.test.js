import { describe, expect, it } from "vitest";
import { suggestNextWithContext } from "../src/lib/protocol";
import { mergeSessionWithDerivedFields } from "../src/features/app/storage";

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
