import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ensureArray, load, save, canonicalDogId, hydrateDogFromLocal, applyTombstonesToCollection, DOGS_KEY, ACTIVE_DOG_KEY, sessKey, walkKey, patKey, feedingKey, tombKey, patLblKey, photoKey, normalizeTombstones, normalizeSessions, normalizeFeedings, repairDuplicateSessionIds, makeLocalTombstone, mergeTombstonesByEntityKey, SYNC_STATE } from "./storage";
import { sortByDateAsc } from "../../lib/activityDateTime";
import { persistValue, markCollectionStorageError } from "./persistence";
import { normalizeWalkType } from "./helpers";

export function useAppData({ recomputeTarget, logSyncDebug }) {
  const [dogs, setDogs] = useState(() => ensureArray(load(DOGS_KEY, [])));
  const [activeDogId, setActiveDogId] = useState(() => canonicalDogId(load(ACTIVE_DOG_KEY, null)));

  useEffect(() => {
    save(DOGS_KEY, dogs);
  }, [dogs]);

  useEffect(() => {
    save(ACTIVE_DOG_KEY, activeDogId);
  }, [activeDogId]);
  
  const [sessions, setSessions] = useState([]);
  const [walks, setWalks] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [tombstones, setTombstones] = useState([]);
  const [patLabels, setPatLabels] = useState({});
  const [dogPhoto, setDogPhoto] = useState(null);

  const sessionsRef = useRef([]);
  const walksRef = useRef([]);
  const patternsRef = useRef([]);
  const feedingsRef = useRef([]);
  const tombstonesRef = useRef([]);
  const syncSnapshotRef = useRef({ dogs, sessions, walks, patterns, feedings, tombstones });

  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");

  const reportLocalWriteFailure = useCallback((errorMessage) => {
    setSyncStatus("err");
    setSyncError(errorMessage);
  }, []);

  const withHydratedSyncState = useCallback((entry) => {
    if (!entry) return entry;
    if (typeof entry.pendingSync === "boolean" || entry.syncState) return entry;
    return { ...entry, pendingSync: false, syncState: SYNC_STATE.LOCAL, syncError: "" };
  }, []);

  const updateCollection = useCallback((
    updater, previousRef, stateSetter, keyFn, syncKey, normalizeFn, recomputeDeps
  ) => {
    const previous = ensureArray(previousRef.current);
    const resolved = typeof updater === "function" ? updater(previous) : updater;
    let normalized = normalizeFn(ensureArray(resolved));
    
    // special dedup for sessions
    if (syncKey === "sessions") {
      const repaired = repairDuplicateSessionIds(normalized, canonicalDogId(activeDogId));
      if (repaired.didRepair && logSyncDebug) {
        logSyncDebug("commitSessions:repairedIds", {
          activeDogId: canonicalDogId(activeDogId),
          repairedIds: repaired.rows.map((entry) => entry.id),
        });
      }
      normalized = repaired.rows;
    }

    let committed = normalized;
    if (activeDogId) {
      const writeResult = persistValue(keyFn(activeDogId), normalized, save);
      if (!writeResult.ok) {
        reportLocalWriteFailure(writeResult.error);
        committed = markCollectionStorageError(normalized, writeResult.error);
      }
    }

    previousRef.current = committed;
    syncSnapshotRef.current = { ...syncSnapshotRef.current, [syncKey]: committed };
    stateSetter(committed);

    if (recomputeDeps) {
      recomputeTarget(
        recomputeDeps.sessions(), 
        recomputeDeps.walks(), 
        recomputeDeps.patterns(), 
        recomputeDeps.dog()
      );
    }
    return committed;
  }, [activeDogId, recomputeTarget, reportLocalWriteFailure, logSyncDebug]);

  const commitSessions = useCallback((updater) => {
    return updateCollection(
      updater, sessionsRef, setSessions, sessKey, "sessions",
      (items) => sortByDateAsc(normalizeSessions(items).map(withHydratedSyncState)),
      { sessions: () => sessionsRef.current, walks: () => walksRef.current, patterns: () => patternsRef.current, dog: () => dogs.find(d => canonicalDogId(d.id) === canonicalDogId(activeDogId)) }
    );
  }, [updateCollection, withHydratedSyncState, dogs, activeDogId]);

  const commitWalks = useCallback((updater) => {
    return updateCollection(
      updater, walksRef, setWalks, walkKey, "walks",
      (items) => sortByDateAsc(items.map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) }))),
      { sessions: () => sessionsRef.current, walks: () => walksRef.current, patterns: () => patternsRef.current, dog: () => dogs.find(d => canonicalDogId(d.id) === canonicalDogId(activeDogId)) }
    );
  }, [updateCollection, withHydratedSyncState, dogs, activeDogId]);

  const commitPatterns = useCallback((updater) => {
    return updateCollection(
      updater, patternsRef, setPatterns, patKey, "patterns",
      (items) => sortByDateAsc(items.map(withHydratedSyncState)),
      { sessions: () => sessionsRef.current, walks: () => walksRef.current, patterns: () => patternsRef.current, dog: () => dogs.find(d => canonicalDogId(d.id) === canonicalDogId(activeDogId)) }
    );
  }, [updateCollection, withHydratedSyncState, dogs, activeDogId]);

  const commitFeedings = useCallback((updater) => {
    return updateCollection(
      updater, feedingsRef, setFeedings, feedingKey, "feedings",
      (items) => normalizeFeedings(items).map(withHydratedSyncState)
    );
  }, [updateCollection, withHydratedSyncState]);

  const commitTombstones = useCallback((updater) => {
    return updateCollection(
      updater, tombstonesRef, setTombstones, tombKey, "tombstones",
      (items) => normalizeTombstones(items).map(withHydratedSyncState)
    );
  }, [updateCollection, withHydratedSyncState]);

  const addTombstone = useCallback((kind, entry) => {
    if (!entry?.id) return null;
    let created = null;
    commitTombstones((prev) => {
      const existing = prev.find((row) => row.id === entry.id && row.kind === kind) ?? null;
      created = makeLocalTombstone(kind, entry, existing);
      return mergeTombstonesByEntityKey(prev, [created]);
    });
    return created;
  }, [commitTombstones]);

  const updateSyncState = useCallback((kind, entryId, nextSyncState, errorMessage = "", options = {}) => {
    if (kind === "tombstone") {
      commitTombstones((prev) => prev.map((row) => {
        if (row.id !== entryId) return row;
        return {
          ...row,
          pendingSync: nextSyncState !== SYNC_STATE.SYNCED,
          syncState: nextSyncState,
          syncError: nextSyncState === SYNC_STATE.ERROR ? errorMessage : "",
          ...(typeof options.replicationConfirmed === "boolean" ? { replicationConfirmed: options.replicationConfirmed } : {}),
        };
      }));
      return;
    }

    const updater = (prev) => prev.map((item) => {
      if (item.id !== entryId) return item;
      return {
        ...item,
        pendingSync: nextSyncState !== SYNC_STATE.SYNCED,
        syncState: nextSyncState,
        syncError: (nextSyncState === SYNC_STATE.ERROR || nextSyncState === SYNC_STATE.UNSUPPORTED) ? errorMessage : "",
      };
    });

    if (kind === "session") commitSessions(updater);
    else if (kind === "walk") commitWalks(updater);
    else if (kind === "pattern") commitPatterns(updater);
    else commitFeedings(updater);
  }, [commitTombstones, commitSessions, commitWalks, commitPatterns, commitFeedings]);

  return {
    dogs, setDogs, activeDogId, setActiveDogId,
    sessions, walks, patterns, feedings, tombstones, patLabels, setPatLabels, dogPhoto, setDogPhoto,
    sessionsRef, walksRef, patternsRef, feedingsRef, tombstonesRef, syncSnapshotRef,
    setSessions, setWalks, setPatterns, setFeedings, setTombstones,
    commitSessions, commitWalks, commitPatterns, commitFeedings, commitTombstones,
    addTombstone, updateSyncState,
    syncStatus, setSyncStatus, syncError, setSyncError,
    reportLocalWriteFailure, withHydratedSyncState
  };
}
