import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useHistoryEditing } from "../src/features/history/HistoryFeature";
import { selectAppData } from "../src/features/app/selectors";
import {
  applyTombstonesToCollection,
  hydrateDogFromLocal,
  mergeTombstonesByEntityKey,
  normalizeSessions,
  normalizeTombstones,
  makeEntryId,
  repairDuplicateSessionIds,
  save,
  sessKey,
  tombKey,
} from "../src/features/app/storage";
import { sortByDateAsc } from "../src/lib/activityDateTime";

const iso = (value) => new Date(value).toISOString();

const createMemoryStorage = () => {
  const db = new Map();
  return {
    getItem: vi.fn((key) => (db.has(key) ? db.get(key) : null)),
    setItem: vi.fn((key, value) => {
      db.set(key, value);
      return undefined;
    }),
    removeItem: vi.fn((key) => db.delete(key)),
    clear: vi.fn(() => db.clear()),
  };
};

const baseSessions = [
  {
    id: "sess-1",
    date: iso("2026-04-10T09:00:00Z"),
    plannedDuration: 180,
    actualDuration: 180,
    distressLevel: "none",
    result: "success",
    revision: 4,
    updatedAt: iso("2026-04-10T09:00:00Z"),
  },
  {
    id: "sess-2",
    date: iso("2026-04-11T09:00:00Z"),
    plannedDuration: 210,
    actualDuration: 210,
    distressLevel: "none",
    result: "success",
    revision: 5,
    updatedAt: iso("2026-04-11T09:00:00Z"),
  },
  {
    id: "sess-3",
    date: iso("2026-04-12T09:00:00Z"),
    plannedDuration: 240,
    actualDuration: 240,
    distressLevel: "none",
    result: "success",
    revision: 6,
    updatedAt: iso("2026-04-12T09:00:00Z"),
  },
];

const buildDeleteHarness = ({ dogId = "DOG-RELOAD", sessionsSeed = baseSessions } = {}) => {
  let sessions = sortByDateAsc(normalizeSessions(sessionsSeed));
  let tombstones = [];

  save(sessKey(dogId), sessions);
  save(tombKey(dogId), tombstones);

  const commitTombstones = (updater) => {
    const resolved = typeof updater === "function" ? updater(tombstones) : updater;
    tombstones = normalizeTombstones(resolved);
    save(tombKey(dogId), tombstones);
    return tombstones;
  };

  const addTombstone = (kind, entry) => {
    const tombstone = {
      id: entry.id,
      kind,
      deletedAt: iso("2026-04-13T10:00:00Z"),
      updatedAt: iso("2026-04-13T10:00:00Z"),
      revision: Number.isFinite(entry.revision) ? entry.revision + 1 : 1,
      pendingSync: true,
      syncState: "local",
      replicationConfirmed: false,
    };
    commitTombstones((prev) => mergeTombstonesByEntityKey(prev, [tombstone]));
    return tombstone;
  };

  const commitSessions = (updater) => {
    const resolved = typeof updater === "function" ? updater(sessions) : updater;
    sessions = sortByDateAsc(normalizeSessions(resolved));
    save(sessKey(dogId), sessions);
    return sessions;
  };

  const actions = useHistoryEditing({
    sessions,
    walks: [],
    patterns: [],
    feedings: [],
    patLabels: {},
    showToast: vi.fn(),
    pushWithSyncStatus: vi.fn(async () => ({ ok: true })),
    pushTombstoneWithSyncStatus: vi.fn(async () => ({ ok: true })),
    addTombstone,
    commitSessions,
    setWalks: vi.fn(),
    setPatterns: vi.fn(),
    setFeedings: vi.fn(),
    stampLocalEntry: (entry) => entry,
  });

  const reloadVisibleSessions = () => {
    const hydrated = hydrateDogFromLocal(dogId);
    return applyTombstonesToCollection(hydrated.sessions, hydrated.tombstones, "session");
  };

  return {
    dogId,
    actions,
    getSessions: () => sessions,
    getTombstones: () => tombstones,
    reloadVisibleSessions,
  };
};

