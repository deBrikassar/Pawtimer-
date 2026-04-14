import { describe, expect, it } from "vitest";
import { PROTOCOL } from "../src/lib/protocol";
import { dailyInfo } from "../src/features/app/helpers";

const nowIso = () => new Date().toISOString();

describe("dailyInfo add-session limits", () => {
  it("allows adding when both cap and session count are below limit", () => {
    const sessions = [
      { date: nowIso(), actualDuration: 300 },
      { date: nowIso(), actualDuration: 300 },
    ];

    const info = dailyInfo(sessions);

    expect(info.canAdd).toBe(true);
    expect(info.blockReason).toBeNull();
  });

  it("blocks adding when usedSec reaches the daily cap boundary", () => {
    const capSec = PROTOCOL.maxDailyAloneMinutes * 60;
    const sessions = [{ date: nowIso(), actualDuration: capSec }];

    const info = dailyInfo(sessions);

    expect(info.usedSec).toBe(capSec);
    expect(info.canAdd).toBe(false);
    expect(info.blockReason).toBe("cap");
  });

  it("blocks adding when session count reaches sessionsPerDayMax boundary", () => {
    const sessions = Array.from({ length: PROTOCOL.sessionsPerDayMax }, () => ({
      date: nowIso(),
      actualDuration: 60,
    }));

    const info = dailyInfo(sessions);

    expect(info.count).toBe(PROTOCOL.sessionsPerDayMax);
    expect(info.canAdd).toBe(false);
    expect(info.blockReason).toBe("max_sessions");
  });
});
