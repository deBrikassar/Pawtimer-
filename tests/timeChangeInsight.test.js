import { describe, expect, it } from "vitest";
import { buildTrainTimeChangeInsight } from "../src/features/train/timeChangeInsight";

describe("buildTrainTimeChangeInsight", () => {
  it("explains decreases after stress with caution tone", () => {
    const insight = buildTrainTimeChangeInsight({
      previousDuration: 120,
      recommendedDuration: 60,
      recommendationType: "decrease_duration",
      distressLevel: "active",
      dogName: "Milo",
    });

    expect(insight?.tone).toBe("caution");
    expect(insight?.title).toContain("Target eased");
    expect(insight?.body).toContain("stress signs");
  });

  it("explains increases after calm sessions", () => {
    const insight = buildTrainTimeChangeInsight({
      previousDuration: 60,
      recommendedDuration: 90,
      recommendationType: "increase_duration",
      distressLevel: "none",
      dogName: "Milo",
    });

    expect(insight?.tone).toBe("positive");
    expect(insight?.title).toContain("Target increased");
  });

  it("explains recovery mode activation", () => {
    const insight = buildTrainTimeChangeInsight({
      previousDuration: 90,
      recommendedDuration: 60,
      recommendationType: "recovery_mode_active",
      distressLevel: "subtle",
      dogName: "Milo",
    });

    expect(insight?.title).toContain("Recovery mode on");
  });

  it("includes recommendation reason context when available", () => {
    const insight = buildTrainTimeChangeInsight({
      previousDuration: 90,
      recommendedDuration: 90,
      recommendationType: "maintain_duration",
      distressLevel: "subtle",
      dogName: "Milo",
    });

    expect(insight?.tone).toBe("neutral");
    expect(insight?.body).toContain("held steady");
  });
});
