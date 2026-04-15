export const SYNC_STATE = {
  LOCAL: "local",
  SYNCING: "syncing",
  SYNCED: "synced",
  ERROR: "error",
};

export const computeSyncSummary = ({
  syncEnabled,
  sessions = [],
  walks = [],
  patterns = [],
  feedings = [],
  tombstones = [],
  syncStatus = "idle",
  syncError = "",
}) => {
  const allEntries = [...sessions, ...walks, ...patterns, ...feedings, ...tombstones];
  const counts = allEntries.reduce((acc, entry) => {
    const state = entry?.syncState || (entry?.pendingSync ? SYNC_STATE.LOCAL : SYNC_STATE.SYNCED);
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, { [SYNC_STATE.LOCAL]: 0, [SYNC_STATE.SYNCING]: 0, [SYNC_STATE.SYNCED]: 0, [SYNC_STATE.ERROR]: 0 });

  if (!syncEnabled) {
    return {
      badgeState: "idle",
      label: "Local only",
      detail: "Sync is disabled. Entries stay on this device until sync is configured.",
    };
  }

  if (counts[SYNC_STATE.ERROR] > 0 || syncStatus === "err") {
    return {
      badgeState: "err",
      label: `${counts[SYNC_STATE.ERROR] || 1} need sync`,
      detail: syncError || "Some changes are only local because the last sync failed.",
    };
  }

  if (counts[SYNC_STATE.SYNCING] > 0 || syncStatus === "syncing") {
    return {
      badgeState: "syncing",
      label: `${counts[SYNC_STATE.SYNCING] || 1} syncing`,
      detail: "Recent changes are being confirmed with the server.",
    };
  }

  if (counts[SYNC_STATE.LOCAL] > 0) {
    return {
      badgeState: "idle",
      label: `${counts[SYNC_STATE.LOCAL]} local only`,
      detail: "These changes are stored locally and will stay visible until the server confirms them.",
    };
  }

  if (syncStatus === "partial") {
    return {
      badgeState: "idle",
      label: "Partial sync",
      detail: syncError || "Some optional activity tables are unavailable on the server, so sync coverage is incomplete.",
    };
  }

  return {
    badgeState: "ok",
    label: allEntries.length ? "All confirmed" : "Ready",
    detail: allEntries.length ? "All visible activity is confirmed by the server." : "No local changes are waiting for sync.",
  };
};
