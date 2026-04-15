import { describe, expect, it } from "vitest";
import { computeSyncSummary, SYNC_STATE } from "../src/features/app/syncSummary";
import {
  buildPartialCapabilitySyncMessage,
  isKindSupportedForOutboundSync,
  partitionPendingOutboundByCapability,
} from "../src/features/app/syncCapability";

describe("sync capability outbound enforcement", () => {
  const partialCapability = {
    mode: "partial",
    missingOptionalTables: ["patterns", "feedings"],
    tableSupport: {
      sessions: { supported: true, optional: false },
      walks: { supported: true, optional: false },
      patterns: { supported: false, optional: true },
      feedings: { supported: false, optional: true },
    },
  };

  it("marks patterns as unsupported while keeping sessions supported", () => {
    expect(isKindSupportedForOutboundSync("pattern", partialCapability)).toBe(false);
    expect(isKindSupportedForOutboundSync("session", partialCapability)).toBe(true);
  });

  it("marks feedings as unsupported while keeping walks supported", () => {
    expect(isKindSupportedForOutboundSync("feeding", partialCapability)).toBe(false);
    expect(isKindSupportedForOutboundSync("walk", partialCapability)).toBe(true);
  });

  it("partitions pending outbound pushes so unsupported kinds are skipped", () => {
    const pending = [
      { kind: "session", entry: { id: "sess-1", pendingSync: true } },
      { kind: "walk", entry: { id: "walk-1", pendingSync: true } },
      { kind: "pattern", entry: { id: "pat-1", pendingSync: true } },
      { kind: "feeding", entry: { id: "feed-1", pendingSync: true } },
    ];
    const partitioned = partitionPendingOutboundByCapability(pending, partialCapability);
    expect(partitioned.supported.map((item) => item.kind)).toEqual(["session", "walk"]);
    expect(partitioned.unsupported.map((item) => item.kind)).toEqual(["pattern", "feeding"]);
  });

  it("builds explicit partial-capability messaging including unsynced unsupported counts", () => {
    const message = buildPartialCapabilitySyncMessage(partialCapability, 2);
    expect(message).toContain("Partial sync active");
    expect(message).toContain("patterns, feedings unavailable");
    expect(message).toContain("2 local changes cannot sync");
  });

  it("reports partial status cleanly when unsupported local entries are present", () => {
    const summary = computeSyncSummary({
      syncEnabled: true,
      sessions: [],
      walks: [],
      patterns: [{ id: "pat-1", pendingSync: true, syncState: SYNC_STATE.UNSUPPORTED }],
      feedings: [],
      tombstones: [],
      syncStatus: "partial",
      syncError: "Partial sync active: patterns unavailable.",
    });

    expect(summary.badgeState).toBe("idle");
    expect(summary.label).toBe("Partial sync");
    expect(summary.detail).toContain("Partial sync active");
  });

  it("keeps full capability outbound sync untouched for supported tables", () => {
    const fullCapability = {
      mode: "full",
      missingOptionalTables: [],
      tableSupport: {
        sessions: { supported: true, optional: false },
        walks: { supported: true, optional: false },
        patterns: { supported: true, optional: true },
        feedings: { supported: true, optional: true },
      },
    };
    const pending = [
      { kind: "session", entry: { id: "sess-1", pendingSync: true } },
      { kind: "walk", entry: { id: "walk-1", pendingSync: true } },
      { kind: "pattern", entry: { id: "pat-1", pendingSync: true } },
      { kind: "feeding", entry: { id: "feed-1", pendingSync: true } },
    ];
    const partitioned = partitionPendingOutboundByCapability(pending, fullCapability);
    expect(partitioned.unsupported).toHaveLength(0);
    expect(partitioned.supported).toHaveLength(4);
  });
});

