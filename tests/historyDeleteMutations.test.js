import { describe, expect, it, vi } from "vitest";
import { suggestNextWithContext } from "../src/lib/protocol";
import { useHistoryEditing } from "../src/features/history/HistoryFeature";

const makeIso = (value) => new Date(value).toISOString();

const baseSession = {
  id: "sess-1",
  date: makeIso("2026-04-10T10:00:00Z"),
  plannedDuration: 120,
  actualDuration: 120,
  distressLevel: "none",
  belowThreshold: true,
  latencyToFirstDistress: 120,
  result: "success",
};

const buildDeleteActions = ({
  sessions = [baseSession],
  walks = [{ id: "walk-1", date: makeIso("2026-04-10T11:00:00Z"), duration: 300, type: "exercise" }],
  patterns = [{ id: "pat-1", date: makeIso("2026-04-10T12:00:00Z"), type: "phone" }],
  feedings = [{ id: "feed-1", date: makeIso("2026-04-10T13:00:00Z"), foodType: "meal", amount: "small" }],
  commitSessions,
  commitWalks,
  commitPatterns,
  commitFeedings,
  syncDelete = vi.fn(() => Promise.resolve(true)),
  addTombstone = vi.fn(),
  showToast = vi.fn(),
} = {}) => {
  const actions = useHistoryEditing({
    sessions,
    walks,
    patterns,
    feedings,
    patLabels: {},
    showToast,
    pushWithSyncStatus: vi.fn(() => Promise.resolve({ ok: true })),
    syncDelete,
    syncDeleteSessionsForDog: vi.fn(() => Promise.resolve(true)),
    addTombstone,
    commitSessions: commitSessions ?? vi.fn(),
    setWalks: commitWalks ?? vi.fn(),
    setPatterns: commitPatterns ?? vi.fn(),
    setFeedings: commitFeedings ?? vi.fn(),
    activeDogId: "dog-1",
    stampLocalEntry: (entry) => ({ ...entry }),
  });

  return {
    actions,
    showToast,
    syncDelete,
    addTombstone,
    commitSessions: commitSessions ?? vi.fn(),
    commitWalks: commitWalks ?? vi.fn(),
    commitPatterns: commitPatterns ?? vi.fn(),
    commitFeedings: commitFeedings ?? vi.fn(),
  };
};

