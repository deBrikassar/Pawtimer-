import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PROTOCOL, explainNextTarget, normalizeDistressLevel, suggestNext, suggestNextWithContext } from "./lib/protocol";
import { sortByDateAsc } from "./lib/activityDateTime";
import { sortValidDateAsc } from "./lib/dateSort";
import { selectAppData } from "./features/app/selectors";
import { ACTIVE_DOG_KEY, DOGS_KEY, SB_BASE_URL, SB_KEY, SB_URL, SYNC_ENABLED, applyTombstonesToCollection, canonicalDogId, ensureArray, ensureObject, feedingKey, generateId, getSyncDegradationState, hydrateDogFromLocal, load, logSyncDebug, makeEntryId, mergeMutationSafeSyncCollection, mergeSessionWithDerivedFields, mergeTombstonesByEntityKey, normalizeDogSyncMetadata, normalizeFeedings, normalizeSessions, normalizeTombstones, patKey, patLblKey, photoKey, pruneTombstonesForRetention, resolveDogSettingsConflict, save, sessKey, stampLocalDogSettings, syncDelete, syncDeleteSessionsForDog, syncFetch, syncPush, syncPushTombstone, syncUpsertDog, toDateTimeLocalValue, tombKey, walkKey } from "./features/app/storage";
import { fmt, fmtClock, getOutcomeTone, normalizeWalkType, walkTypeLabel } from "./features/app/helpers";
import { CameraIcon, ChartIcon, HistoryIcon, HomeIcon, PawIcon, SettingsIcon } from "./features/app/ui.jsx";
import { DogSelect, Onboarding } from "./features/setup/SetupScreens";
import HomeScreen from "./features/home/HomeScreen";
import StatsScreen from "./features/stats/StatsScreen";
import SettingsScreen from "./features/settings/SettingsScreen";
import { HistoryScreen, useHistoryEditing } from "./features/history/HistoryFeature";
import "./styles/theme.css";
import "./styles/shared.css";
import "./styles/app.css";

const LEGACY_SW_PATHS = ["/service-worker.js", "/serviceworker.js", "/workbox-sw.js"];
const SYNC_STATE = {
  LOCAL: "local",
  SYNCING: "syncing",
  SYNCED: "synced",
  ERROR: "error",
};

function recoveryStateEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export default function PawTimer() {
  const [dogs, setDogs] = useState(() => ensureArray(load(DOGS_KEY, [])));
  const [activeDogId, setActiveDogId] = useState(() => canonicalDogId(load(ACTIVE_DOG_KEY, null)));
  const [screen, setScreen] = useState("select");
  const [sessions, setSessions] = useState([]);
  const [walks, setWalks] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [tombstones, setTombstones] = useState([]);
  const [tab, setTab] = useState("home");
  const [onboardingState, setOnboardingState] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionOutcome, setSessionOutcome] = useState(null);
  const [latencyDraft, setLatencyDraft] = useState("");
  const [distressTypeDraft, setDistressTypeDraft] = useState("");
  const [target, setTarget] = useState(PROTOCOL.startDurationSeconds);
  const [toast, setToast] = useState(null);
  const [patOpen, setPatOpen] = useState(false);
  const [patLabels, setPatLabels] = useState({});
  const [editingPat, setEditingPat] = useState(null);
  const [dogPhoto, setDogPhoto] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [syncDiagRunning, setSyncDiagRunning] = useState(false);
  const [syncDiagResult, setSyncDiagResult] = useState(null);
  const [syncDegradation, setSyncDegradation] = useState(() => getSyncDegradationState());
  const [notifTime, setNotifTime] = useState(() => load("pawtimer_notif_time", "09:00"));
  const [notifEnabled, setNotifEnabled] = useState(() => load("pawtimer_notif_on", false));
  const [protoWarnAck, setProtoWarnAck] = useState(false);
  const [protoOverride, setProtoOverride] = useState(() => ensureObject(load("pawtimer_proto_override", {})));
  const [settingsDisclosure, setSettingsDisclosure] = useState(null);
  const [trainingSettingsOpen, setTrainingSettingsOpen] = useState(false);
  const [walkPhase, setWalkPhase] = useState("idle");
  const [walkElapsed, setWalkElapsed] = useState(0);
  const [walkPendingDuration, setWalkPendingDuration] = useState(0);
  const [feedingOpen, setFeedingOpen] = useState(false);
  const [feedingDraft, setFeedingDraft] = useState(() => ({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }));
  const [historyModal, setHistoryModal] = useState(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;
      const runUpdateCheck = () => registration.update().catch(() => {});
      runUpdateCheck();
      window.setInterval(runUpdateCheck, 60 * 60 * 1000);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") runUpdateCheck();
      });
    },
  });

  const walkTimerRef = useRef(null);
  const walkStartRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const syncSnapshotRef = useRef({ dogs: [], sessions: [], walks: [], patterns: [], feedings: [], tombstones: [] });
  const syncHelpersRef = useRef({
    commitSessions: null,
    commitWalks: null,
    commitPatterns: null,
    commitFeedings: null,
    recomputeTarget: null,
    setEntrySyncState: null,
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations.map(async (registration) => {
          const swUrl = registration.active?.scriptURL
            || registration.waiting?.scriptURL
            || registration.installing?.scriptURL
            || "";
          if (LEGACY_SW_PATHS.some((legacyPath) => swUrl.endsWith(legacyPath))) {
            await registration.unregister();
          }
        })
      ))
      .catch(() => {});
  }, []);

  const withHydratedSyncState = useCallback((entry) => {
    if (!entry) return entry;
    if (typeof entry.pendingSync === "boolean" || entry.syncState) return entry;
    return {
      ...entry,
      pendingSync: false,
      syncState: SYNC_ENABLED ? SYNC_STATE.SYNCED : SYNC_STATE.LOCAL,
      syncError: "",
    };
  }, []);

  const markRemoteEntryConfirmed = useCallback((entry) => ({
    ...entry,
    pendingSync: false,
    syncState: SYNC_ENABLED ? SYNC_STATE.SYNCED : SYNC_STATE.LOCAL,
    syncError: "",
  }), []);

  const stampLocalEntry = useCallback((entry, previousEntry = null, syncState = SYNC_STATE.LOCAL, syncErrorMessage = "") => {
    const updatedAt = new Date().toISOString();
    const previousRevision = Number.isFinite(previousEntry?.revision)
      ? previousEntry.revision
      : Number.isFinite(entry?.revision)
        ? entry.revision
        : 0;
    return {
      ...previousEntry,
      ...entry,
      updatedAt,
      revision: previousRevision + 1,
      pendingSync: syncState !== SYNC_STATE.SYNCED,
      syncState,
      syncError: syncState === SYNC_STATE.ERROR ? syncErrorMessage : "",
    };
  }, []);

  const makeLocalTombstone = useCallback((kind, entry, previousTombstone = null, syncState = SYNC_STATE.LOCAL, syncErrorMessage = "") => {
    const deletedAt = new Date().toISOString();
    const previousRevision = Number.isFinite(previousTombstone?.revision)
      ? previousTombstone.revision
      : Number.isFinite(entry?.revision)
        ? entry.revision
        : 0;
    return {
      id: String(entry?.id || ""),
      kind,
      deletedAt,
      updatedAt: deletedAt,
      revision: previousRevision + 1,
      replicationConfirmed: false,
      pendingSync: syncState !== SYNC_STATE.SYNCED,
      syncState,
      syncError: syncState === SYNC_STATE.ERROR ? syncErrorMessage : "",
    };
  }, []);

  useEffect(() => {
    syncSnapshotRef.current = { dogs, sessions, walks, patterns, feedings, tombstones };
  }, [dogs, sessions, walks, patterns, feedings, tombstones]);

  useEffect(() => { save(DOGS_KEY, dogs); }, [dogs]);
  useEffect(() => { save(ACTIVE_DOG_KEY, canonicalDogId(activeDogId)); }, [activeDogId]);
  useEffect(() => { if (activeDogId) save(sessKey(activeDogId), sessions); }, [sessions, activeDogId]);
  useEffect(() => { if (activeDogId) save(walkKey(activeDogId), walks); }, [walks, activeDogId]);
  useEffect(() => { if (activeDogId) save(patKey(activeDogId), patterns); }, [patterns, activeDogId]);
  useEffect(() => { if (activeDogId) save(feedingKey(activeDogId), feedings); }, [feedings, activeDogId]);
  useEffect(() => { if (activeDogId) save(tombKey(activeDogId), tombstones); }, [tombstones, activeDogId]);
  useEffect(() => { if (activeDogId) save(patLblKey(activeDogId), patLabels); }, [patLabels, activeDogId]);
  useEffect(() => { if (activeDogId) save(photoKey(activeDogId), dogPhoto); }, [dogPhoto, activeDogId]);
  useEffect(() => { save("pawtimer_notif_time", notifTime); }, [notifTime]);
  useEffect(() => { save("pawtimer_notif_on", notifEnabled); }, [notifEnabled]);
  useEffect(() => { save("pawtimer_proto_override", protoOverride); }, [protoOverride]);
  const activeDog = useMemo(
    () => dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId)) ?? null,
    [activeDogId, dogs],
  );
  const canonicalSessions = useMemo(() => sortValidDateAsc(sessions), [sessions]);
  const deriveRecommendation = useCallback((nextSessions, nextWalks = walks, nextPatterns = patterns, nextDog = activeDog || {}) => {
    const logicalSessions = sortValidDateAsc(nextSessions);
    const details = explainNextTarget(logicalSessions, nextWalks, nextPatterns, nextDog || {});
    const recommendedDuration = details?.recommendedDuration
      ?? (suggestNextWithContext(logicalSessions, nextWalks, nextPatterns, nextDog) ?? suggestNext(logicalSessions, nextDog));
    return {
      duration: recommendedDuration,
      decisionState: details?.decisionState ?? null,
      explanation: details?.summary ?? "",
      details: details ?? {},
    };
  }, [activeDog, patterns, walks]);

  const recommendation = useMemo(() => {
    return deriveRecommendation(canonicalSessions, walks, patterns, activeDog || {});
  }, [activeDog, canonicalSessions, deriveRecommendation, patterns, walks]);
  const appData = selectAppData({
    dogs,
    activeDogId,
    sessions: canonicalSessions,
    walks,
    patterns,
    feedings,
    target: recommendation.duration,
    protoOverride,
    recommendation,
  });

  const recomputeTarget = useCallback((nextSessions, nextWalks = walks, nextPatterns = patterns, nextDog = activeDog || {}) => {
    const nextTarget = deriveRecommendation(nextSessions, nextWalks, nextPatterns, nextDog).duration;
    setTarget(nextTarget);
    return nextTarget;
  }, [activeDog, deriveRecommendation, patterns, walks]);

  useEffect(() => {
    setTarget((prev) => (prev === recommendation.duration ? prev : recommendation.duration));
  }, [recommendation.duration]);

  const commitSessions = useCallback((updater) => {
    let committed = [];
    setSessions((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = sortByDateAsc(normalizeSessions(ensureArray(resolved)).map(withHydratedSyncState));
      if (activeDogId) save(sessKey(activeDogId), normalized);
      recomputeTarget(normalized);
      committed = normalized;
      return normalized;
    });
    return committed;
  }, [activeDogId, recomputeTarget, withHydratedSyncState]);

  const commitWalks = useCallback((updater) => {
    let committed = [];
    setWalks((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = sortByDateAsc(ensureArray(resolved).map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) })));
      if (activeDogId) save(walkKey(activeDogId), normalized);
      recomputeTarget(sessions, normalized, patterns, activeDog || {});
      committed = normalized;
      return normalized;
    });
    return committed;
  }, [activeDog, activeDogId, patterns, recomputeTarget, sessions, withHydratedSyncState]);

  const commitPatterns = useCallback((updater) => {
    let committed = [];
    setPatterns((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = sortByDateAsc(ensureArray(resolved).map(withHydratedSyncState));
      if (activeDogId) save(patKey(activeDogId), normalized);
      recomputeTarget(sessions, walks, normalized, activeDog || {});
      committed = normalized;
      return normalized;
    });
    return committed;
  }, [activeDog, activeDogId, recomputeTarget, sessions, walks, withHydratedSyncState]);

  const commitFeedings = useCallback((updater) => {
    let committed = [];
    setFeedings((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = normalizeFeedings(ensureArray(resolved)).map(withHydratedSyncState);
      if (activeDogId) save(feedingKey(activeDogId), normalized);
      committed = normalized;
      return normalized;
    });
    return committed;
  }, [activeDogId, withHydratedSyncState]);

  const commitTombstones = useCallback((updater) => {
    let committed = [];
    setTombstones((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = normalizeTombstones(ensureArray(resolved)).map(withHydratedSyncState);
      if (activeDogId) save(tombKey(activeDogId), normalized);
      committed = normalized;
      return normalized;
    });
    return committed;
  }, [activeDogId, withHydratedSyncState]);

  const addTombstone = useCallback((kind, entry) => {
    if (!entry?.id) return null;
    let created = null;
    commitTombstones((prev) => {
      const existing = prev.find((row) => row.id === entry.id && row.kind === kind) ?? null;
      created = makeLocalTombstone(kind, entry, existing);
      return mergeTombstonesByEntityKey(prev, [created]);
    });
    return created;
  }, [commitTombstones, makeLocalTombstone]);

  const setTombstoneSyncState = useCallback((entryId, kind, nextSyncState, errorMessage = "") => {
    commitTombstones((prev) => prev.map((row) => {
      if (row.id !== entryId || row.kind !== kind) return row;
      return {
        ...row,
        pendingSync: nextSyncState !== SYNC_STATE.SYNCED,
        syncState: nextSyncState,
        syncError: nextSyncState === SYNC_STATE.ERROR ? errorMessage : "",
      };
    }));
  }, [commitTombstones]);

  const updateCollectionEntry = useCallback((kind, entryId, updater) => {
    const updateItems = (items) => items.map((item) => (item.id === entryId ? updater(item) : item));
    if (kind === "session") {
      commitSessions((prev) => updateItems(prev));
      return;
    }
    if (kind === "walk") {
      commitWalks((prev) => updateItems(prev));
      return;
    }
    if (kind === "pattern") {
      commitPatterns((prev) => updateItems(prev));
      return;
    }
    commitFeedings((prev) => updateItems(prev));
  }, [commitFeedings, commitPatterns, commitSessions, commitWalks]);

  const setEntrySyncState = useCallback((kind, entryId, nextSyncState, errorMessage = "") => {
    updateCollectionEntry(kind, entryId, (item) => ({
      ...item,
      pendingSync: nextSyncState !== SYNC_STATE.SYNCED,
      syncState: nextSyncState,
      syncError: nextSyncState === SYNC_STATE.ERROR ? errorMessage : "",
    }));
  }, [updateCollectionEntry]);

  useEffect(() => {
    syncHelpersRef.current = {
      commitSessions,
      commitWalks,
      commitPatterns,
      commitFeedings,
      recomputeTarget,
      setEntrySyncState,
    };
  }, [commitFeedings, commitPatterns, commitSessions, commitWalks, recomputeTarget, setEntrySyncState]);

  useEffect(() => {
    if (!activeDogId) { setScreen("select"); return; }
    const normalizedId = canonicalDogId(activeDogId);
    const dog = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (!dog) { setScreen("select"); return; }
    const local = hydrateDogFromLocal(normalizedId);
    const hydratedTombstones = normalizeTombstones(local.tombstones).map(withHydratedSyncState);
    const hydratedSessions = sortByDateAsc(normalizeSessions(local.sessions).map(withHydratedSyncState));
    const hydratedWalks = sortByDateAsc(ensureArray(local.walks).map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) })));
    const hydratedPatterns = sortByDateAsc(ensureArray(local.patterns).map(withHydratedSyncState));
    const hydratedFeedings = normalizeFeedings(local.feedings).map(withHydratedSyncState);
    setTombstones(hydratedTombstones);
    setSessions(applyTombstonesToCollection(hydratedSessions, hydratedTombstones, "session"));
    setWalks(applyTombstonesToCollection(hydratedWalks, hydratedTombstones, "walk"));
    setPatterns(applyTombstonesToCollection(hydratedPatterns, hydratedTombstones, "pattern"));
    setFeedings(applyTombstonesToCollection(hydratedFeedings, hydratedTombstones, "feeding"));
    setPatLabels(local.patLabels);
    setDogPhoto(local.photo);
    recomputeTarget(
      applyTombstonesToCollection(hydratedSessions, hydratedTombstones, "session"),
      applyTombstonesToCollection(hydratedWalks, hydratedTombstones, "walk"),
      applyTombstonesToCollection(hydratedPatterns, hydratedTombstones, "pattern"),
      dog,
    );
    setScreen("app");
  }, [activeDogId, dogs, recomputeTarget, withHydratedSyncState]);

  useEffect(() => {
    const savedId = load(ACTIVE_DOG_KEY, null);
    const savedDogs = ensureArray(load(DOGS_KEY, []));
    if (savedId && (SYNC_ENABLED || savedDogs.find((d) => canonicalDogId(d.id) === canonicalDogId(savedId)))) setActiveDogId(canonicalDogId(savedId));
    else setScreen("select");
  }, []);

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
        setTombstoneSyncState(entry.id, entry.kind, SYNC_STATE.SYNCED);
        return true;
      }
      setTombstoneSyncState(entry.id, entry.kind, SYNC_STATE.ERROR, error || "Delete marker push failed");
      return false;
    };

    const sync = async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        logSyncDebug("sync:run", { trigger: "sync-effect", dogId: canonicalDogId(activeDogId) });
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
            save(DOGS_KEY, next);
            return next;
          });
        }

        const remoteSessions = normalizeSessions(remote.sessions);
        const remoteWalks = ensureArray(remote.walks).map((item) => ({ ...item, type: normalizeWalkType(item?.type) }));
        const remotePatterns = ensureArray(remote.patterns);
        const remoteFeedings = normalizeFeedings(remote.feedings);

        const mergedTombstones = commitTombstones((prev) => mergeTombstonesByEntityKey(
          normalizeTombstones(prev).map(withHydratedSyncState),
          normalizeTombstones(remote.tombstones).map((entry) => ({
            ...markRemoteEntryConfirmed(entry),
            replicationConfirmed: true,
          })),
        ));
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

        const currentDog = snapshot.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
        const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : remoteDog;
        const pendingEntries = [
          ...mergedSessions.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "session", entry })),
          ...mergedWalks.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "walk", entry })),
          ...mergedPatterns.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "pattern", entry })),
          ...mergedFeedings.filter((entry) => entry.pendingSync).map((entry) => ({ kind: "feeding", entry })),
        ];

        let allPendingFlushed = true;
        for (const { kind, entry } of pendingEntries) {
          const pushed = await pushPendingEntry(kind, entry, dogSettings);
          allPendingFlushed = allPendingFlushed && pushed;
        }
        for (const tombstone of mergedTombstones.filter((entry) => entry.pendingSync)) {
          const pushed = await pushPendingTombstone(tombstone, dogSettings);
          allPendingFlushed = allPendingFlushed && pushed;
        }

        const syncDog = remoteDog ?? currentDog;
        syncHelpersRef.current.recomputeTarget(mergedSessions, mergedWalks, mergedPatterns, syncDog);
        if (!allPendingFlushed) {
          setSyncError("Some local changes are still waiting for confirmation.");
          setSyncStatus("err");
          return;
        }
        commitTombstones((prev) => pruneTombstonesForRetention(prev, {
          activityByKind: {
            session: mergedSessions,
            walk: mergedWalks,
            pattern: mergedPatterns,
            feeding: mergedFeedings,
          },
        }));
        setSyncError(error || "");
        setSyncStatus(error ? "err" : "ok");
      } finally {
        syncInFlightRef.current = false;
      }
    };

    sync();
    const timer = setInterval(sync, 15_000);
    return () => { live = false; syncInFlightRef.current = false; clearInterval(timer); };
  }, [activeDogId, commitTombstones, markRemoteEntryConfirmed, setTombstoneSyncState, withHydratedSyncState]);

  useEffect(() => {
    if (!SYNC_ENABLED || !activeDogId) return;
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    if (!dog) return;
    syncUpsertDog(dog).then(({ ok, error }) => {
      if (!ok) { setSyncStatus("err"); setSyncError(error || "Unable to sync dog settings"); }
    });
  }, [activeDogId, dogs]);

  useEffect(() => {
    if (phase !== "running") { setSessionCompleted(false); return; }
    if (elapsed >= target) setSessionCompleted(true);
  }, [phase, elapsed, target]);

  useEffect(() => {
    if (phase === "running") {
      startRef.current = Date.now() - elapsed * 1000;
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (walkPhase === "timing") {
      walkStartRef.current = Date.now() - walkElapsed * 1000;
      walkTimerRef.current = setInterval(() => setWalkElapsed(Math.floor((Date.now() - walkStartRef.current) / 1000)), 500);
    } else clearInterval(walkTimerRef.current);
    return () => clearInterval(walkTimerRef.current);
  }, [walkPhase]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const sendWorkerMessage = useCallback(async (payload) => {
    if (!("serviceWorker" in navigator)) return { ok: false, error: "service-worker-unsupported" };
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const worker = reg?.active || navigator.serviceWorker.controller;
    if (!worker) return { ok: false, error: "service-worker-not-ready" };
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeoutId = window.setTimeout(() => resolve({ ok: false, error: "service-worker-timeout" }), 2000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeoutId);
        resolve(event.data || { ok: false, error: "empty-service-worker-response" });
      };
      worker.postMessage(payload, [channel.port2]);
    });
  }, []);

  const scheduleNotif = useCallback(async (time, dogName) => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    if (Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return false;
    }
    const [h, m] = time.split(":").map(Number);
    const result = await sendWorkerMessage({ type: "SCHEDULE_NOTIF", hour: h, minute: m, dogName });
    return Boolean(result?.ok && result?.configSaved);
  }, [sendWorkerMessage]);

  const cancelNotif = useCallback(async () => {
    await sendWorkerMessage({ type: "CANCEL_NOTIF" });
  }, [sendWorkerMessage]);

  useEffect(() => {
    if (!notifEnabled) return;
    const runReminderCheck = () => {
      sendWorkerMessage({ type: "CHECK_NOTIF", source: "app-visible" }).catch(() => {});
    };
    runReminderCheck();
    const onVisible = () => {
      if (document.visibilityState === "visible") runReminderCheck();
    };
    window.addEventListener("focus", runReminderCheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", runReminderCheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [notifEnabled, sendWorkerMessage]);

  const handleToggleNotif = async () => {
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogName = dog?.dogName ?? "your dog";
    if (!notifEnabled) {
      const ok = await scheduleNotif(notifTime, dogName);
      if (ok) { setNotifEnabled(true); showToast("Reminder set."); } else showToast("Notifications blocked — check browser settings");
    } else { cancelNotif(); setNotifEnabled(false); showToast("Reminder turned off."); }
  };


  const clearDogActivityState = useCallback((dogId) => {
    const normalizedId = canonicalDogId(dogId);
    if (!normalizedId) return;
    save(sessKey(normalizedId), []);
    save(walkKey(normalizedId), []);
    save(patKey(normalizedId), []);
    save(feedingKey(normalizedId), []);
    save(tombKey(normalizedId), []);
    save(patLblKey(normalizedId), {});
    save(photoKey(normalizedId), null);
    setSessions([]);
    setWalks([]);
    setPatterns([]);
    setFeedings([]);
    setTombstones([]);
    setPatLabels({});
    setDogPhoto(null);
  }, []);

  const openDog = (dog) => { logSyncDebug("openDog", { dogId: canonicalDogId(dog?.id) }); setOnboardingState(null); setActiveDogId(canonicalDogId(dog.id)); setScreen("app"); };

  const handleDogSelect = async (id, isJoin = false) => {
    const normalizedId = canonicalDogId(id);
    if (isJoin && SYNC_ENABLED) {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(normalizedId);
      setSyncDegradation(getSyncDegradationState());
      if (!remote?.dog) { setSyncStatus("err"); setSyncError(error || `No shared dog account found for ${normalizedId}`); showToast(`No shared profile found for ${normalizedId} yet.`); return; }
      const sharedDog = normalizeDogSyncMetadata({ ...remote.dog, id: normalizedId });
      setDogs((prev) => {
        const existing = prev.find((d) => canonicalDogId(d.id) === normalizedId) ?? null;
        const resolvedDog = existing
          ? resolveDogSettingsConflict(normalizeDogSyncMetadata(existing), sharedDog)
          : sharedDog;
        return [...prev.filter((d) => canonicalDogId(d.id) !== normalizedId), resolvedDog];
      });
      const joinedSessions = sortByDateAsc(normalizeSessions(remote.sessions).map(markRemoteEntryConfirmed));
      const joinedWalks = sortByDateAsc(ensureArray(remote.walks).map((item) => markRemoteEntryConfirmed({ ...item, type: normalizeWalkType(item?.type) })));
      const joinedPatterns = sortByDateAsc(ensureArray(remote.patterns).map(markRemoteEntryConfirmed));
      const joinedFeedings = normalizeFeedings(remote.feedings).map(markRemoteEntryConfirmed);
      const joinedTombstones = normalizeTombstones(remote.tombstones).map(markRemoteEntryConfirmed);
      const visibleJoinedSessions = applyTombstonesToCollection(joinedSessions, joinedTombstones, "session");
      const visibleJoinedWalks = applyTombstonesToCollection(joinedWalks, joinedTombstones, "walk");
      const visibleJoinedPatterns = applyTombstonesToCollection(joinedPatterns, joinedTombstones, "pattern");
      const visibleJoinedFeedings = applyTombstonesToCollection(joinedFeedings, joinedTombstones, "feeding");
      setTombstones(joinedTombstones);
      setSessions(visibleJoinedSessions);
      setWalks(visibleJoinedWalks);
      setPatterns(visibleJoinedPatterns);
      setFeedings(visibleJoinedFeedings);
      save(sessKey(normalizedId), visibleJoinedSessions);
      save(walkKey(normalizedId), visibleJoinedWalks);
      save(patKey(normalizedId), visibleJoinedPatterns);
      save(feedingKey(normalizedId), visibleJoinedFeedings);
      save(tombKey(normalizedId), joinedTombstones);
      if (error) { setSyncStatus("err"); setSyncError(error); showToast(`Joined ${normalizedId}, but related history failed to load.`); }
      else { setSyncError(""); setSyncStatus("ok"); showToast(`Joined shared profile ${normalizedId}.`); }
      openDog(sharedDog);
      return;
    }
    const existing = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (existing) { openDog(existing); return; }
    if (isJoin) { setSyncStatus("err"); setSyncError(`No shared dog account found for ${normalizedId}`); showToast(`No shared profile found for ${normalizedId}. Check the ID and try again.`); }
    else { setOnboardingState({ mode: "claim", dogId: normalizedId }); setActiveDogId(normalizedId); setScreen("onboard"); }
  };

  const handleOnboardComplete = (data) => {
    const onboardingDogId = canonicalDogId(onboardingState?.dogId);
    const id = canonicalDogId(onboardingDogId || activeDogId || generateId(data.dogName));
    const isFreshProfile = onboardingState?.mode === "new";
    const previousDog = dogs.find((d) => canonicalDogId(d.id) === id) ?? null;
    const newDog = stampLocalDogSettings({
      ...data,
      id,
      dogName: data.dogName,
      createdAt: new Date().toISOString(),
    }, previousDog);
    if (isFreshProfile) clearDogActivityState(id);
    setDogs((prev) => [...prev.filter((d) => canonicalDogId(d.id) !== id), newDog]);
    setOnboardingState(null);
    setActiveDogId(id);
    setTab("home");
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const startSession = () => {
    if (!appData.daily.canAdd) {
      if (appData.daily.blockReason === "cap") showToast(`Daily alone-time cap reached (${fmtClock(appData.daily.capSec)}).`);
      else if (appData.daily.blockReason === "max_sessions") showToast(`Daily session max reached (${appData.daily.maxCount}).`);
      return;
    }
    setElapsed(0); setSessionCompleted(false); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); setPhase("running");
  };
  const endSession = () => { clearInterval(timerRef.current); setFinalElapsed(elapsed); setPhase("rating"); };
  const cancelSession = () => { setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionCompleted(false); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); clearInterval(timerRef.current); };

  const pushWithSyncStatus = async (kind, data) => {
    if (!SYNC_ENABLED) return { ok: true, error: null, skipped: "sync_disabled" };
    if (!activeDogId) return { ok: true, error: null, skipped: "missing_active_dog" };
    const currentDog = syncSnapshotRef.current.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    setEntrySyncState(kind, data.id, SYNC_STATE.SYNCING);
    setSyncStatus("syncing");
    const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, data, dogSettings);
    setSyncDegradation(getSyncDegradationState());
    if (ok) {
      setEntrySyncState(kind, data.id, SYNC_STATE.SYNCED);
      setSyncError("");
      setSyncStatus("ok");
      return { ok: true, error: null, skipped: null };
    }
    const message = error || "Push failed";
    setEntrySyncState(kind, data.id, SYNC_STATE.ERROR, message);
    setSyncError(message);
    setSyncStatus("err");
    return { ok: false, error: message, skipped: null };
  };

  const runSyncDiagnostics = async () => {
    setSyncDiagRunning(true);
    try {
      const report = { checkedAt: new Date().toISOString(), env: { syncEnabled: SYNC_ENABLED, hasUrl: Boolean(SB_URL), hasAnonKey: Boolean(SB_KEY), normalizedUrl: SB_BASE_URL || "(missing)", urlLooksValid: /^https:\/\/[^\s]+\.supabase\.co$/i.test(SB_BASE_URL || "") }, checks: {} };
      report.checks.syncDegradation = getSyncDegradationState();
      setSyncDiagResult(report);
    } finally { setSyncDiagRunning(false); }
  };

  const recordResult = (distressLevelInput, options = {}) => {
    const distressLevel = normalizeDistressLevel(distressLevelInput);
    const dog = appData.dog;
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const latencyInput = Number(options.latencyToFirstDistress);
    const latencyToFirstDistress = Number.isFinite(latencyInput) && latencyInput >= 0 ? Math.round(latencyInput) : distressLevel === "none" ? finalElapsed : null;
    const distressType = options.distressType || (distressLevel === "none" ? "none" : null);
    const rawSession = mergeSessionWithDerivedFields({}, { id: makeEntryId("sess", activeDogId), date: now.toISOString(), plannedDuration: target, actualDuration: finalElapsed, distressLevel, result: distressLevel === "none" ? "success" : "distress", latencyToFirstDistress, distressType, distressSeverity: distressLevel, context: { timeOfDay, departureType: "training", cuesUsed: [], location: null, barrierUsed: null, enrichmentPresent: null, mediaOn: null, whoLeft: null, anotherPersonStayed: null }, symptoms: { barking: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, pacing: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, destructive: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0, salivation: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0 }, videoReview: { recorded: false, firstSubtleDistressTs: null, firstActiveDistressTs: null, eventTags: [], notes: null, ratingConfidence: null }, recoverySeconds: distressLevel === "none" ? 0 : null, preSession: { walkDuration: null, enrichmentGiven: null }, environment: { noiseEvent: false } });
    const session = stampLocalEntry(rawSession);
    const updated = commitSessions((prev) => [...prev, session]);
    pushWithSyncStatus("session", session).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    const nextRecommendation = deriveRecommendation(updated, walks, patterns, dog);
    const next = nextRecommendation.duration;
    cancelSession();
    const n = dog?.dogName ?? "your dog";
    if (distressLevel === "none") showToast(`${n} was calm. Next: ${fmt(next)}`);
    else if (distressLevel === "subtle") showToast(`Subtle stress signs — holding at ${fmt(next)}`);
    else showToast(`Rolled back to ${fmt(next)}`);
  };

  const startWalk = () => { setWalkElapsed(0); setWalkPhase("timing"); };
  const endWalk = () => { clearInterval(walkTimerRef.current); setWalkPendingDuration(walkElapsed); setWalkPhase("classify"); };
  const saveWalkWithType = (walkType) => {
    const entry = stampLocalEntry({ id: makeEntryId("walk", activeDogId), date: new Date().toISOString(), duration: walkPendingDuration, type: normalizeWalkType(walkType) });
    commitWalks((prev) => [...prev, entry]);
    pushWithSyncStatus("walk", entry).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    showToast(`${walkTypeLabel(normalizeWalkType(walkType))} with ${appData.name} logged — ${fmt(walkPendingDuration)}.`);
    setWalkPhase("idle"); setWalkElapsed(0); setWalkPendingDuration(0);
  };
  const cancelWalk = () => { clearInterval(walkTimerRef.current); setWalkPhase("idle"); setWalkElapsed(0); setWalkPendingDuration(0); };
  const logPattern = (type) => {
    const entry = stampLocalEntry({ id: makeEntryId("pat", activeDogId), date: new Date().toISOString(), type });
    commitPatterns((prev) => [...prev, entry]);
    pushWithSyncStatus("pattern", entry).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    showToast("Pattern break logged.");
  };
  const openFeedingForm = () => { setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }); setFeedingOpen(true); };
  const cancelFeedingForm = () => { setFeedingOpen(false); setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }); };
  const saveFeeding = () => {
    const when = feedingDraft.time ? new Date(feedingDraft.time) : new Date();
    if (Number.isNaN(when.getTime())) { showToast("Please enter a valid feeding time"); return; }
    const entry = stampLocalEntry({ id: makeEntryId("feed", activeDogId), date: when.toISOString(), foodType: feedingDraft.foodType, amount: feedingDraft.amount });
    commitFeedings((prev) => [...prev, entry]);
    pushWithSyncStatus("feeding", entry).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    setFeedingOpen(false); showToast("Feeding logged.");
  };
  const copyDogId = () => { navigator.clipboard?.writeText(activeDogId).catch(() => {}); showToast(`ID copied: ${activeDogId}`); };
  const handlePhotoUpload = (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => setDogPhoto(ev.target.result); reader.readAsDataURL(file); };

  const historyActions = useHistoryEditing({
    sessions,
    walks,
    patterns,
    feedings,
    patLabels,
    showToast,
    pushWithSyncStatus,
    syncDelete,
    syncDeleteSessionsForDog,
    addTombstone,
    commitSessions,
    setWalks: commitWalks,
    setPatterns: commitPatterns,
    setFeedings: commitFeedings,
    activeDogId,
    stampLocalEntry,
  });

  useEffect(() => {
    if (!activeDogId) return;
    const nextRecoveryState = recommendation?.details?.recoveryState ?? null;
    setDogs((prev) => {
      let changed = false;
      const updated = prev.map((dog) => {
        if (canonicalDogId(dog?.id) !== canonicalDogId(activeDogId)) return dog;
        if (recoveryStateEqual(dog?.recoveryState, nextRecoveryState)) return dog;
        changed = true;
        return stampLocalDogSettings({ ...dog, recoveryState: nextRecoveryState }, dog);
      });
      return changed ? updated : prev;
    });
  }, [activeDogId, recommendation?.details?.recoveryState]);

  const syncSummary = useMemo(() => {
    const allEntries = [...sessions, ...walks, ...patterns, ...feedings];
    const counts = allEntries.reduce((acc, entry) => {
      const state = entry?.syncState || (entry?.pendingSync ? SYNC_STATE.LOCAL : SYNC_STATE.SYNCED);
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, { [SYNC_STATE.LOCAL]: 0, [SYNC_STATE.SYNCING]: 0, [SYNC_STATE.SYNCED]: 0, [SYNC_STATE.ERROR]: 0 });

    if (!SYNC_ENABLED) {
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

    return {
      badgeState: "ok",
      label: allEntries.length ? "All confirmed" : "Ready",
      detail: allEntries.length ? "All visible activity is confirmed by the server." : "No local changes are waiting for sync.",
    };
  }, [feedings, patterns, sessions, syncError, syncStatus, walks]);

  const CustomDot = ({ cx, cy, payload }) => {
    const c = getOutcomeTone(payload.distressLevel).color;
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2} />;
  };

  if (screen === "select") return <>{toast && <div className="toast">{toast}</div>}<DogSelect dogs={dogs} onSelect={handleDogSelect} onCreateNew={() => { setOnboardingState({ mode: "new", dogId: null }); setScreen("onboard"); }} /></>;
  if (screen === "onboard") return <Onboarding onComplete={handleOnboardComplete} onBack={() => { setOnboardingState(null); setScreen("select"); }} />;

  return (
    <>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {needRefresh && (
        <div className="update-banner" role="status" aria-live="polite">
          <span>Update available</span>
          <button type="button" className="update-banner-btn" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        </div>
      )}
      <div className="app">
        <div className="header">
          <div className="header-top">
            <div className="identity-zone">
              <label className="dog-photo-btn" title="Tap to change photo">
                <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoUpload} />
                {dogPhoto ? <img src={dogPhoto} className="dog-photo-img" alt={appData.name} /> : <div className="dog-photo-placeholder"><PawIcon size={28} /></div>}
                <div className="dog-photo-overlay"><CameraIcon /></div>
              </label>
              <div className="identity-copy">
                <div className="app-title">{appData.name}</div>
                <div className="app-subtitle">Separation anxiety training</div>
              </div>
            </div>
          </div>
        </div>

        {tab === "home" && <HomeScreen name={appData.name} sessions={canonicalSessions} recommendation={appData.recommendation} goalPct={appData.goalPct} goalSec={appData.goalSec} phase={phase} elapsed={elapsed} finalElapsed={finalElapsed} sessionCompleted={sessionCompleted} sessionOutcome={sessionOutcome} setSessionOutcome={setSessionOutcome} recordResult={recordResult} latencyDraft={latencyDraft} setLatencyDraft={setLatencyDraft} distressTypeDraft={distressTypeDraft} setDistressTypeDraft={setDistressTypeDraft} setPhase={setPhase} setElapsed={setElapsed} setFinalElapsed={setFinalElapsed} startSession={startSession} endSession={endSession} cancelSession={cancelSession} activeProto={appData.activeProto} daily={appData.daily} pattern={appData.pattern} walkPhase={walkPhase} startWalk={startWalk} cancelWalk={cancelWalk} walkElapsed={walkElapsed} endWalk={endWalk} walkPendingDuration={walkPendingDuration} saveWalkWithType={saveWalkWithType} patOpen={patOpen} setPatOpen={setPatOpen} patReminderText={appData.patReminderText} logPattern={logPattern} patLabels={patLabels} patterns={patterns} feedings={feedings} feedingOpen={feedingOpen} openFeedingForm={openFeedingForm} feedingDraft={feedingDraft} setFeedingDraft={setFeedingDraft} cancelFeedingForm={cancelFeedingForm} saveFeeding={saveFeeding} />}
        {tab === "history" && <HistoryScreen timeline={appData.timeline} sessions={canonicalSessions} name={appData.name} setTab={setTab} patLabels={patLabels} historyModal={historyModal} setHistoryModal={setHistoryModal} actions={historyActions} />}
        {tab === "progress" && <StatsScreen name={appData.name} totalCount={appData.totalCount} setTab={setTab} bestCalm={appData.bestCalm} recommendation={appData.recommendation} relapseTone={appData.relapseTone} chartData={appData.chartData} goalSec={appData.goalSec} CustomDot={CustomDot} distressLabel={appData.distressLabel} chartTrendLabel={appData.chartTrendLabel} aloneLastWeek={appData.aloneLastWeek} avgWalkDuration={appData.avgWalkDuration} avgSessionsPerDay={appData.avgSessionsPerDay} avgWalksPerDay={appData.avgWalksPerDay} headlineStatus={appData.headlineStatus} headlineStatusTone={appData.headlineStatusTone} />}
        {tab === "settings" && <SettingsScreen name={appData.name} activeDogId={activeDogId} copyDogId={copyDogId} notifEnabled={notifEnabled} handleToggleNotif={handleToggleNotif} notifTime={notifTime} setNotifTime={setNotifTime} scheduleNotif={scheduleNotif} dogs={dogs} activeProto={appData.activeProto} pattern={appData.pattern} recommendation={appData.recommendation} setTrainingSettingsOpen={setTrainingSettingsOpen} patLabels={patLabels} editingPat={editingPat} setEditingPat={setEditingPat} setPatLabels={setPatLabels} settingsDisclosure={settingsDisclosure} setSettingsDisclosure={setSettingsDisclosure} syncDiagRunning={syncDiagRunning} runSyncDiagnostics={runSyncDiagnostics} SYNC_ENABLED={SYNC_ENABLED} SB_URL={SB_URL} SB_KEY={SB_KEY} SB_BASE_URL={SB_BASE_URL} syncDiagResult={syncDiagResult} syncSummary={syncSummary} syncDegradation={syncDegradation} trainingSettingsOpen={trainingSettingsOpen} setProtoWarnAck={setProtoWarnAck} protoWarnAck={protoWarnAck} protoOverride={protoOverride} setProtoOverride={setProtoOverride} setScreen={setScreen} setOnboardingState={setOnboardingState} dogsState={dogs} setDogs={setDogs} save={save} ACTIVE_DOG_KEY={ACTIVE_DOG_KEY} setActiveDogId={setActiveDogId} clearDogActivityState={clearDogActivityState} />}
      </div>

      <div className="tabs">{[{ id: "home", label: "Train", icon: <HomeIcon /> }, { id: "history", label: "History", icon: <HistoryIcon /> }, { id: "progress", label: "Progress", icon: <ChartIcon /> }, { id: "settings", label: "Settings", icon: <SettingsIcon /> }].map((t) => <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.icon}{t.label}</button>)}</div>
    </>
  );
}
