import { describe, expect, it } from "vitest";
import { mergeById, resolveSyncConflict } from "../src/features/app/storage";

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

describe("mergeById concurrent edits", () => {
  it("keeps the higher revision entry across arrays", () => {
    const localSessions = [{ id: "session-1", date: iso(8), revision: 5, updatedAt: iso(8), result: "success" }];
    const remoteSessions = [{ id: "session-1", date: iso(8), revision: 4, updatedAt: iso(10), result: "distress" }];

    const merged = mergeById(localSessions, remoteSessions);

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(5);
    expect(merged[0].result).toBe("success");
  });

  it("uses latest update when concurrent edits have the same revision", () => {
    const localPatterns = [{ id: "pattern-1", date: iso(8), revision: 8, updatedAt: iso(9), type: "keys" }];
    const remotePatterns = [{ id: "pattern-1", date: iso(8), revision: 8, updatedAt: iso(12), type: "jacket" }];

    const merged = mergeById(localPatterns, remotePatterns);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe("jacket");
    expect(merged[0].updatedAt).toBe(iso(12));
  });

  it("prefers higher pattern revision over newer updatedAt", () => {
    const localPatterns = [{ id: "pattern-2", date: iso(8), revision: 10, updatedAt: iso(9), type: "keys" }];
    const remotePatterns = [{ id: "pattern-2", date: iso(8), revision: 9, updatedAt: iso(12), type: "jacket" }];

    const merged = mergeById(localPatterns, remotePatterns);

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(10);
    expect(merged[0].type).toBe("keys");
  });

  it("prefers higher feeding revision over newer updatedAt", () => {
    const localFeedings = [{ id: "feeding-1", date: iso(8), revision: 6, updatedAt: iso(9), foodType: "meal", amount: "small" }];
    const remoteFeedings = [{ id: "feeding-1", date: iso(8), revision: 5, updatedAt: iso(12), foodType: "snack", amount: "large" }];

    const merged = mergeById(localFeedings, remoteFeedings);

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(6);
    expect(merged[0].foodType).toBe("meal");
  });

  it("preserves non-default walk type when higher revision wins", () => {
    const localWalks = [{ id: "walk-1", date: iso(8), revision: 3, updatedAt: iso(8), type: "training_walk", duration: 900 }];
    const remoteWalks = [{ id: "walk-1", date: iso(8), revision: 2, updatedAt: iso(10), type: "regular_walk", duration: 900 }];

    const merged = mergeById(localWalks, remoteWalks);

    expect(merged).toHaveLength(1);
    expect(merged[0].revision).toBe(3);
    expect(merged[0].type).toBe("training_walk");
  });
});