describe("history delete + reload hydration runtime", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delete one + reload keeps non-deleted sessions visible and deleted hidden", () => {
    const harness = buildDeleteHarness();

    harness.actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-2", label: "Training session" }, vi.fn());

    // Simulate stale sync writing pre-delete sessions back before reload.
    save(sessKey(harness.dogId), baseSessions);

    const visibleAfterReload = harness.reloadVisibleSessions();
    expect(visibleAfterReload.map((row) => row.id)).toEqual(["sess-1", "sess-3"]);
  });

  it("delete of syncing session stays deleted across stale reload + sync replay", () => {
    const syncingSeed = [{
      ...baseSessions[0],
      id: "sess-syncing",
      pendingSync: true,
      syncState: "syncing",
      revision: 7,
      updatedAt: iso("2026-04-13T09:00:00Z"),
    }];
    const harness = buildDeleteHarness({ dogId: "DOG-SYNCING-DEL", sessionsSeed: syncingSeed });

    harness.actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-syncing", label: "Training session" }, vi.fn());

    // Simulate stale sync/reload writing pre-delete session payload back to local storage.
    save(sessKey(harness.dogId), syncingSeed);

    const visibleAfterReload = harness.reloadVisibleSessions();
    expect(visibleAfterReload).toEqual([]);
    expect(harness.getTombstones()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "sess-syncing", kind: "session", pendingSync: true }),
    ]));
  });

  it("delete multiple + reload preserves remaining sessions and keeps log populated", () => {
    const harness = buildDeleteHarness();

    harness.actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-1", label: "Training session" }, vi.fn());
    harness.actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: "sess-2", label: "Training session" }, vi.fn());

    // Simulate stale sync persistence before reload.
    save(sessKey(harness.dogId), baseSessions);

    const visibleAfterReload = harness.reloadVisibleSessions();
    expect(visibleAfterReload.map((row) => row.id)).toEqual(["sess-3"]);

    const appData = selectAppData({
      dogs: [{ id: harness.dogId, dogName: "Hydrate Dog", goalSeconds: 2400 }],
      activeDogId: harness.dogId,
      sessions: visibleAfterReload,
      walks: [],
      patterns: [],
      feedings: [],
      target: 2400,
      protoOverride: {},
      recommendation: { duration: 2400, decisionState: null, explanation: "", details: {} },
    });
    expect(appData.timeline).toHaveLength(1);
    expect(appData.timeline[0].data.id).toBe("sess-3");
  });

  it("reload does not collapse history because of non-pending tombstones with legacy syncState markers", () => {
    const dogId = "DOG-LEGACY";
    save(sessKey(dogId), baseSessions);
    save(tombKey(dogId), [{
      id: "sess-2",
      kind: "session",
      deletedAt: iso("2026-04-13T10:00:00Z"),
      updatedAt: iso("2026-04-13T10:00:00Z"),
      revision: 6,
      pendingSync: false,
      syncState: "local",
      replicationConfirmed: true,
    }]);

    const hydrated = hydrateDogFromLocal(dogId);
    const visibleAfterReload = applyTombstonesToCollection(hydrated.sessions, hydrated.tombstones, "session");

    expect(visibleAfterReload.map((row) => row.id)).toEqual(["sess-1", "sess-3"]);
  });

  it("repairs duplicate session ids on hydration so deleting one does not wipe all duplicates", () => {
    const dogId = "DOG-DUPE";
    const duplicateSessions = [
      { ...baseSessions[0], id: "sess-dup" },
      { ...baseSessions[1], id: "sess-dup" },
      { ...baseSessions[2], id: "sess-keep" },
    ];
    save(sessKey(dogId), duplicateSessions);
    save(tombKey(dogId), []);

    const hydrated = hydrateDogFromLocal(dogId);
    const hydratedIds = hydrated.sessions.map((row) => row.id);
    expect(new Set(hydratedIds).size).toBe(3);
    expect(hydratedIds.some((id) => id.includes("repair"))).toBe(true);

    const repaired = repairDuplicateSessionIds(normalizeSessions(duplicateSessions), dogId).rows;
    const commitSessions = vi.fn();
    const actions = useHistoryEditing({
      sessions: repaired,
      walks: [],
      patterns: [],
      feedings: [],
      patLabels: {},
      showToast: vi.fn(),
      pushWithSyncStatus: vi.fn(async () => ({ ok: true })),
      pushTombstoneWithSyncStatus: vi.fn(async () => ({ ok: true })),
      addTombstone: vi.fn(),
      commitSessions,
      setWalks: vi.fn(),
      setPatterns: vi.fn(),
      setFeedings: vi.fn(),
      stampLocalEntry: (entry) => entry,
    });

    const repairedTarget = repaired.find((row) => row.id.includes("repair"));
    expect(repairedTarget).toBeTruthy();
    actions.confirmHistoryDelete({ mode: "delete", kind: "session", id: repairedTarget.id, label: "Training session" }, vi.fn());
    const deleteUpdater = commitSessions.mock.calls[0][0];
    const afterDelete = deleteUpdater(repaired);
    expect(afterDelete).toHaveLength(2);
    expect(afterDelete.some((row) => row.id === "sess-keep")).toBe(true);
  });

  it("makeEntryId generates unique ids for same-millisecond calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeEntryId("sess", "DOG-ID")));
    expect(ids.size).toBe(20);
  });
});
