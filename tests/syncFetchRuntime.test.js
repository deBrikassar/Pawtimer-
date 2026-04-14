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
    const { result, error } = await syncFetch("dog1");

    expect(error).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(sessionSelectAttempts.length).toBe(2);
    expect(sessionSelectAttempts[0]).toContain("latency_to_first_distress");
    expect(sessionSelectAttempts[1]).not.toContain("latency_to_first_distress");
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
    const { result, error } = await syncFetch("DOG1");

    expect(error).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(result.patterns).toEqual([]);
    expect(result.feedings).toEqual([]);
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
  });
});
