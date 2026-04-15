import { beforeEach, describe, expect, it, vi } from "vitest";

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

const getPathAndParams = (urlString) => {
  const url = new URL(urlString);
  return {
    path: url.pathname.replace("/rest/v1/", ""),
    params: url.searchParams,
  };
};

describe("syncFetch runtime fallbacks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retries sessions query when a projected column is missing", async () => {
    const sessionSelectAttempts = [];
    global.fetch = vi.fn(async (url) => {
      const { path, params } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG1", settings: { dogName: "Rex" } }]);
      if (path === "sessions") {
        const select = params.get("select") || "";
        sessionSelectAttempts.push(select);
        if (select.includes("latency_to_first_distress")) {
          return jsonResponse(400, { message: "column sessions.latency_to_first_distress does not exist" });
        }
        return jsonResponse(200, [{
          id: "s1",
          dog_id: "DOG1",
          date: "2026-01-01T00:00:00.000Z",
          planned_duration: 60,
          actual_duration: 60,
          distress_level: "none",
          result: "success",
        }]);
      }
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error, degradation } = await syncFetch("dog1");

    expect(error).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(sessionSelectAttempts.length).toBe(2);
    expect(sessionSelectAttempts[0]).toContain("latency_to_first_distress");
    expect(sessionSelectAttempts[1]).not.toContain("latency_to_first_distress");
    expect(degradation?.isDegraded).toBe(true);
    expect(degradation?.flags).toContain("missing_fetch_column");
    expect(degradation?.messages.join(" ")).toMatch(/compatibility mode/i);
    expect(degradation?.events.some((event) => event.table === "sessions" && event.field === "latency_to_first_distress")).toBe(true);
  });

  it("degrades gracefully when optional tables are missing", async () => {
    global.fetch = vi.fn(async (url) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG1", settings: { dogName: "Rex" } }]);
      if (path === "sessions") return jsonResponse(200, [{
        id: "s1",
        dog_id: "DOG1",
        date: "2026-01-01T00:00:00.000Z",
        planned_duration: 90,
        actual_duration: 85,
        distress_level: "subtle",
        result: "distress",
      }]);
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(400, { message: "relation \"patterns\" does not exist" });
      if (path === "feedings") return jsonResponse(400, { message: "relation \"feedings\" does not exist" });
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error, degradation } = await syncFetch("DOG1");

    expect(error).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(result.patterns).toEqual([]);
    expect(result.feedings).toEqual([]);
    expect(result.syncCapability).toEqual({
      mode: "partial",
      missingOptionalTables: ["patterns", "feedings"],
      tableSupport: {
        sessions: { supported: true, optional: false },
        walks: { supported: true, optional: false },
        patterns: { supported: false, optional: true },
        feedings: { supported: false, optional: true },
      },
    });
    expect(degradation?.isDegraded).toBe(true);
    expect(degradation?.flags).toContain("missing_optional_table");
    expect(degradation?.flags).toContain("partial_sync_capability");
  });

  it("returns activity-capable data even when an optional source fails", async () => {
    global.fetch = vi.fn(async (url) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG2", settings: { dogName: "Milo" } }]);
      if (path === "sessions") return jsonResponse(200, [{
        id: "s-activity",
        dog_id: "DOG2",
        date: "2026-02-01T00:00:00.000Z",
        planned_duration: 120,
        actual_duration: 120,
        distress_level: "none",
        result: "success",
      }]);
      if (path === "walks") return jsonResponse(200, [{
        id: "w-activity",
        dog_id: "DOG2",
        date: "2026-02-01T03:00:00.000Z",
        duration: 600,
        walk_type: "regular_walk",
      }]);
      if (path === "patterns") return jsonResponse(400, { message: "relation \"patterns\" does not exist" });
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error } = await syncFetch("DOG2");

    expect(error).toBeNull();
    expect(result.sessions.some((session) => session.id === "s-activity")).toBe(true);
    expect(result.walks.some((walk) => walk.id === "w-activity")).toBe(true);
    expect(result.syncCapability.mode).toBe("partial");
    expect(result.syncCapability.missingOptionalTables).toEqual(["patterns"]);
    expect(result.syncCapability.tableSupport.feedings.supported).toBe(true);
  });

  it("requests walk sync metadata and preserves non-default walk types", async () => {
    const walkSelectAttempts = [];
    global.fetch = vi.fn(async (url) => {
      const { path, params } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG3", settings: { dogName: "Luna" } }]);
      if (path === "sessions") return jsonResponse(200, []);
      if (path === "walks") {
        walkSelectAttempts.push(params.get("select") || "");
        return jsonResponse(200, [{
          id: "w-training",
          dog_id: "DOG3",
          date: "2026-03-01T03:00:00.000Z",
          duration: 1200,
          walk_type: "training_walk",
          revision: 7,
          updated_at: "2026-03-01T03:01:00.000Z",
        }]);
      }
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error } = await syncFetch("DOG3");

    expect(error).toBeNull();
    expect(walkSelectAttempts[0]).toContain("walk_type");
    expect(walkSelectAttempts[0]).toContain("revision");
    expect(walkSelectAttempts[0]).toContain("updated_at");
    expect(result.walks).toEqual([{
      id: "w-training",
      date: "2026-03-01T03:00:00.000Z",
      duration: 1200,
      type: "training_walk",
      revision: 7,
      updatedAt: "2026-03-01T03:01:00.000Z",
    }]);
    expect(result.syncCapability.mode).toBe("full");
    expect(result.syncCapability.missingOptionalTables).toEqual([]);
    expect(result.syncCapability.tableSupport.patterns.supported).toBe(true);
    expect(result.syncCapability.tableSupport.feedings.supported).toBe(true);
  });

  it("round-trips severe distress via legacy distress_level constraints without collapsing to active", async () => {
    const persistedSessions = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, []);
      if (path === "sessions" && (options.method || "GET") === "POST") {
        const payload = JSON.parse(options.body || "{}");
        persistedSessions.push(payload);
        if (payload.distress_level === "severe") {
          return jsonResponse(400, { message: "new row for relation \"sessions\" violates check constraint \"sessions_distress_level_check\"" });
        }
        return jsonResponse(201, {});
      }
      if (path === "sessions") {
        const latest = persistedSessions.at(-1);
        return jsonResponse(200, latest ? [latest] : []);
      }
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch, syncPush } = await setupStorageModule();
    const pushResult = await syncPush("dog4", "session", {
      id: "s-severe",
      date: "2026-04-01T00:00:00.000Z",
      plannedDuration: 120,
      actualDuration: 20,
      distressLevel: "severe",
      distressType: "vocalization",
      result: "distress",
    }, { id: "DOG4", dogName: "Nova" });

    expect(pushResult.ok).toBe(true);
    expect(persistedSessions).toHaveLength(2);
    expect(persistedSessions[1].distress_level).toBe("strong");
    expect(persistedSessions[1].distress_type).toBe("__severity:severe|vocalization");

    const { result, error } = await syncFetch("DOG4");
    expect(error).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].distressLevel).toBe("severe");
    expect(result.sessions[0].distressType).toBe("vocalization");
  });

  it("excludes deleted rows from active payload and returns tombstones", async () => {
    global.fetch = vi.fn(async (url) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG5", settings: { dogName: "Poppy" } }]);
      if (path === "sessions") {
        return jsonResponse(200, [
          { id: "s-active", dog_id: "DOG5", date: "2026-04-01T00:00:00.000Z", planned_duration: 120, actual_duration: 120, distress_level: "none", result: "success", revision: 2, updated_at: "2026-04-01T01:00:00.000Z" },
          { id: "s-deleted", dog_id: "DOG5", date: "2026-04-01T00:00:00.000Z", planned_duration: 120, actual_duration: 50, distress_level: "subtle", result: "distress", revision: 3, updated_at: "2026-04-01T03:00:00.000Z", deleted_at: "2026-04-01T03:00:00.000Z" },
        ]);
      }
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error } = await syncFetch("DOG5");
    expect(error).toBeNull();
    expect(result.sessions.map((row) => row.id)).toEqual(["s-active"]);
    expect(result.tombstones).toEqual([
      expect.objectContaining({ id: "s-deleted", kind: "session", deletedAt: "2026-04-01T03:00:00.000Z" }),
    ]);
  });

  it("syncPushTombstone sends deletion markers to remote rows", async () => {
    const postedBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(201, {});
      if (path === "sessions" && (options.method || "GET") === "POST") {
        postedBodies.push(JSON.parse(options.body || "{}"));
        return jsonResponse(201, {});
      }
      if (path === "sessions") return jsonResponse(200, []);
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncPushTombstone } = await setupStorageModule();
    const result = await syncPushTombstone("DOG6", {
      id: "session-dead",
      kind: "session",
      deletedAt: "2026-04-02T10:00:00.000Z",
      updatedAt: "2026-04-02T10:00:00.000Z",
      revision: 9,
    }, { id: "DOG6", dogName: "June" });

    expect(result.ok).toBe(true);
    expect(postedBodies).toHaveLength(1);
    expect(postedBodies[0]).toMatchObject({
      id: "session-dead",
      dog_id: "DOG6",
      deleted_at: "2026-04-02T10:00:00.000Z",
      revision: 9,
    });
  });

  it("retries tombstone push with strict-schema compatible payload after not-null failure", async () => {
    const postedBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(201, {});
      if (path === "walks" && (options.method || "GET") === "POST") {
        const payload = JSON.parse(options.body || "{}");
        postedBodies.push(payload);
        if (postedBodies.length === 1) {
          return jsonResponse(400, { message: "null value in column \"date\" of relation \"walks\" violates not-null constraint" });
        }
        return jsonResponse(201, {});
      }
      if (path === "sessions") return jsonResponse(200, []);
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncPushTombstone } = await setupStorageModule();
    const result = await syncPushTombstone("DOG7", {
      id: "walk-dead",
      kind: "walk",
      deletedAt: "2026-04-03T09:00:00.000Z",
      updatedAt: "2026-04-03T09:00:00.000Z",
      revision: 11,
    }, { id: "DOG7", dogName: "Skye" });

    expect(result.ok).toBe(true);
    expect(postedBodies).toHaveLength(2);
    expect(postedBodies[0]).toEqual({
      id: "walk-dead",
      dog_id: "DOG7",
      deleted_at: "2026-04-03T09:00:00.000Z",
      revision: 11,
      updated_at: "2026-04-03T09:00:00.000Z",
    });
    expect(postedBodies[1]).toMatchObject({
      id: "walk-dead",
      dog_id: "DOG7",
      deleted_at: "2026-04-03T09:00:00.000Z",
      revision: 11,
      updated_at: "2026-04-03T09:00:00.000Z",
      date: "2026-04-03T09:00:00.000Z",
      duration: 0,
      walk_type: "regular_walk",
    });
  });

  it("keeps delete tombstones durable when strict-schema fallback is used", async () => {
    const postedBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(201, {});
      if (path === "feedings" && (options.method || "GET") === "POST") {
        const payload = JSON.parse(options.body || "{}");
        postedBodies.push(payload);
        if (postedBodies.length === 1) {
          return jsonResponse(400, { message: "null value in column \"date\" of relation \"feedings\" violates not-null constraint" });
        }
        return jsonResponse(201, {});
      }
      if (path === "sessions") return jsonResponse(200, []);
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncPushTombstone } = await setupStorageModule();
    const result = await syncPushTombstone("DOG8", {
      id: "feeding-dead",
      kind: "feeding",
      deletedAt: "2026-04-04T08:30:00.000Z",
      revision: 3,
    }, { id: "DOG8", dogName: "Mochi" });

    expect(result.ok).toBe(true);
    expect(postedBodies).toHaveLength(2);
    expect(postedBodies[1]).toMatchObject({
      id: "feeding-dead",
      dog_id: "DOG8",
      deleted_at: "2026-04-04T08:30:00.000Z",
      date: "2026-04-04T08:30:00.000Z",
      food_type: "tombstone",
      amount: "0",
      revision: 3,
      updated_at: "2026-04-04T08:30:00.000Z",
    });
  });

  it("preserves same-id tombstones across kinds when fetched from different tables", async () => {
    global.fetch = vi.fn(async (url) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(200, [{ id: "DOG9", settings: { dogName: "Pixel" } }]);
      if (path === "sessions") {
        return jsonResponse(200, [
          { id: "shared-dead", dog_id: "DOG9", date: "2026-04-05T00:00:00.000Z", planned_duration: 60, actual_duration: 20, distress_level: "subtle", result: "distress", revision: 6, updated_at: "2026-04-05T04:00:00.000Z", deleted_at: "2026-04-05T04:00:00.000Z" },
        ]);
      }
      if (path === "walks") {
        return jsonResponse(200, [
          { id: "shared-dead", dog_id: "DOG9", date: "2026-04-05T01:00:00.000Z", duration: 900, walk_type: "regular_walk", revision: 7, updated_at: "2026-04-05T05:00:00.000Z", deleted_at: "2026-04-05T05:00:00.000Z" },
        ]);
      }
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncFetch } = await setupStorageModule();
    const { result, error } = await syncFetch("DOG9");

    expect(error).toBeNull();
    expect(result.sessions).toEqual([]);
    expect(result.walks).toEqual([]);
    expect(result.tombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shared-dead", kind: "session", revision: 6 }),
      expect.objectContaining({ id: "shared-dead", kind: "walk", revision: 7 }),
    ]));
  });

  it("retries pattern tombstone push with strict-schema payload when metadata-only insert violates not-null", async () => {
    const postedBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      const { path } = getPathAndParams(url);
      if (path === "dogs") return jsonResponse(201, {});
      if (path === "patterns" && (options.method || "GET") === "POST") {
        const payload = JSON.parse(options.body || "{}");
        postedBodies.push(payload);
        if (postedBodies.length === 1) {
          return jsonResponse(400, { message: "null value in column \"date\" of relation \"patterns\" violates not-null constraint" });
        }
        return jsonResponse(201, {});
      }
      if (path === "sessions") return jsonResponse(200, []);
      if (path === "walks") return jsonResponse(200, []);
      if (path === "patterns") return jsonResponse(200, []);
      if (path === "feedings") return jsonResponse(200, []);
      throw new Error(`Unexpected path: ${path}`);
    });

    const { syncPushTombstone } = await setupStorageModule();
    const result = await syncPushTombstone("DOG10", {
      id: "pattern-dead",
      kind: "pattern",
      deletedAt: "2026-04-06T09:30:00.000Z",
      revision: 14,
    }, { id: "DOG10", dogName: "Arlo" });

    expect(result.ok).toBe(true);
    expect(postedBodies).toHaveLength(2);
    expect(postedBodies[1]).toMatchObject({
      id: "pattern-dead",
      dog_id: "DOG10",
      deleted_at: "2026-04-06T09:30:00.000Z",
      date: "2026-04-06T09:30:00.000Z",
      type: "keys",
      revision: 14,
      updated_at: "2026-04-06T09:30:00.000Z",
    });
  });
});
