import { afterEach, describe, expect, it, vi } from "vitest";
import { markCollectionStorageError, persistJoinedDogState, persistValue } from "../src/features/app/persistence";
import { save } from "../src/features/app/storage";

const makeStorageMock = (setItemImpl) => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(setItemImpl),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

describe("local write failure handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns save failure details when localStorage.setItem throws", () => {
    const storage = makeStorageMock(() => {
      throw new Error("quota exceeded");
    });
    vi.stubGlobal("localStorage", storage);

    const result = save("pawtimer_any", { value: 1 });

    expect(result.ok).toBe(false);
    expect(String(result.error?.message || result.error)).toContain("quota exceeded");
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("marks mutation entries as unsynced error on persistence failure", () => {
    const storage = makeStorageMock(() => {
      throw new Error("disk full");
    });
    vi.stubGlobal("localStorage", storage);

    const persisted = persistValue("pawtimer_sess_v5_DOG1", [{ id: "s1", pendingSync: false, syncState: "synced" }], save);
    const errored = markCollectionStorageError([{ id: "s1", pendingSync: false, syncState: "synced", syncError: "" }], persisted.error);

    expect(persisted.ok).toBe(false);
    expect(errored).toEqual([
      expect.objectContaining({
        id: "s1",
        pendingSync: true,
        syncState: "error",
        syncError: expect.stringContaining("Unable to save local data"),
      }),
    ]);
  });

  it("surfaces joined-sync persistence failure when any write throws", () => {
    const storage = makeStorageMock(() => {
      throw new Error("storage unavailable");
    });
    vi.stubGlobal("localStorage", storage);

    const result = persistJoinedDogState({
      dogId: "DOG1",
      sessions: [{ id: "s1" }],
      walks: [{ id: "w1" }],
      patterns: [{ id: "p1" }],
      feedings: [{ id: "f1" }],
      tombstones: [{ id: "s1", kind: "session" }],
      saveFn: save,
    });

    expect(result.ok).toBe(false);
    expect(result.failedKey).toContain("pawtimer_sess_v5_DOG1");
    expect(result.error).toContain("Unable to save local data");
  });
});
