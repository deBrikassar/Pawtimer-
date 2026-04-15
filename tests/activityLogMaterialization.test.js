import { describe, expect, it } from "vitest";
import { selectAppData } from "../src/features/app/selectors";
import { buildRecommendation } from "../src/lib/protocol";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("activity log materialization regression guard", () => {
  const baseArgs = {
    dogs: [{ id: "DOG-1", dogName: "Mochi", goalSeconds: 3600 }],
    activeDogId: "DOG-1",
    target: 900,
    protoOverride: {},
  };

  it("includes completed sessions in timeline when materializing Activity Log inputs", () => {
    const sessions = [{
      id: "sess-1",
      date: daysAgo(0),
      plannedDuration: 900,
      actualDuration: 900,
      distressLevel: "none",
      belowThreshold: true,
    }];
    const recommendation = { duration: 900, decisionState: null, details: {}, explanation: "" };
    const app = selectAppData({
      ...baseArgs,
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      recommendation,
    });

    expect(app.timeline).toHaveLength(1);
    expect(app.timeline[0].kind).toBe("session");
    expect(app.timeline[0].data.id).toBe("sess-1");
  });

  it("keeps recommendation logic active for completed sessions", () => {
    const sessions = [
      { id: "s-1", date: daysAgo(2), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
      { id: "s-2", date: daysAgo(1), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBeGreaterThan(900);
  });

  it("materializes unified timeline entries for walks, patterns, and feedings with stable ordering", () => {
    const sessions = [{ id: "sess-1", date: daysAgo(3), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true }];
    const walks = [{ id: "walk-1", date: daysAgo(2), duration: 300, type: "exercise" }];
    const patterns = [{ id: "pat-1", date: daysAgo(1), type: "keys" }];
    const feedings = [{ id: "feed-1", date: daysAgo(0), foodType: "meal", amount: "small" }];
    const recommendation = { duration: 900, decisionState: null, details: {}, explanation: "" };

    const app = selectAppData({
      ...baseArgs,
      sessions,
      walks,
      patterns,
      feedings,
      recommendation,
    });

    expect(app.timeline.map((entry) => entry.kind)).toEqual(["feeding", "pat", "walk", "session"]);
    expect(app.timeline).toHaveLength(4);
  });

  it("keeps timeline ordering deterministic while excluding invalid-dated session rows from logic", () => {
    const sessions = [
      { id: "sess-invalid", date: "invalid-date", plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
      { id: "sess-valid", date: daysAgo(3), plannedDuration: 600, actualDuration: 600, distressLevel: "none", belowThreshold: true },
    ];
    const walks = [{ id: "walk-1", date: daysAgo(2), duration: 300, type: "exercise" }];
    const patterns = [{ id: "pat-1", date: daysAgo(1), type: "keys" }];
    const feedings = [{ id: "feed-1", date: daysAgo(0), foodType: "meal", amount: "small" }];
    const recommendation = { duration: 900, decisionState: null, details: {}, explanation: "" };

    const app = selectAppData({
      ...baseArgs,
      sessions,
      walks,
      patterns,
      feedings,
      recommendation,
    });

    expect(app.totalCount).toBe(1);
    expect(app.timeline.map((entry) => `${entry.kind}:${entry.data.id}`)).toEqual([
      "feeding:feed-1",
      "pat:pat-1",
      "walk:walk-1",
      "session:sess-valid",
    ]);
  });

  it("retains PT-LOGIC-003 plateau hold behavior for repeated near-threshold sessions", () => {
    const sessions = [
      { id: "s-1", date: daysAgo(2), plannedDuration: 900, actualDuration: 900, distressLevel: "none", belowThreshold: true },
      { id: "s-2", date: daysAgo(1), plannedDuration: 900, actualDuration: 810, distressLevel: "none", belowThreshold: false },
      { id: "s-3", date: daysAgo(0), plannedDuration: 900, actualDuration: 810, distressLevel: "none", belowThreshold: false },
    ];
    const rec = buildRecommendation(sessions, { goalSeconds: 3600 });
    expect(rec.recommendedDuration).toBe(900);
    expect(rec.recommendationType).toBe("keep_same_duration");
  });
});
