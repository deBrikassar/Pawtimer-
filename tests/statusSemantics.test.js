import { describe, expect, it } from "vitest";
import { selectAppData } from "../src/features/app/selectors";
import { getInformationalTone, getOutcomeTone, getRiskTone } from "../src/features/app/helpers";
import { explainNextTarget } from "../src/lib/protocol";
import { sortByDateAsc } from "../src/lib/activityDateTime";
import { sortValidDateAsc } from "../src/lib/dateSort";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const buildRecommendation = ({ sessions, walks, patterns, dog, target }) => {
  const details = explainNextTarget(sessions, walks, patterns, dog);
  return {
    duration: target,
    decisionState: details.decisionState,
    explanation: details.summary,
    details,
  };
};

describe("semantic status mapping", () => {
  it("maps outcome statuses by session meaning", () => {
    expect(getOutcomeTone("none").color).toBe("var(--green-dark)");
    expect(getOutcomeTone("subtle").color).toBe("var(--orange)");
    expect(getOutcomeTone("active").color).toBe("var(--red)");
    expect(getOutcomeTone("severe").color).toBe("var(--red)");
  });

  it("maps risk and informational states to separate semantic palettes", () => {
    expect(getRiskTone("low").color).toBe("var(--green-dark)");
    expect(getRiskTone("medium").color).toBe("var(--orange)");
    expect(getRiskTone("high").color).toBe("var(--red)");
    expect(getInformationalTone("improving").color).toBe("var(--blue-dark)");
    expect(getInformationalTone("stable").color).toBe("var(--blue-dark)");
    expect(getInformationalTone("neutral").color).toBe("var(--blue-dark)");
  });

  it("keeps progress headlines informational while relapse risk stays risk-based", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 30, actualDuration: 30, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(1), plannedDuration: 35, actualDuration: 35, distressLevel: "none", belowThreshold: true },
      { date: daysAgo(0), plannedDuration: 40, actualDuration: 40, distressLevel: "none", belowThreshold: true },
    ];

    const dog = { id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 };
    const appData = selectAppData({
      dogs: [dog],
      activeDogId: "DOG-1",
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 45,
      protoOverride: {},
      recommendation: buildRecommendation({ sessions, walks: [], patterns: [], dog, target: 45 }),
    });

    expect(appData.headlineStatus).toBe("Improving");
    expect(appData.headlineStatusTone.color).toBe("var(--blue-dark)");
    expect(appData.relapseTone.color).toBe("var(--green-dark)");
  });

  it("keeps stats headline and risk in sync with recommendation decision state", () => {
    const sessions = [
      { date: daysAgo(2), plannedDuration: 45, actualDuration: 12, distressLevel: "active", belowThreshold: false },
      { date: daysAgo(1), plannedDuration: 40, actualDuration: 8, distressLevel: "severe", belowThreshold: false },
    ];

    const dog = { id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 };
    const appData = selectAppData({
      dogs: [dog],
      activeDogId: "DOG-1",
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 30,
      protoOverride: {},
      recommendation: buildRecommendation({ sessions, walks: [], patterns: [], dog, target: 30 }),
    });

    const toneByRisk = {
      low: "Low",
      medium: "Medium",
      high: "High",
    };
    expect(appData.relapseTone.label).toBe(toneByRisk[appData.recommendation.decisionState.riskLevel]);
    expect(appData.headlineStatus).toBe(appData.recommendation.decisionState.statusLabel);
  });

  it("shares baseline decision state across recommendation and stats with no history", () => {
    const dog = { id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 };
    const appData = selectAppData({
      dogs: [dog],
      activeDogId: "DOG-1",
      sessions: [],
      walks: [],
      patterns: [],
      feedings: [],
      target: 30,
      protoOverride: {},
      recommendation: buildRecommendation({ sessions: [], walks: [], patterns: [], dog, target: 30 }),
    });

    expect(appData.recommendation.decisionState.readiness).toBe("building");
    expect(appData.relapseTone.label).toBe("Medium");
    expect(appData.headlineStatus).toBe("Stable");
  });

  it("keeps chart trend, calm streak, and risk stable when input sessions arrive unsorted", () => {
    const unsortedSessions = [
      { date: "2026-04-17T09:00:00.000Z", plannedDuration: 360, actualDuration: 360, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-10T09:00:00.000Z", plannedDuration: 120, actualDuration: 120, distressLevel: "active", belowThreshold: false },
      { date: "2026-04-14T09:00:00.000Z", plannedDuration: 210, actualDuration: 210, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-12T09:00:00.000Z", plannedDuration: 150, actualDuration: 150, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-16T09:00:00.000Z", plannedDuration: 300, actualDuration: 300, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-15T09:00:00.000Z", plannedDuration: 240, actualDuration: 240, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-13T09:00:00.000Z", plannedDuration: 180, actualDuration: 180, distressLevel: "none", belowThreshold: true },
      { date: "2026-04-11T09:00:00.000Z", plannedDuration: 130, actualDuration: 130, distressLevel: "active", belowThreshold: false },
    ];
    const sortedSessions = sortByDateAsc(unsortedSessions);
    const dog = { id: "DOG-1", dogName: "Milo", goalSeconds: 1800, leavesPerDay: 3 };

    const recommendation = buildRecommendation({
      sessions: sortedSessions,
      walks: [],
      patterns: [],
      dog,
      target: 40,
    });
    const appData = selectAppData({
      dogs: [dog],
      activeDogId: "DOG-1",
      sessions: sortedSessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 40,
      protoOverride: {},
      recommendation,
    });

    expect(appData.chartData.map((entry) => entry.durationSeconds)).toEqual([120, 130, 150, 180, 210, 240, 300, 360]);
    expect(appData.chartTrendLabel).toBe("Trend: Improving");
    expect(appData.streak).toBe(6);
    expect(appData.relapseTone.label).toBe(recommendation.decisionState.riskLevel === "low" ? "Low" : recommendation.decisionState.riskLevel === "high" ? "High" : "Medium");
  });

  it("drops invalid-dated sessions consistently across recommendation and derived metrics", () => {
    const sessions = sortByDateAsc([
      { id: "invalid-text", date: "not-a-date", plannedDuration: 999, actualDuration: 999, distressLevel: "none", belowThreshold: true },
      { id: "valid-1", date: "2026-04-10T09:00:00.000Z", plannedDuration: 120, actualDuration: 120, distressLevel: "none", belowThreshold: true },
      { id: "invalid-missing", plannedDuration: 200, actualDuration: 200, distressLevel: "none", belowThreshold: true },
      { id: "valid-2", date: "2026-04-11T09:00:00.000Z", plannedDuration: 150, actualDuration: 150, distressLevel: "active", belowThreshold: false },
    ]);
    const dog = { id: "DOG-1", dogName: "Milo", goalSeconds: 1800, leavesPerDay: 3 };
    const canonicalSessions = sortValidDateAsc(sessions);
    const recommendation = buildRecommendation({
      sessions: canonicalSessions,
      walks: [],
      patterns: [],
      dog,
      target: 60,
    });
    const appData = selectAppData({
      dogs: [dog],
      activeDogId: "DOG-1",
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 60,
      protoOverride: {},
      recommendation,
    });

    expect(canonicalSessions.map((session) => session.id)).toEqual(["valid-1", "valid-2"]);
    expect(appData.totalCount).toBe(canonicalSessions.length);
    expect(appData.chartData.map((entry) => entry.durationSeconds)).toEqual([120, 150]);
    expect(appData.timeline.filter((entry) => entry.kind === "session").map((entry) => entry.data.id)).toEqual(["valid-2", "valid-1"]);
    expect(appData.recentHighDistress.recentSessions).toHaveLength(canonicalSessions.length);
  });
});