describe("history delete mutations", () => {
  it("creates tombstones for every session during bulk clear", () => {
    const commitSessions = vi.fn();
    const addTombstone = vi.fn();
    const originalWindow = globalThis.window;
    globalThis.window = { confirm: vi.fn(() => true) };
    const { actions } = buildDeleteActions({
      sessions: [
        { ...baseSession, id: "sess-1" },
        { ...baseSession, id: "sess-2", date: makeIso("2026-04-11T10:00:00Z") },
      ],
      commitSessions,
      addTombstone,
    });

    actions.clearSessions();

    const clearUpdater = commitSessions.mock.calls[0][0];
    expect(clearUpdater([{ ...baseSession, id: "sess-1" }, { ...baseSession, id: "sess-2" }])).toEqual([]);
    expect(addTombstone).toHaveBeenCalledTimes(2);
    expect(addTombstone.mock.calls.map((call) => call[0])).toEqual(["session", "session"]);
    globalThis.window = originalWindow;
  });

  it("applies session deletes against latest state after another local mutation", () => {
    const commitSessions = vi.fn();
    const addTombstone = vi.fn();
    const { actions } = buildDeleteActions({ commitSessions, addTombstone });

    actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-1", label: "Training session" }, vi.fn());

    expect(commitSessions).toHaveBeenCalledTimes(1);
    const deleteUpdater = commitSessions.mock.calls[0][0];

    const stateWithInterveningLocalMutation = [
      { ...baseSession, actualDuration: 145 },
      {
        id: "sess-2",
        date: makeIso("2026-04-11T10:00:00Z"),
        plannedDuration: 145,
        actualDuration: 145,
        distressLevel: "none",
        belowThreshold: true,
        latencyToFirstDistress: 145,
        result: "success",
      },
    ];

    const afterDelete = deleteUpdater(stateWithInterveningLocalMutation);
    expect(afterDelete.map((session) => session.id)).toEqual(["sess-2"]);
    expect(afterDelete[0].actualDuration).toBe(145);
    expect(addTombstone).toHaveBeenCalledWith("session", expect.objectContaining({ id: "sess-1" }));
  });

  it("preserves sync-sensitive state changes when deleting walks, patterns, and feedings", () => {
    const commitWalks = vi.fn();
    const commitPatterns = vi.fn();
    const commitFeedings = vi.fn();
    const addTombstone = vi.fn();
    const { actions } = buildDeleteActions({ commitWalks, commitPatterns, commitFeedings, addTombstone });

    actions.confirmHistoryDelete({ mode: "delete", kind: "walk", id: "walk-1", label: "Exercise walk" }, vi.fn());
    actions.confirmHistoryDelete({ mode: "delete", kind: "pattern", id: "pat-1", label: "Phone trigger" }, vi.fn());
    actions.confirmHistoryDelete({ mode: "delete", kind: "feeding", id: "feed-1", label: "Meal feeding" }, vi.fn());

    const walkUpdater = commitWalks.mock.calls[0][0];
    const patternUpdater = commitPatterns.mock.calls[0][0];
    const feedingUpdater = commitFeedings.mock.calls[0][0];

    const afterWalkDelete = walkUpdater([
      { id: "walk-1", date: makeIso("2026-04-10T11:00:00Z"), duration: 300, type: "exercise" },
      { id: "walk-2", date: makeIso("2026-04-10T11:30:00Z"), duration: 600, type: "potty", revision: 8, syncState: "syncing", pendingSync: true },
    ]);
    expect(afterWalkDelete).toEqual([
      { id: "walk-2", date: makeIso("2026-04-10T11:30:00Z"), duration: 600, type: "potty", revision: 8, syncState: "syncing", pendingSync: true },
    ]);

    const afterPatternDelete = patternUpdater([
      { id: "pat-1", date: makeIso("2026-04-10T12:00:00Z"), type: "phone" },
      { id: "pat-2", date: makeIso("2026-04-10T12:30:00Z"), type: "door", revision: 2, syncState: "error", pendingSync: true, syncError: "network" },
    ]);
    expect(afterPatternDelete).toEqual([
      { id: "pat-2", date: makeIso("2026-04-10T12:30:00Z"), type: "door", revision: 2, syncState: "error", pendingSync: true, syncError: "network" },
    ]);

    const afterFeedingDelete = feedingUpdater([
      { id: "feed-1", date: makeIso("2026-04-10T13:00:00Z"), foodType: "meal", amount: "small" },
      { id: "feed-2", date: makeIso("2026-04-10T13:30:00Z"), foodType: "snack", amount: "tiny", revision: 5, syncState: "syncing", pendingSync: true },
    ]);
    expect(afterFeedingDelete).toEqual([
      { id: "feed-2", date: makeIso("2026-04-10T13:30:00Z"), foodType: "snack", amount: "tiny", revision: 5, syncState: "syncing", pendingSync: true },
    ]);
    expect(addTombstone).toHaveBeenCalledTimes(3);
    expect(addTombstone.mock.calls.map((call) => call[0])).toEqual(["walk", "pattern", "feeding"]);
  });

  it("retains non-deleted intervening changes and keeps recommendation recompute inputs correct", () => {
    const commitSessions = vi.fn();
    const { actions } = buildDeleteActions({
      sessions: [
        {
          ...baseSession,
          id: "sess-1",
          plannedDuration: 90,
          actualDuration: 90,
          date: makeIso("2026-04-09T10:00:00Z"),
        },
        {
          ...baseSession,
          id: "sess-2",
          plannedDuration: 110,
          actualDuration: 110,
          date: makeIso("2026-04-10T10:00:00Z"),
        },
      ],
      commitSessions,
    });

    actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-1", label: "Older session" }, vi.fn());

    const deleteUpdater = commitSessions.mock.calls[0][0];
    const stateBeforeDeleteApplied = [
      {
        ...baseSession,
        id: "sess-1",
        plannedDuration: 90,
        actualDuration: 90,
        date: makeIso("2026-04-09T10:00:00Z"),
      },
      {
        ...baseSession,
        id: "sess-2",
        plannedDuration: 140,
        actualDuration: 140,
        belowThreshold: false,
        latencyToFirstDistress: 65,
        distressLevel: "active",
        result: "distress",
        date: makeIso("2026-04-10T10:00:00Z"),
      },
    ];

    const afterDelete = deleteUpdater(stateBeforeDeleteApplied);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe("sess-2");
    expect(afterDelete[0].actualDuration).toBe(140);
    expect(afterDelete[0].result).toBe("distress");

    const recommendationAfterDelete = suggestNextWithContext(afterDelete, [], [], { goalSeconds: 3600 });
    const recommendationIfInterveningChangeWereDropped = suggestNextWithContext([
      {
        ...baseSession,
        id: "sess-2",
        plannedDuration: 110,
        actualDuration: 110,
        date: makeIso("2026-04-10T10:00:00Z"),
      },
    ], [], [], { goalSeconds: 3600 });

    expect(recommendationAfterDelete).not.toBe(recommendationIfInterveningChangeWereDropped);
  });
});
