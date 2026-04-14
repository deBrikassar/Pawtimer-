import { describe, expect, it } from "vitest";
import { buildEditedActivityIso, sortByDateAsc, toDateInputValue, toTimeInputValue } from "../src/lib/activityDateTime";

describe("activity date/time helpers", () => {
  it("builds a full ISO datetime from separate date and time fields", () => {
    const iso = buildEditedActivityIso("2026-03-17", "08:45");
    const result = new Date(iso);

    expect(iso).not.toBeNull();
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(17);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(45);
  });

  it("rejects invalid calendar dates", () => {
    expect(buildEditedActivityIso("2026-02-30", "08:45")).toBeNull();
    expect(buildEditedActivityIso("2026-03-17", "24:00")).toBeNull();
  });

  it("formats existing activity datetimes for the edit modal inputs", () => {
    const activityDate = new Date(2026, 2, 17, 8, 45, 0, 0);

    expect(toDateInputValue(activityDate)).toBe("2026-03-17");
    expect(toTimeInputValue(activityDate)).toBe("08:45");
  });

  it("resorts edited activity collections chronologically", () => {
    const reordered = sortByDateAsc([
      { id: "walk-2", date: "2026-03-18T10:00:00.000Z" },
      { id: "walk-1", date: "2026-03-16T10:00:00.000Z" },
      { id: "walk-3", date: "2026-03-17T10:00:00.000Z" },
    ]);

    expect(reordered.map((entry) => entry.id)).toEqual(["walk-1", "walk-3", "walk-2"]);
  });

  it("pushes invalid dates to the end while keeping stable order for ties", () => {
    const reordered = sortByDateAsc([
      { id: "same-time-a", date: "2026-03-17T10:00:00.000Z" },
      { id: "invalid-a", date: "not-a-date" },
      { id: "same-time-b", date: "2026-03-17T10:00:00.000Z" },
      { id: "invalid-b", date: null },
      { id: "invalid-c", date: "" },
      { id: "invalid-d" },
      { id: "earliest", date: "2026-03-16T10:00:00.000Z" },
    ]);

    expect(reordered.map((entry) => entry.id)).toEqual([
      "earliest",
      "same-time-a",
      "same-time-b",
      "invalid-a",
      "invalid-b",
      "invalid-c",
      "invalid-d",
    ]);
  });
});
