import { describe, expect, it } from "vitest";
import { buildProgressInsights } from "../src/features/app/selectors";

describe("buildProgressInsights", () => {
  it("highlights rapid stressed jump from yesterday", () => {
    const now = Date.now();
    const yesterday = new Date(now - (24 * 60 * 60 * 1000)).toISOString();
    const twoDaysAgo = new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString();

    const insights = buildProgressInsights({
      chartData: [{ durationSeconds: 180 }, { durationSeconds: 240 }, { durationSeconds: 200 }, { durationSeconds: 220 }],
      canonicalSessions: [
        { actualDuration: 120, distressLevel: "none", date: twoDaysAgo },
        { actualDuration: 180, distressLevel: "active", date: yesterday },
      ],
      recommendationDuration: 120,
      lastPlannedDuration: 180,
      decisionState: { uiTone: "risk_high" },
      streak: 1,
    });

    expect(insights.some((insight) => insight.id === "yesterday-pacing")).toBe(true);
    expect(insights.some((insight) => insight.id === "reduced-time")).toBe(true);
  });

  it("shows recovery and stable streak messaging", () => {
    const insights = buildProgressInsights({
      chartData: [
        { durationSeconds: 120 },
        { durationSeconds: 130 },
        { durationSeconds: 140 },
        { durationSeconds: 135 },
        { durationSeconds: 170 },
        { durationSeconds: 180 },
        { durationSeconds: 190 },
        { durationSeconds: 200 },
      ],
      canonicalSessions: [],
      recommendationDuration: 200,
      lastPlannedDuration: 190,
      decisionState: { uiTone: "informational_improving" },
      streak: 4,
    });

    expect(insights.some((insight) => insight.id === "recovering")).toBe(true);
    expect(insights.some((insight) => insight.id === "stable-streak")).toBe(true);
  });
});
