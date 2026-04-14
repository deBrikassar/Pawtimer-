import { describe, expect, it } from "vitest";
import { normalizeFeedings, normalizePatterns } from "../src/features/app/storage";

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
});
