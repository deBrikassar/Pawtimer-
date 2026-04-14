import { describe, expect, it, vi } from "vitest";
import { parseDurationInput } from "../src/features/app/helpers";
import { useHistoryEditing } from "../src/features/history/HistoryFeature";

const baseSession = {
  id: "sess-1",
  date: new Date("2026-04-10T10:00:00.000Z").toISOString(),
  plannedDuration: 120,
  actualDuration: 120,
  distressLevel: "none",
  belowThreshold: true,
  latencyToFirstDistress: 120,
  result: "success",
};

const buildHistoryActions = (sessions, { commitSessions = vi.fn(), showToast = vi.fn() } = {}) => {
  const pushWithSyncStatus = vi.fn(() => Promise.resolve({ ok: true }));
  const stampLocalEntry = (entry) => ({ ...entry });
  const actions = useHistoryEditing({
    sessions,
    walks: [],
    patterns: [],
    feedings: [],
    patLabels: {},
    showToast,
    pushWithSyncStatus,
    syncDelete: vi.fn(),
    syncDeleteSessionsForDog: vi.fn(),
    commitSessions,
    setWalks: vi.fn(),
    setPatterns: vi.fn(),
    setFeedings: vi.fn(),
    recomputeTarget: vi.fn(),
    activeDogId: "dog-1",
    stampLocalEntry,
  });
  return { actions, commitSessions, showToast };
};

describe("duration parser for history editing", () => {
  it("parses supported duration formats into seconds", () => {
    expect(parseDurationInput("1:37")).toBe(97);
    expect(parseDurationInput("22:57")).toBe(1377);
    expect(parseDurationInput("90")).toBe(90);
    expect(parseDurationInput("1:00:00")).toBe(3600);
  });

  it("rejects malformed duration input", () => {
    expect(parseDurationInput("1::2")).toBeNull();
    expect(parseDurationInput("abc")).toBeNull();
  });
});

describe("session duration edits in history", () => {
  it("writes the parsed edited duration back to the matching session record", () => {
    const { actions, commitSessions, showToast } = buildHistoryActions([baseSession]);

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1:37" }, vi.fn());
    const editedFromClock = commitSessions.mock.calls[0][0].find((session) => session.id === "sess-1");
    expect(editedFromClock.actualDuration).toBe(97);

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "22:57" }, vi.fn());
    const editedFromMinutes = commitSessions.mock.calls[1][0].find((session) => session.id === "sess-1");
    expect(editedFromMinutes.actualDuration).toBe(1377);

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "90" }, vi.fn());
    const editedFromSeconds = commitSessions.mock.calls[2][0].find((session) => session.id === "sess-1");
    expect(editedFromSeconds.actualDuration).toBe(90);

    expect(showToast).toHaveBeenCalledWith("Session updated to 1m 37s");
  });

  it("fails safely when the edited value is malformed", () => {
    const { actions, commitSessions, showToast } = buildHistoryActions([baseSession]);
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1::2" }, vi.fn());
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "abc" }, vi.fn());

    expect(commitSessions).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenNthCalledWith(1, "Invalid duration. Use a positive value (seconds, m:ss, or h:mm:ss)");
    expect(showToast).toHaveBeenNthCalledWith(2, "Invalid duration. Use a positive value (seconds, m:ss, or h:mm:ss)");
  });
});
