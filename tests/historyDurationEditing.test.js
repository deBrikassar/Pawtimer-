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

const buildHistoryActions = (sessions, { commitSessions, showToast = vi.fn() } = {}) => {
  let state = [...sessions];
  const commitSessionsSpy = commitSessions ?? vi.fn((updater) => {
    state = typeof updater === "function" ? updater(state) : updater;
    return state;
  });
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
    commitSessions: commitSessionsSpy,
    setWalks: vi.fn(),
    setPatterns: vi.fn(),
    setFeedings: vi.fn(),
    recomputeTarget: vi.fn(),
    activeDogId: "dog-1",
    stampLocalEntry,
  });
  return { actions, commitSessions: commitSessionsSpy, showToast };
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
    const editedFromClock = commitSessions.mock.calls[0][0]([baseSession]).find((session) => session.id === "sess-1");
    expect(editedFromClock.actualDuration).toBe(97);

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "22:57" }, vi.fn());
    const editedFromMinutes = commitSessions.mock.calls[1][0]([baseSession]).find((session) => session.id === "sess-1");
    expect(editedFromMinutes.actualDuration).toBe(1377);

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "90" }, vi.fn());
    const editedFromSeconds = commitSessions.mock.calls[2][0]([baseSession]).find((session) => session.id === "sess-1");
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

  it("applies rapid sequential edits against latest session state without dropping intervening changes", () => {
    const { actions, commitSessions } = buildHistoryActions([baseSession]);
    const dismissModal = vi.fn();

    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1:37" }, dismissModal);
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "2:30" }, dismissModal);

    const firstUpdater = commitSessions.mock.calls[0][0];
    const secondUpdater = commitSessions.mock.calls[1][0];

    const afterFirstEdit = firstUpdater([baseSession]);
    expect(afterFirstEdit[0].actualDuration).toBe(97);

    const stateWithInterveningUpdate = [{
      ...afterFirstEdit[0],
      plannedDuration: 240,
      syncState: "syncing",
      pendingSync: true,
      syncError: "transient",
    }];
    const afterSecondEdit = secondUpdater(stateWithInterveningUpdate);

    expect(afterSecondEdit[0].actualDuration).toBe(150);
    expect(afterSecondEdit[0].plannedDuration).toBe(240);
    expect(afterSecondEdit[0].syncState).toBe("syncing");
    expect(afterSecondEdit[0].pendingSync).toBe(true);
    expect(afterSecondEdit[0].syncError).toBe("transient");
  });

  it("keeps sync-sensitive fields when editing time after an intervening state update", () => {
    const { actions, commitSessions } = buildHistoryActions([baseSession]);

    actions.saveEditedActivityTime({
      mode: "datetime",
      kind: "session",
      id: "sess-1",
      date: "2026-04-11",
      time: "11:30",
    }, vi.fn());

    const timeUpdater = commitSessions.mock.calls[0][0];
    const stateWithSyncMetadata = [{
      ...baseSession,
      revision: 4,
      syncState: "error",
      pendingSync: true,
      syncError: "network",
    }];
    const afterTimeEdit = timeUpdater(stateWithSyncMetadata);

    expect(afterTimeEdit[0].date).toBe("2026-04-11T11:30:00.000Z");
    expect(afterTimeEdit[0].revision).toBe(4);
    expect(afterTimeEdit[0].syncState).toBe("error");
    expect(afterTimeEdit[0].pendingSync).toBe(true);
    expect(afterTimeEdit[0].syncError).toBe("network");
  });
});
