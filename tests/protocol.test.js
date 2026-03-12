import { describe, it, expect } from "vitest";
import {
  getNextDurationSeconds,
  suggestNext,
  suggestNextWithContext,
  PROTOCOL,
} from "../src/lib/protocol";

describe("getNextDurationSeconds", () => {
  it("returns start duration for invalid input", () => {
    expect(getNextDurationSeconds(0)).toBe(PROTOCOL.startDurationSeconds);
  });

  it("uses percentage step-up under microstep ceiling", () => {
    expect(getNextDurationSeconds(60)).toBe(69);
  });

  it("uses +5 minute step above microstep ceiling", () => {
    expect(getNextDurationSeconds(41 * 60)).toBe(46 * 60);
  });
});

describe("suggestNext", () => {
  it("starts at 80% of current calm when no sessions", () => {
    expect(suggestNext([], { currentMaxCalm: 120 })).toBe(96);
  });

  it("holds if successful session ended early", () => {
    const sessions = [{ distressLevel: "none", actualDuration: 30, plannedDuration: 60 }];
    expect(suggestNext(sessions, {})).toBe(60);
  });

  it("rolls back after strong distress", () => {
    const sessions = [
      { distressLevel: "none", plannedDuration: 60, actualDuration: 60 },
      { distressLevel: "none", plannedDuration: 69, actualDuration: 69 },
      { distressLevel: "strong", plannedDuration: 80, actualDuration: 20 },
    ];
    expect(suggestNext(sessions, {})).toBe(60);
  });
});

describe("suggestNextWithContext", () => {
  it("falls back to suggestNext when session history is empty", () => {
    expect(suggestNextWithContext([], [], [], { currentMaxCalm: 120 })).toBe(96);
  });

  it("steps up for high confidence", () => {
    const now = new Date();
    const sessions = Array.from({ length: 6 }).map((_, idx) => ({
      date: new Date(now.getTime() - (5 - idx) * 86400000).toISOString(),
      distressLevel: "none",
      plannedDuration: 60,
      actualDuration: 60,
    }));
    sessions.push({
      date: now.toISOString(),
      distressLevel: "none",
      plannedDuration: 69,
      actualDuration: 69,
    });

    const patterns = Array.from({ length: 3 }).flatMap((_, idx) => {
      const date = new Date(now.getTime() - idx * 86400000).toISOString();
      return [{ date, type: "keys" }, { date, type: "shoes" }, { date, type: "jacket" }];
    });

    expect(suggestNextWithContext(sessions, [], patterns, { goalSeconds: 3600 })).toBe(79);
  });

  it("holds for medium confidence", () => {
    const now = new Date();
    const sessions = [
      { date: new Date(now.getTime() - 86400000).toISOString(), distressLevel: "none", plannedDuration: 60, actualDuration: 60 },
      { date: now.toISOString(), distressLevel: "mild", plannedDuration: 69, actualDuration: 55 },
    ];

    expect(suggestNextWithContext(sessions, [], [], {})).toBe(69);
  });

  it("rolls back to last stable calm duration for low confidence", () => {
    const now = new Date();
    const sessions = [
      { date: new Date(now.getTime() - 4 * 86400000).toISOString(), distressLevel: "none", plannedDuration: 60, actualDuration: 60 },
      { date: new Date(now.getTime() - 3 * 86400000).toISOString(), distressLevel: "strong", plannedDuration: 69, actualDuration: 20 },
      { date: new Date(now.getTime() - 2 * 86400000).toISOString(), distressLevel: "strong", plannedDuration: 69, actualDuration: 10 },
      { date: new Date(now.getTime() - 86400000).toISOString(), distressLevel: "mild", plannedDuration: 69, actualDuration: 30 },
      { date: now.toISOString(), distressLevel: "strong", plannedDuration: 80, actualDuration: 10 },
    ];

    expect(suggestNextWithContext(sessions, [], [], {})).toBe(60);
  });
});
