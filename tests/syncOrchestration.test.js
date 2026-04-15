import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeSyncSummary, SYNC_STATE } from "../src/features/app/syncSummary";
import { formatStorageWriteError, markCollectionStorageError, persistValue } from "../src/features/app/persistence";
import {
  applyTombstonesToCollection,
  hydrateDogFromLocal,
  save,
  sessKey,
  tombKey,
} from "../src/features/app/storage";

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? "OK" : "Bad Request",
  text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
});

const setupStorageModule = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  return import("../src/features/app/storage");
};

const getPath = (urlString) => new URL(urlString).pathname.replace("/rest/v1/", "");

const createMemoryStorage = (setItemImpl = null) => {
  const db = new Map();
  return {
    getItem: vi.fn((key) => (db.has(key) ? db.get(key) : null)),
    setItem: vi.fn((key, value) => {
      if (setItemImpl) return setItemImpl(key, value);
      db.set(key, value);
      return undefined;
    }),
    removeItem: vi.fn((key) => db.delete(key)),
    clear: vi.fn(() => db.clear()),
  };
};

describe("sync orchestration runtime cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles fetch-success with partial push failures across mixed kinds", async () => {
    global.fetch = vi.fn(async (url, options = {}) => {
      const path = getPath(url);
      if (path === "dogs" && (options.method || "GET") === "GET") return jsonResponse(200, []);
      if (path === "dogs" && (options.method || "GET") === "POST") return jsonResponse(201, {});
      if (path === "sessions" && (options.method || "GET") === "POST") return jsonResponse(201, {});
      if (path === "walks" && (options.method || "GET") === "POST") return jsonResponse(503, { message: "walk table timeout" });
      if (path === "feedings" && (options.method || "GET") === "POST") return jsonResponse(201, {});
      return jsonResponse(200, []);
    });

    const { syncPush } = await setupStorageModule();
    const dog = { id: "DOG-ORCH", dogName: "Nori" };

    const sessionPush = await syncPush("dog-orch", "session", {
      id: "sess-1",
      date: "2026-04-10T09:00:00.000Z",
      plannedDuration: 120,
      actualDuration: 120,
      distressLevel: "none",
      result: "success",
    }, dog);
    const walkPush = await syncPush("dog-orch", "walk", {
      id: "walk-1",
      date: "2026-04-10T10:00:00.000Z",
      duration: 900,
      type: "regular_walk",
    }, dog);
    const feedingPush = await syncPush("dog-orch", "feeding", {
      id: "feed-1",
      date: "2026-04-10T11:00:00.000Z",
      foodType: "meal",
      amount: "small",
    }, dog);

    expect(sessionPush.ok).toBe(true);
    expect(walkPush.ok).toBe(false);
    expect(feedingPush.ok).toBe(true);

    const summary = computeSyncSummary({
      syncEnabled: true,
      sessions: [{ id: "sess-1", pendingSync: false, syncState: SYNC_STATE.SYNCED }],
      walks: [{ id: "walk-1", pendingSync: true, syncState: SYNC_STATE.ERROR, syncError: walkPush.error }],
      feedings: [{ id: "feed-1", pendingSync: false, syncState: SYNC_STATE.SYNCED }],
      patterns: [],
      tombstones: [],
      syncStatus: "err",
      syncError: walkPush.error,
    });

    expect(summary.badgeState).toBe("err");
    expect(summary.label).toMatch(/need sync/);
  });

  it("recovers from interrupted mid-flight sync on retry and reconciles remote state", async () => {
    let shouldFailSessionPush = true;
    const remoteSessions = [];

    global.fetch = vi.fn(async (url, options = {}) => {
      const path = getPath(url);
      const method = (options.method || "GET").toUpperCase();
      if (path === "dogs" && method === "GET") return jsonResponse(200, []);
      if (path === "dogs" && method === "POST") return jsonResponse(201, {});
      if (path === "sessions" && method === "POST") {
        if (shouldFailSessionPush) {
          shouldFailSessionPush = false;
          return jsonResponse(500, { message: "network interrupted" });
        }
        remoteSessions.push(JSON.parse(options.body || "{}"));
        return jsonResponse(201, {});
      }
      if (path === "sessions" && method === "GET") return jsonResponse(200, remoteSessions);
      return jsonResponse(200, []);
    });

    const { syncPush, mergeMutationSafeSyncCollection } = await setupStorageModule();
    const dog = { id: "DOG-RETRY", dogName: "Miso" };

    const localSession = {
      id: "sess-retry",
      date: "2026-04-11T09:00:00.000Z",
      plannedDuration: 180,
      actualDuration: 150,
      distressLevel: "subtle",
      result: "distress",
      pendingSync: true,
      syncState: SYNC_STATE.LOCAL,
    };

    const firstAttempt = await syncPush("DOG-RETRY", "session", localSession, dog);
    expect(firstAttempt.ok).toBe(false);

    const erroredLocal = [{ ...localSession, syncState: SYNC_STATE.ERROR, syncError: firstAttempt.error, pendingSync: true }];
    const failureSummary = computeSyncSummary({
      syncEnabled: true,
      sessions: erroredLocal,
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [],
      syncStatus: "err",
      syncError: firstAttempt.error,
    });
    expect(failureSummary.badgeState).toBe("err");

    const retryAttempt = await syncPush("DOG-RETRY", "session", localSession, dog);
    expect(retryAttempt.ok).toBe(true);
    expect(remoteSessions).toHaveLength(1);

    const localAfterRetry = [{ ...erroredLocal[0], pendingSync: false, syncState: SYNC_STATE.SYNCED, syncError: "" }];
    const reconciled = mergeMutationSafeSyncCollection({
      currentItems: localAfterRetry,
      remoteItems: [{
        id: "sess-retry",
        date: "2026-04-11T09:00:00.000Z",
        plannedDuration: 180,
        actualDuration: 150,
        distressLevel: "subtle",
        result: "distress",
      }],
      tombstones: [],
      kind: "session",
      mapLocalItem: (entry) => entry,
      mapRemoteItem: (entry) => ({ ...entry, pendingSync: false, syncState: SYNC_STATE.SYNCED, syncError: "" }),
    });

    expect(reconciled[0]).toEqual(expect.objectContaining({
      id: "sess-retry",
      pendingSync: false,
      syncState: SYNC_STATE.SYNCED,
    }));

    const successSummary = computeSyncSummary({
      syncEnabled: true,
      sessions: reconciled,
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [],
      syncStatus: "ok",
      syncError: "",
    });
    expect(successSummary.badgeState).toBe("ok");
  });

  it("hydrates pending tombstones from reload and preserves retry semantics until confirmed", async () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);

    save(tombKey("DOG-HYDRATE"), [{
      id: "walk-dead",
      kind: "walk",
      deletedAt: "2026-04-12T08:00:00.000Z",
      revision: 4,
      pendingSync: true,
      syncState: SYNC_STATE.ERROR,
      syncError: "Delete marker push failed",
    }]);
    save(sessKey("DOG-HYDRATE"), [{
      id: "walk-dead",
      date: "2026-04-12T07:30:00.000Z",
      plannedDuration: 120,
      actualDuration: 90,
      distressLevel: "subtle",
      result: "distress",
    }]);

    const hydrated = hydrateDogFromLocal("DOG-HYDRATE");
    const filteredSessions = applyTombstonesToCollection(hydrated.sessions, hydrated.tombstones, "session");

    expect(hydrated.tombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "walk-dead", pendingSync: true, syncState: SYNC_STATE.ERROR }),
    ]));
    expect(filteredSessions).toHaveLength(1);

    const pendingSummary = computeSyncSummary({
      syncEnabled: true,
      sessions: hydrated.sessions,
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: hydrated.tombstones,
      syncStatus: "ok",
      syncError: "",
    });
    expect(pendingSummary.badgeState).toBe("err");

    global.fetch = vi.fn(async (url, options = {}) => {
      const path = getPath(url);
      if (path === "dogs" && (options.method || "GET") === "GET") return jsonResponse(200, []);
      if (path === "dogs" && (options.method || "GET") === "POST") return jsonResponse(201, {});
      if (path === "walks" && (options.method || "GET") === "POST") return jsonResponse(201, {});
      return jsonResponse(200, []);
    });

    const { syncPushTombstone } = await setupStorageModule();
    const pushResult = await syncPushTombstone("DOG-HYDRATE", hydrated.tombstones[0], { id: "DOG-HYDRATE", dogName: "Echo" });
    expect(pushResult.ok).toBe(true);

    const confirmedSummary = computeSyncSummary({
      syncEnabled: true,
      sessions: hydrated.sessions,
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [{ ...hydrated.tombstones[0], pendingSync: false, syncState: SYNC_STATE.SYNCED, syncError: "" }],
      syncStatus: "ok",
      syncError: "",
    });
    expect(confirmedSummary.badgeState).toBe("ok");
  });

  it("surfaces explicit error states when localStorage.setItem throws", () => {
    const storage = createMemoryStorage(() => {
      throw new Error("quota exceeded");
    });
    vi.stubGlobal("localStorage", storage);

    const rawSave = save(sessKey("DOG-STORE-ERR"), [{ id: "sess-err" }]);
    expect(rawSave.ok).toBe(false);

    const persisted = persistValue(sessKey("DOG-STORE-ERR"), [{ id: "sess-err" }], save);
    expect(persisted.ok).toBe(false);
    expect(persisted.error).toContain("Unable to save local data");

    const erroredEntries = markCollectionStorageError([{ id: "sess-err", pendingSync: false, syncState: SYNC_STATE.SYNCED }], persisted.error);
    expect(erroredEntries[0]).toEqual(expect.objectContaining({
      id: "sess-err",
      pendingSync: true,
      syncState: SYNC_STATE.ERROR,
      syncError: expect.stringContaining("Unable to save local data"),
    }));

    const summary = computeSyncSummary({
      syncEnabled: true,
      sessions: erroredEntries,
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [],
      syncStatus: "ok",
      syncError: persisted.error,
    });
    expect(summary.badgeState).toBe("err");
    expect(summary.detail).toContain("Unable to save local data");

    expect(formatStorageWriteError(new Error("quota exceeded"), sessKey("DOG-STORE-ERR"))).toContain(sessKey("DOG-STORE-ERR"));
  });

  it("never reports healthy status while pending or errored sync artifacts remain", () => {
    const withLocalPending = computeSyncSummary({
      syncEnabled: true,
      sessions: [{ id: "sess-local", pendingSync: true, syncState: SYNC_STATE.LOCAL }],
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [],
      syncStatus: "ok",
      syncError: "",
    });
    expect(withLocalPending.badgeState).not.toBe("ok");

    const withErroredTombstone = computeSyncSummary({
      syncEnabled: true,
      sessions: [],
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [{ id: "dead-1", kind: "session", pendingSync: true, syncState: SYNC_STATE.ERROR, syncError: "network" }],
      syncStatus: "ok",
      syncError: "",
    });
    expect(withErroredTombstone.badgeState).toBe("err");

    const healthyOnlyWhenClean = computeSyncSummary({
      syncEnabled: true,
      sessions: [{ id: "sess-synced", pendingSync: false, syncState: SYNC_STATE.SYNCED }],
      walks: [],
      patterns: [],
      feedings: [],
      tombstones: [{ id: "dead-1", kind: "session", pendingSync: false, syncState: SYNC_STATE.SYNCED }],
      syncStatus: "ok",
      syncError: "",
    });
    expect(healthyOnlyWhenClean.badgeState).toBe("ok");
  });
});
