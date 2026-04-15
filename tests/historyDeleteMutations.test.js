import { describe, expect, it, vi } from "vitest";
import { suggestNextWithContext } from "../src/lib/protocol";
import { useHistoryEditing } from "../src/features/history/HistoryFeature";
import * as storage from "../src/features/app/storage";

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
  addTombstone = vi.fn(),
  pushTombstoneWithSyncStatus = vi.fn(() => Promise.resolve({ ok: true })),
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
    pushTombstoneWithSyncStatus,
    addTombstone,
    commitSessions: commitSessions ?? vi.fn(),
    setWalks: commitWalks ?? vi.fn(),
    setPatterns: commitPatterns ?? vi.fn(),
    setFeedings: commitFeedings ?? vi.fn(),
    stampLocalEntry: (entry) => ({ ...entry }),
  });

  return {
    actions,
    showToast,
    addTombstone,
    commitSessions: commitSessions ?? vi.fn(),
    commitWalks: commitWalks ?? vi.fn(),
    commitPatterns: commitPatterns ?? vi.fn(),
    commitFeedings: commitFeedings ?? vi.fn(),
  };
};

describe("history delete mutations", () => {
  it("removes the dead remote bulk-delete session contract from sync API surface", () => {
    expect(storage.syncDeleteSessionsForDog).toBeUndefined();
  });

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

  it("keeps bulk clear retry-safe by only tombstoning sessions that still exist", () => {
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
    actions.clearSessions();

    const firstClearUpdater = commitSessions.mock.calls[0][0];
    const secondClearUpdater = commitSessions.mock.calls[1][0];
    const afterFirstClear = firstClearUpdater([
      { ...baseSession, id: "sess-1" },
      { ...baseSession, id: "sess-2", date: makeIso("2026-04-11T10:00:00Z") },
    ]);
    const afterSecondClear = secondClearUpdater(afterFirstClear);

    expect(afterFirstClear).toEqual([]);
    expect(afterSecondClear).toEqual([]);
    expect(addTombstone.mock.calls.map((call) => call[1].id)).toEqual(["sess-1", "sess-2"]);
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

  it("deletes only the targeted visible row when duplicate ids exist and avoids tombstoning ambiguous duplicates", () => {
    const commitSessions = vi.fn();
    const addTombstone = vi.fn();
    const duplicateId = "sess-dup";
    const duplicateSessions = [
      {
        ...baseSession,
        id: duplicateId,
        date: makeIso("2026-04-09T10:00:00Z"),
        actualDuration: 90,
        plannedDuration: 90,
        revision: 3,
        updatedAt: makeIso("2026-04-09T10:00:00Z"),
      },
      {
        ...baseSession,
        id: duplicateId,
        date: makeIso("2026-04-10T10:00:00Z"),
        actualDuration: 110,
        plannedDuration: 110,
        revision: 4,
        updatedAt: makeIso("2026-04-10T10:00:00Z"),
      },
      {
        ...baseSession,
        id: "sess-keep",
        date: makeIso("2026-04-11T10:00:00Z"),
        actualDuration: 140,
        plannedDuration: 140,
      },
    ];
    const { actions } = buildDeleteActions({
      sessions: duplicateSessions,
      commitSessions,
      addTombstone,
    });

    actions.confirmHistoryDelete({
      mode: "delete",
      kind: "session",
      id: duplicateId,
      targetDate: makeIso("2026-04-10T10:00:00Z"),
      targetActualDuration: 110,
      targetPlannedDuration: 110,
      targetRevision: 4,
      targetUpdatedAt: makeIso("2026-04-10T10:00:00Z"),
      label: "Duplicate session",
    }, vi.fn());

    const deleteUpdater = commitSessions.mock.calls[0][0];
    const afterDelete = deleteUpdater(duplicateSessions);
    expect(afterDelete).toHaveLength(2);
    expect(afterDelete).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: duplicateId, actualDuration: 90 }),
      expect.objectContaining({ id: "sess-keep" }),
    ]));
    expect(addTombstone).not.toHaveBeenCalled();
  });

  it("deletes local-only rows without creating or pushing tombstones", async () => {
    const commitSessions = vi.fn();
    const addTombstone = vi.fn();
    const pushTombstoneWithSyncStatus = vi.fn(() => Promise.resolve({ ok: true }));
    const localOnlySession = {
      ...baseSession,
      id: "sess-local-only",
      pendingSync: true,
      syncState: "local",
      date: makeIso("2026-04-12T10:00:00Z"),
    };
    const { actions } = buildDeleteActions({
      sessions: [localOnlySession],
      commitSessions,
      addTombstone,
      pushTombstoneWithSyncStatus,
    });

    actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-local-only", label: "Local only session" }, vi.fn());
    const deleteUpdater = commitSessions.mock.calls[0][0];
    expect(deleteUpdater([localOnlySession])).toEqual([]);
    await Promise.resolve();
    expect(addTombstone).not.toHaveBeenCalled();
    expect(pushTombstoneWithSyncStatus).not.toHaveBeenCalled();
  });

  it("creates and pushes tombstones immediately for remotely persisted rows", async () => {
    const tombstone = { id: "sess-remote", kind: "session", deletedAt: makeIso("2026-04-13T11:00:00Z") };
    const addTombstone = vi.fn(() => tombstone);
    const pushTombstoneWithSyncStatus = vi.fn(() => Promise.resolve({ ok: true }));
    const remoteSession = {
      ...baseSession,
      id: "sess-remote",
      pendingSync: false,
      syncState: "synced",
      date: makeIso("2026-04-13T10:00:00Z"),
    };
    const commitSessions = vi.fn((updater) => (typeof updater === "function" ? updater([remoteSession]) : updater));
    const { actions } = buildDeleteActions({
      sessions: [remoteSession],
      commitSessions,
      addTombstone,
      pushTombstoneWithSyncStatus,
    });

    actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-remote", label: "Remote session" }, vi.fn());
    await Promise.resolve();
    expect(addTombstone).toHaveBeenCalledWith("session", expect.objectContaining({ id: "sess-remote" }));
    expect(pushTombstoneWithSyncStatus).toHaveBeenCalledWith(tombstone);
  });
});
