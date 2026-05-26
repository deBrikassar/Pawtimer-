import { useEffect, useRef, useState } from "react";
import { canonicalDogId, syncFetch, syncPush, syncPushTombstone, save, mergeMutationSafeSyncCollection, applyAuthoritativeTombstonesAtCommit, normalizeDogSyncMetadata, resolveDogSettingsConflict, normalizeSessions, normalizeFeedings, normalizeTombstones, pruneTombstonesForRetention, getSyncDegradationState, syncUpsertDog, SYNC_STATE, markRemoteEntryConfirmed } from "./storage";
import { persistValue } from "./persistence";
import { normalizeWalkType } from "./helpers";
import { partitionPendingOutboundByCapability, buildPartialCapabilitySyncMessage } from "./syncCapability";
import { ensureArray } from "./storage";

export function useSyncEngine({
  SYNC_ENABLED,
  activeDogId,
  syncSnapshotRef,
  syncHelpersRef,
  tombstonesRef,
  reportLocalWriteFailure,
  setDogs,
  setTombstoneSyncState,
  withHydratedSyncState,
  markRemoteEntryConfirmed,
  commitTombstones,
  logSyncDebug
}) {
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [syncDegradation, setSyncDegradation] = useState(() => getSyncDegradationState());
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    if (!activeDogId || !SYNC_ENABLED) { setSyncStatus("idle"); setSyncError(""); return; }
    let live = true;

    const pushPendingEntry = async (kind, entry, dogSettings) => {
      if (!entry?.pendingSync || !entry?.id) return true;
      syncHelpersRef.current.setEntrySyncState(kind, entry.id, SYNC_STATE.SYNCING);
      const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, entry, dogSettings);
      setSyncDegradation(getSyncDegradationState());
      if (!live) return ok;
      if (ok) {
        syncHelpersRef.current.setEntrySyncState(kind, entry.id, SYNC_STATE.SYNCED);
        return true;
      }
      syncHelpersRef.current.setEntrySyncState(kind, entry.id, SYNC_STATE.ERROR, error || "Push failed");
      return false;
    };

    const pushPendingTombstone = async (entry, dogSettings) => {
      if (!entry?.pendingSync || !entry?.id || !entry?.kind) return true;
      setTombstoneSyncState(entry.id, entry.kind, SYNC_STATE.SYNCING);
      const { ok, error } = await syncPushTombstone(canonicalDogId(activeDogId), entry, dogSettings);
      setSyncDegradation(getSyncDegradationState());
      if (!live) return ok;
      if (ok) {
        setTombstoneSyncState(entry.id, entry.kind, SYNC_STATE.SYNCED, "", { replicationConfirmed: true });
        return true;
      }
      setTombstoneSyncState(entry.id, entry.kind, SYNC_STATE.ERROR, error || "Delete marker push failed");
      return false;
    };

    const sync = async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        if (logSyncDebug) logSyncDebug("sync:run", { trigger: "sync-effect", dogId: canonicalDogId(activeDogId) });
        setSyncStatus("syncing");
        const { result: remote, error } = await syncFetch(canonicalDogId(activeDogId));
        setSyncDegradation(getSyncDegradationState());
        if (!live) return;
        if (!remote) { setSyncStatus("err"); setSyncError(error || "Unknown sync fetch error"); return; }

        const snapshot = syncSnapshotRef.current;
        const remoteDog = remote.dog ? normalizeDogSyncMetadata({ ...remote.dog, id: canonicalDogId(remote.dog.id || activeDogId) }) : null;
        if (remoteDog) {
          setDogs((prev) => {
            const existingDog = prev.find((d) => canonicalDogId(d.id) === remoteDog.id) ?? null;
            const resolvedDog = existingDog
              ? resolveDogSettingsConflict(normalizeDogSyncMetadata(existingDog), remoteDog)
              : remoteDog;
            const next = [...prev.filter((d) => canonicalDogId(d.id) !== remoteDog.id), resolvedDog];
            const writeResult = persistValue("pawtimer_dogs_v1", next, save);
            if (!writeResult.ok) reportLocalWriteFailure(writeResult.error);
            return next;
          });
        }

        const remoteSessions = normalizeSessions(remote.sessions);
        const remoteWalks = ensureArray(remote.walks).map((item) => ({ ...item, type: normalizeWalkType(item?.type) }));
        const remotePatterns = ensureArray(remote.patterns);
        const remoteFeedings = normalizeFeedings(remote.feedings);

        const mergedTombstones = commitTombstones((prev) => {
          const localT = normalizeTombstones(prev).map(withHydratedSyncState);
          const remoteT = normalizeTombstones(remote.tombstones).map((entry) => ({
            ...markRemoteEntryConfirmed(entry),
            replicationConfirmed: true,
          }));
          const byKey = new Map();
          for (const t of localT) byKey.set(`${t.kind}:${t.id}`, t);
          for (const t of remoteT) byKey.set(`${t.kind}:${t.id}`, t);
          return Array.from(byKey.values());
        });

        const mergedSessions = syncHelpersRef.current.commitSessions((prev) => mergeMutationSafeSyncCollection({
          currentItems: prev,
          remoteItems: remoteSessions,
          tombstones: mergedTombstones,
          kind: "session",
          mapLocalItem: withHydratedSyncState,
          mapRemoteItem: markRemoteEntryConfirmed,
        }));
        const mergedWalks = syncHelpersRef.current.commitWalks((prev) => mergeMutationSafeSyncCollection({
          currentItems: prev,
          remoteItems: remoteWalks,
          tombstones: mergedTombstones,
          kind: "walk",
          mapLocalItem: withHydratedSyncState,
          mapRemoteItem: markRemoteEntryConfirmed,
        }));
        const mergedPatterns = syncHelpersRef.current.commitPatterns((prev) => mergeMutationSafeSyncCollection({
          currentItems: prev,
          remoteItems: remotePatterns,
          tombstones: mergedTombstones,
          kind: "pattern",
          mapLocalItem: withHydratedSyncState,
          mapRemoteItem: markRemoteEntryConfirmed,
        }));
        const mergedFeedings = syncHelpersRef.current.commitFeedings((prev) => mergeMutationSafeSyncCollection({
          currentItems: prev,
          remoteItems: remoteFeedings,
          tombstones: mergedTombstones,
          kind: "feeding",
          mapLocalItem: withHydratedSyncState,
          mapRemoteItem: markRemoteEntryConfirmed,
        }));
        
        const latestSuppressedCollections = applyAuthoritativeTombstonesAtCommit({
          sessions: mergedSessions,
          walks: mergedWalks,
          patterns: mergedPatterns,
          feedings: mergedFeedings,
          tombstones: tombstonesRef.current,
        });
        
        const committedSessions = syncHelpersRef.current.commitSessions(latestSuppressedCollections.sessions);
        const committedWalks = syncHelpersRef.current.commitWalks(latestSuppressedCollections.walks);
        const committedPatterns = syncHelpersRef.current.commitPatterns(latestSuppressedCollections.patterns);
        const committedFeedings = syncHelpersRef.current.commitFeedings(latestSuppressedCollections.feedings);

        const currentDog = snapshot.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
        const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : remoteDog;
        const pendingEntries = [
          ...committedSessions.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "session", entry })),
          ...committedWalks.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "walk", entry })),
          ...committedPatterns.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "pattern", entry })),
          ...committedFeedings.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "feeding", entry })),
        ];

        const { supported: supportedPendingEntries, unsupported: unsupportedPendingEntries } = partitionPendingOutboundByCapability(pendingEntries, remote?.syncCapability);
        unsupportedPendingEntries.forEach(({ kind, entry }) => {
          syncHelpersRef.current.setEntrySyncState(
            kind,
            entry.id,
            SYNC_STATE.UNSUPPORTED,
            "Unsupported in current backend capability profile; retained locally until table support is available.",
          );
        });

        const pendingTombstoneEntries = mergedTombstones
          .filter((entry) => entry.pendingSync)
          .map((entry) => ({ kind: entry.kind, entry }));
        const {
          supported: supportedPendingTombstones,
          unsupported: unsupportedPendingTombstones,
        } = partitionPendingOutboundByCapability(pendingTombstoneEntries, remote?.syncCapability);
        unsupportedPendingTombstones.forEach(({ entry }) => {
          setTombstoneSyncState(
            entry.id,
            entry.kind,
            SYNC_STATE.UNSUPPORTED,
            "Delete marker blocked by current backend capability profile; retained locally until table support is available.",
          );
        });

        let allPendingFlushed = true;
        for (const { kind, entry } of supportedPendingEntries) {
          const pushed = await pushPendingEntry(kind, entry, dogSettings);
          allPendingFlushed = allPendingFlushed && pushed;
        }
        for (const { entry: tombstone } of supportedPendingTombstones) {
          const pushed = await pushPendingTombstone(tombstone, dogSettings);
          allPendingFlushed = allPendingFlushed && pushed;
        }

        const syncDog = remoteDog ?? currentDog;
        syncHelpersRef.current.recomputeTarget(committedSessions, committedWalks, committedPatterns, syncDog);
        if (!allPendingFlushed) {
          setSyncError("Some local changes are still waiting for confirmation.");
          setSyncStatus("err");
          return;
        }
        commitTombstones((prev) => pruneTombstonesForRetention(prev, {
          activityByKind: {
            session: committedSessions,
            walk: committedWalks,
            pattern: committedPatterns,
            feeding: committedFeedings,
          },
        }));
        const isPartialSync = remote?.syncCapability?.mode === "partial";
        const partialSyncMessage = buildPartialCapabilitySyncMessage(
          remote?.syncCapability,
          unsupportedPendingEntries.length + unsupportedPendingTombstones.length,
        );
        setSyncError(error || partialSyncMessage);
        setSyncStatus(error ? "err" : isPartialSync ? "partial" : "ok");
      } finally {
        syncInFlightRef.current = false;
      }
    };

    sync();
    const timer = setInterval(sync, 15_000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        sync();
      }
    };
    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => { 
      live = false; 
      syncInFlightRef.current = false; 
      clearInterval(timer); 
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [activeDogId, SYNC_ENABLED, syncHelpersRef, syncSnapshotRef, tombstonesRef, commitTombstones, markRemoteEntryConfirmed, reportLocalWriteFailure, setDogs, setTombstoneSyncState, withHydratedSyncState, logSyncDebug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!SYNC_ENABLED || !activeDogId) return;
    const dog = syncSnapshotRef.current.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    if (!dog) return;
    syncUpsertDog(dog).then(({ ok, error }) => {
      if (!ok) { setSyncStatus("err"); setSyncError(error || "Unable to sync dog settings"); }
    });
  }, [activeDogId, syncSnapshotRef, SYNC_ENABLED]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushWithSyncStatus = async (kind, data) => {
    if (!SYNC_ENABLED) return { ok: true, error: null, skipped: "sync_disabled" };
    if (!activeDogId) return { ok: true, error: null, skipped: "missing_active_dog" };
    const currentDog = syncSnapshotRef.current.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    syncHelpersRef.current.setEntrySyncState(kind, data.id, SYNC_STATE.SYNCING);
    setSyncStatus("syncing");
    const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, data, dogSettings);
    setSyncDegradation(getSyncDegradationState());
    if (ok) {
      syncHelpersRef.current.setEntrySyncState(kind, data.id, SYNC_STATE.SYNCED);
      setSyncError("");
      setSyncStatus("ok");
      return { ok: true, error: null, skipped: null };
    }
    const message = error || "Push failed";
    syncHelpersRef.current.setEntrySyncState(kind, data.id, SYNC_STATE.ERROR, message);
    setSyncError(message);
    setSyncStatus("err");
    return { ok: false, error: message, skipped: null };
  };

  const pushTombstoneWithSyncStatus = async (tombstone) => {
    if (!tombstone?.id || !tombstone?.kind) return { ok: false, error: "Invalid tombstone", skipped: null };
    if (!SYNC_ENABLED) return { ok: true, error: null, skipped: "sync_disabled" };
    if (!activeDogId) return { ok: true, error: null, skipped: "missing_active_dog" };
    const currentDog = syncSnapshotRef.current.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    setTombstoneSyncState(tombstone.id, tombstone.kind, SYNC_STATE.SYNCING);
    setSyncStatus("syncing");
    const { ok, error } = await syncPushTombstone(canonicalDogId(activeDogId), tombstone, dogSettings);
    setSyncDegradation(getSyncDegradationState());
    if (ok) {
      setTombstoneSyncState(tombstone.id, tombstone.kind, SYNC_STATE.SYNCED, "", { replicationConfirmed: true });
      setSyncError("");
      setSyncStatus("ok");
      return { ok: true, error: null, skipped: null };
    }
    const message = error || "Delete marker push failed";
    setTombstoneSyncState(tombstone.id, tombstone.kind, SYNC_STATE.ERROR, message);
    setSyncError(message);
    setSyncStatus("err");
    return { ok: false, error: message, skipped: null };
  };

  return {
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    syncDegradation,
    pushWithSyncStatus,
    pushTombstoneWithSyncStatus
  };
}
