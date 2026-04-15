import { ensureArray, ensureObject } from "./storage";

const DEFAULT_TABLE_SUPPORT = {
  sessions: { supported: true, optional: false },
  walks: { supported: true, optional: false },
  patterns: { supported: true, optional: true },
  feedings: { supported: true, optional: true },
};

const KIND_TO_TABLE = {
  session: "sessions",
  walk: "walks",
  pattern: "patterns",
  feeding: "feedings",
};

export const normalizeSyncCapabilityProfile = (syncCapability = null) => {
  const profile = ensureObject(syncCapability);
  const tableSupport = { ...DEFAULT_TABLE_SUPPORT, ...ensureObject(profile.tableSupport) };
  const missingOptionalTables = ensureArray(profile.missingOptionalTables).filter((table) => typeof table === "string" && table.trim());
  const mode = profile.mode === "partial" || missingOptionalTables.length ? "partial" : "full";
  return {
    mode,
    missingOptionalTables,
    tableSupport,
  };
};

export const isKindSupportedForOutboundSync = (kind, syncCapability = null) => {
  const profile = normalizeSyncCapabilityProfile(syncCapability);
  const table = KIND_TO_TABLE[kind];
  if (!table) return true;
  return profile.tableSupport?.[table]?.supported !== false;
};

export const partitionPendingOutboundByCapability = (pendingEntries = [], syncCapability = null) => {
  const supported = [];
  const unsupported = [];
  ensureArray(pendingEntries).forEach((pendingEntry) => {
    if (!pendingEntry?.entry?.pendingSync) return;
    if (isKindSupportedForOutboundSync(pendingEntry.kind, syncCapability)) {
      supported.push(pendingEntry);
      return;
    }
    unsupported.push(pendingEntry);
  });
  return { supported, unsupported };
};

export const buildPartialCapabilitySyncMessage = (syncCapability = null, unsupportedPendingCount = 0) => {
  const profile = normalizeSyncCapabilityProfile(syncCapability);
  if (profile.mode !== "partial") return "";
  const unsupportedTables = ensureArray(profile.missingOptionalTables).join(", ");
  const pendingSuffix = unsupportedPendingCount > 0
    ? ` ${unsupportedPendingCount} local change${unsupportedPendingCount === 1 ? "" : "s"} cannot sync until those tables are available.`
    : "";
  return `Partial sync active: ${unsupportedTables} unavailable.${pendingSuffix}`;
};

