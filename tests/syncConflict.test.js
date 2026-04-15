import { describe, expect, it } from "vitest";
import { applyTombstonesToCollection, mergeMutationSafeSyncCollection, mergeTombstonesByEntityKey, resolveDogSettingsConflict, resolveSyncConflict } from "../src/features/app/storage";

const iso = (hour) => `2026-04-01T${String(hour).padStart(2, "0")}:00:00.000Z`;

describe("resolveSyncConflict", () => {
  it("prefers higher revision even when updatedAt is older", () => {
    const local = { id: "session-1", revision: 3, updatedAt: iso(9), note: "local" };
    const remote = { id: "session-1", revision: 2, updatedAt: iso(10), note: "remote" };

    expect(resolveSyncConflict(local, remote)).toBe(local);
  });

  it("falls back to updatedAt when revisions match", () => {
    const local = { id: "session-1", revision: 4, updatedAt: iso(9), note: "local" };
    const remote = { id: "session-1", revision: 4, updatedAt: iso(11), note: "remote" };

    expect(resolveSyncConflict(local, remote)).toBe(remote);
  });

  it("prefers deletion tombstones over stale updates", () => {
    const localDelete = { id: "session-1", revision: 6, updatedAt: iso(12), deletedAt: iso(12) };
    const remoteActive = { id: "session-1", revision: 5, updatedAt: iso(13), result: "success" };

    expect(resolveSyncConflict(localDelete, remoteActive)).toBe(localDelete);
  });

  it("allows newer updates to win against older tombstones", () => {
    const localDelete = { id: "session-1", revision: 4, updatedAt: iso(10), deletedAt: iso(10) };
    const remoteActive = { id: "session-1", revision: 5, updatedAt: iso(11), result: "success" };

    expect(resolveSyncConflict(localDelete, remoteActive)).toBe(remoteActive);
  });
});

