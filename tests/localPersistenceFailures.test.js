import { beforeEach, describe, expect, it } from "vitest";
import { getLocalPersistenceState, resetLocalPersistenceState, save } from "../src/features/app/storage";

const createStorageMock = () => {
  let shouldThrow = false;
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (shouldThrow) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    failWrites: () => { shouldThrow = true; },
    allowWrites: () => { shouldThrow = false; },
  };
};

describe("local persistence failure handling", () => {
  beforeEach(() => {
    const storage = createStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
    resetLocalPersistenceState();
  });

  it("captures localStorage quota/write failures instead of silently succeeding", () => {
    localStorage.failWrites();

    const ok = save("pawtimer_dogs_v3", [{ id: "DOG-1" }]);
    const state = getLocalPersistenceState();

    expect(ok).toBe(false);
    expect(state.syncState).toBe("error");
    expect(state.failedKeys).toEqual(["pawtimer_dogs_v3"]);
    expect(state.lastError).toContain("Local persistence error:");
    expect(state.lastError).toContain("QuotaExceededError");
  });

  it("marks durability failure when a mutation is followed by failed persistence", () => {
    expect(save("pawtimer_sess_v5_DOG-1", [{ id: "s1", actualDuration: 30 }])).toBe(true);

    localStorage.failWrites();
    const failed = save("pawtimer_sess_v5_DOG-1", [{ id: "s1", actualDuration: 45 }]);
    const state = getLocalPersistenceState();

    expect(failed).toBe(false);
    expect(state.syncState).toBe("error");
    expect(state.failedKeys).toContain("pawtimer_sess_v5_DOG-1");
    expect(JSON.parse(localStorage.getItem("pawtimer_sess_v5_DOG-1"))).toEqual([{ id: "s1", actualDuration: 30 }]);
  });

  it("clears sync/error durability state once persistence succeeds again", () => {
    localStorage.failWrites();
    expect(save("pawtimer_walk_v4_DOG-1", [{ id: "w1", duration: 120 }])).toBe(false);
    expect(getLocalPersistenceState().syncState).toBe("error");

    localStorage.allowWrites();
    expect(save("pawtimer_walk_v4_DOG-1", [{ id: "w1", duration: 180 }])).toBe(true);

    const state = getLocalPersistenceState();
    expect(state.syncState).toBe("ok");
    expect(state.failedKeys).toEqual([]);
    expect(state.lastError).toBe("");
  });
});
