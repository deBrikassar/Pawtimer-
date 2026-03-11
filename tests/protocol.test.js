import { describe, it, expect } from "vitest";
import { getNextDurationSeconds, suggestNext, PROTOCOL } from "../src/lib/protocol";

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