describe("mergeMutationSafeSyncCollection concurrent edits", () => {
  it("keeps the higher revision entry across arrays", () => {
    const localSessions = [{ id: "session-1", date: iso(8), revision: 5, updatedAt: iso(8), result: "success" }];
    const remoteSessions = [{ id: "session-1", date: iso(8), revision: 4, updatedAt: iso(10), result: "distress" }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: localSessions,
      remoteItems: remoteSessions,
      kind: "session",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(5);
    expect(merged[0].result).toBe("success");
  });

  it("uses latest update when concurrent edits have the same revision", () => {
    const localPatterns = [{ id: "pattern-1", date: iso(8), revision: 8, updatedAt: iso(9), type: "keys" }];
    const remotePatterns = [{ id: "pattern-1", date: iso(8), revision: 8, updatedAt: iso(12), type: "jacket" }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: localPatterns,
      remoteItems: remotePatterns,
      kind: "pattern",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe("jacket");
    expect(merged[0].updatedAt).toBe(iso(12));
  });

  it("prefers higher pattern revision over newer updatedAt", () => {
    const localPatterns = [{ id: "pattern-2", date: iso(8), revision: 10, updatedAt: iso(9), type: "keys" }];
    const remotePatterns = [{ id: "pattern-2", date: iso(8), revision: 9, updatedAt: iso(12), type: "jacket" }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: localPatterns,
      remoteItems: remotePatterns,
      kind: "pattern",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(10);
    expect(merged[0].type).toBe("keys");
  });

  it("prefers higher feeding revision over newer updatedAt", () => {
    const localFeedings = [{ id: "feeding-1", date: iso(8), revision: 6, updatedAt: iso(9), foodType: "meal", amount: "small" }];
    const remoteFeedings = [{ id: "feeding-1", date: iso(8), revision: 5, updatedAt: iso(12), foodType: "snack", amount: "large" }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: localFeedings,
      remoteItems: remoteFeedings,
      kind: "feeding",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(6);
    expect(merged[0].foodType).toBe("meal");
  });

  it("preserves non-default walk type when higher revision wins", () => {
    const localWalks = [{ id: "walk-1", date: iso(8), revision: 3, updatedAt: iso(8), type: "training_walk", duration: 900 }];
    const remoteWalks = [{ id: "walk-1", date: iso(8), revision: 2, updatedAt: iso(10), type: "regular_walk", duration: 900 }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: localWalks,
      remoteItems: remoteWalks,
      kind: "walk",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(3);
    expect(merged[0].type).toBe("training_walk");
  });

  it("preserves local edit made after sync start when remote has older revision", () => {
    const staleSnapshot = [{ id: "session-1", date: iso(8), revision: 1, updatedAt: iso(8), result: "success" }];
    const currentLocal = [{ id: "session-1", date: iso(8), revision: 2, updatedAt: iso(10), result: "distress" }];
    const remoteSessions = staleSnapshot;

    const merged = mergeMutationSafeSyncCollection({
      currentItems: currentLocal,
      remoteItems: remoteSessions,
      kind: "session",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(2);
    expect(merged[0].result).toBe("distress");
  });

  it("preserves local create made during in-flight sync when absent remotely", () => {
    const currentLocal = [
      { id: "session-1", date: iso(8), revision: 1, updatedAt: iso(8), result: "success" },
      { id: "session-new", date: iso(9), revision: 1, updatedAt: iso(9), result: "distress", pendingSync: true },
    ];
    const remoteSessions = [{ id: "session-1", date: iso(8), revision: 1, updatedAt: iso(8), result: "success" }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: currentLocal,
      remoteItems: remoteSessions,
      kind: "session",
    });

    expect(merged.map((row) => row.id)).toEqual(["session-1", "session-new"]);
    expect(merged.find((row) => row.id === "session-new")?.pendingSync).toBe(true);
  });

  it("preserves local delete made during in-flight sync via tombstone", () => {
    const currentLocal = [{ id: "walk-1", date: iso(8), revision: 1, updatedAt: iso(8), duration: 600 }];
    const remoteWalks = [{ id: "walk-1", date: iso(8), revision: 1, updatedAt: iso(8), duration: 600 }];
    const tombstones = [{ id: "walk-1", kind: "walk", deletedAt: iso(10), revision: 2, updatedAt: iso(10), pendingSync: true }];

    const merged = mergeMutationSafeSyncCollection({
      currentItems: currentLocal,
      remoteItems: remoteWalks,
      tombstones,
      kind: "walk",
    });

    expect(merged).toEqual([]);
  });

  it("keeps in-flight tombstone creation even when remote has no tombstone yet", () => {
    const localTombstones = [{ id: "feeding-1", kind: "feeding", deletedAt: iso(11), revision: 4, updatedAt: iso(11), pendingSync: true }];
    const remoteTombstones = [];

    const mergedTombstones = mergeMutationSafeSyncCollection({
      currentItems: localTombstones,
      remoteItems: remoteTombstones,
      kind: "feeding",
      mapLocalItem: (item) => item,
      mapRemoteItem: (item) => item,
    });

    expect(mergedTombstones).toEqual(localTombstones);
  });

  it("keeps tombstones for different kinds when ids match", () => {
    const localTombstones = [{ id: "shared-1", kind: "session", deletedAt: iso(9), revision: 2, updatedAt: iso(9), pendingSync: true }];
    const remoteTombstones = [{ id: "shared-1", kind: "walk", deletedAt: iso(10), revision: 3, updatedAt: iso(10), pendingSync: false }];

    const mergedTombstones = mergeTombstonesByEntityKey(localTombstones, remoteTombstones);

    expect(mergedTombstones).toHaveLength(2);
    expect(mergedTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shared-1", kind: "session" }),
      expect.objectContaining({ id: "shared-1", kind: "walk" }),
    ]));
  });

  it("suppresses only matching kind when id is shared across kinds", () => {
    const tombstones = [
      { id: "shared-2", kind: "session", deletedAt: iso(12), revision: 4, updatedAt: iso(12) },
      { id: "shared-2", kind: "walk", deletedAt: iso(13), revision: 5, updatedAt: iso(13) },
    ];
    const sessions = [
      { id: "shared-2", date: iso(8), revision: 1, updatedAt: iso(8), result: "success" },
      { id: "session-live", date: iso(9), revision: 1, updatedAt: iso(9), result: "success" },
    ];
    const feedings = [
      { id: "shared-2", date: iso(8), revision: 1, updatedAt: iso(8), foodType: "meal", amount: "small" },
    ];

    const filteredSessions = applyTombstonesToCollection(sessions, tombstones, "session");
    const filteredFeedings = applyTombstonesToCollection(feedings, tombstones, "feeding");

    expect(filteredSessions.map((row) => row.id)).toEqual(["session-live"]);
    expect(filteredFeedings.map((row) => row.id)).toEqual(["shared-2"]);
  });
});

describe("resolveDogSettingsConflict", () => {
  it("keeps local settings when local metadata is newer", () => {
    const localDog = { id: "DOG-A", dogName: "Luna", revision: 5, updatedAt: iso(11) };
    const remoteDog = { id: "DOG-A", dogName: "Luna Remote", revision: 4, updatedAt: iso(12) };

    expect(resolveDogSettingsConflict(localDog, remoteDog)).toEqual(localDog);
  });

  it("uses remote settings when remote metadata is newer", () => {
    const localDog = { id: "DOG-B", dogName: "Milo", revision: 3, updatedAt: iso(9) };
    const remoteDog = { id: "DOG-B", dogName: "Milo Remote", revision: 3, updatedAt: iso(10) };

    expect(resolveDogSettingsConflict(localDog, remoteDog)).toEqual(remoteDog);
  });

  it("resolves concurrent same-metadata edits deterministically", () => {
    const localDog = { id: "DOG-C", dogName: "Nova", goalSeconds: 1800, revision: 7, updatedAt: iso(13) };
    const remoteDog = { id: "DOG-C", dogName: "Nova", goalSeconds: 2400, revision: 7, updatedAt: iso(13) };

    const winnerFromLocalFirst = resolveDogSettingsConflict(localDog, remoteDog);
    const winnerFromRemoteFirst = resolveDogSettingsConflict(remoteDog, localDog);

    expect(winnerFromLocalFirst).toEqual(winnerFromRemoteFirst);
    expect(winnerFromLocalFirst).toEqual(remoteDog);
  });
});
