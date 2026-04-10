import { describe, expect, it } from "vitest";
import { selectAppData } from "../src/features/app/selectors";
import { getInformationalTone, getOutcomeTone, getRiskTone } from "../src/features/app/helpers";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

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

    const appData = selectAppData({
      dogs: [{ id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 }],
      activeDogId: "DOG-1",
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 45,
      protoOverride: {},
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

    const appData = selectAppData({
      dogs: [{ id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 }],
      activeDogId: "DOG-1",
      sessions,
      walks: [],
      patterns: [],
      feedings: [],
      target: 30,
      protoOverride: {},
    });

    const toneByRisk = {
      low: "Low",
      medium: "Medium",
      high: "High",
    };
    expect(appData.relapseTone.label).toBe(toneByRisk[appData.nextTargetInfo.decisionState.riskLevel]);
    expect(appData.headlineStatus).toBe(appData.nextTargetInfo.decisionState.statusLabel);
  });

  it("shares baseline decision state across recommendation and stats with no history", () => {
    const appData = selectAppData({
      dogs: [{ id: "DOG-1", dogName: "Milo", goalSeconds: 1200, leavesPerDay: 3 }],
      activeDogId: "DOG-1",
      sessions: [],
      walks: [],
      patterns: [],
      feedings: [],
      target: 30,
      protoOverride: {},
    });

    expect(appData.nextTargetInfo.decisionState.readiness).toBe("building");
    expect(appData.relapseTone.label).toBe("Medium");
    expect(appData.headlineStatus).toBe("Stable");
  });
});
