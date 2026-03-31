import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PROTOCOL, normalizeDistressLevel, suggestNext, suggestNextWithContext } from "./lib/protocol";
import { sortByDateAsc } from "./lib/activityDateTime";
import { selectAppData } from "./features/app/selectors";
import { ACTIVE_DOG_KEY, DOGS_KEY, SB_BASE_URL, SB_KEY, SB_URL, SYNC_ENABLED, canonicalDogId, ensureArray, ensureObject, feedingKey, generateId, hydrateDogFromLocal, load, logSyncDebug, makeEntryId, mergeById, mergeSessionWithDerivedFields, normalizeFeedings, normalizeSessions, patKey, patLblKey, photoKey, save, sessKey, syncDelete, syncDeleteSessionsForDog, syncFetch, syncPush, syncUpsertDog, toDateTimeLocalValue, walkKey } from "./features/app/storage";
import { fmt, getOutcomeTone, normalizeWalkType, walkTypeLabel } from "./features/app/helpers";
import { CameraIcon, ChartIcon, HistoryIcon, HomeIcon, PawIcon, SettingsIcon } from "./features/app/ui.jsx";
import { DogSelect, Onboarding } from "./features/setup/SetupScreens";
import HomeScreen from "./features/home/HomeScreen";
import StatsScreen from "./features/stats/StatsScreen";
import SettingsScreen from "./features/settings/SettingsScreen";
import { HistoryScreen, useHistoryEditing } from "./features/history/HistoryFeature";
import { analyzeSessionAudio } from "./features/train/audioAnalysis";
import { useAudioRecorder } from "./features/train/useAudioRecorder";
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
export default function PawTimer() {
  const [dogs, setDogs] = useState(() => ensureArray(load(DOGS_KEY, [])));
  const [activeDogId, setActiveDogId] = useState(() => canonicalDogId(load(ACTIVE_DOG_KEY, null)));
  const [screen, setScreen] = useState("select");
  const [sessions, setSessions] = useState([]);
  const [walks, setWalks] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [feedings, setFeedings] = useState([]);
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
  const [audioStartPromptOpen, setAudioStartPromptOpen] = useState(false);
  const [audioSummaryOpen, setAudioSummaryOpen] = useState(false);
  const [audioSummaryResult, setAudioSummaryResult] = useState(null);
  const [sessionAudioMeta, setSessionAudioMeta] = useState({ enabled: false, status: "idle" });
  const recorder = useAudioRecorder();

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
  const syncSnapshotRef = useRef({ dogs: [], sessions: [], walks: [], patterns: [], feedings: [] });

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

  const mergeSyncedCollection = useCallback((localItems, remoteItems) => mergeById(
    ensureArray(localItems).map(withHydratedSyncState),
    ensureArray(remoteItems).map(markRemoteEntryConfirmed),
  ), [markRemoteEntryConfirmed, withHydratedSyncState]);

  useEffect(() => {
    syncSnapshotRef.current = { dogs, sessions, walks, patterns, feedings };
  }, [dogs, sessions, walks, patterns, feedings]);

  useEffect(() => { save(DOGS_KEY, dogs); }, [dogs]);
  useEffect(() => { save(ACTIVE_DOG_KEY, canonicalDogId(activeDogId)); }, [activeDogId]);
  useEffect(() => { if (activeDogId) save(sessKey(activeDogId), sessions); }, [sessions, activeDogId]);
  useEffect(() => { if (activeDogId) save(walkKey(activeDogId), walks); }, [walks, activeDogId]);
  useEffect(() => { if (activeDogId) save(patKey(activeDogId), patterns); }, [patterns, activeDogId]);
  useEffect(() => { if (activeDogId) save(feedingKey(activeDogId), feedings); }, [feedings, activeDogId]);
  useEffect(() => { if (activeDogId) save(patLblKey(activeDogId), patLabels); }, [patLabels, activeDogId]);
  useEffect(() => { if (activeDogId) save(photoKey(activeDogId), dogPhoto); }, [dogPhoto, activeDogId]);
  useEffect(() => { save("pawtimer_notif_time", notifTime); }, [notifTime]);
  useEffect(() => { save("pawtimer_notif_on", notifEnabled); }, [notifEnabled]);
  useEffect(() => { save("pawtimer_proto_override", protoOverride); }, [protoOverride]);
  const appData = selectAppData({ dogs, activeDogId, sessions, walks, patterns, feedings, target, protoOverride });

  const recomputeTarget = useCallback((nextSessions, nextWalks = walks, nextPatterns = patterns, nextDog = appData.dog) => {
    const nextTarget = suggestNextWithContext(nextSessions, nextWalks, nextPatterns, nextDog) ?? suggestNext(nextSessions, nextDog);
    setTarget(nextTarget);
    return nextTarget;
  }, [appData.dog, patterns, walks]);

  const commitSessions = useCallback((updater) => {
    let normalized = [];
    setSessions((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      normalized = normalizeSessions(ensureArray(resolved)).map(withHydratedSyncState);
      if (activeDogId) save(sessKey(activeDogId), normalized);
      return normalized;
    });
    recomputeTarget(normalized);
    return normalized;
  }, [activeDogId, recomputeTarget, withHydratedSyncState]);

  const commitWalks = useCallback((updater) => {
    setWalks((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = sortByDateAsc(ensureArray(resolved).map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) })));
      if (activeDogId) save(walkKey(activeDogId), normalized);
      return normalized;
    });
  }, [activeDogId, withHydratedSyncState]);

  const commitPatterns = useCallback((updater) => {
    setPatterns((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = sortByDateAsc(ensureArray(resolved).map(withHydratedSyncState));
      if (activeDogId) save(patKey(activeDogId), normalized);
      return normalized;
    });
  }, [activeDogId, withHydratedSyncState]);

  const commitFeedings = useCallback((updater) => {
    setFeedings((prev) => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      const normalized = normalizeFeedings(ensureArray(resolved)).map(withHydratedSyncState);
      if (activeDogId) save(feedingKey(activeDogId), normalized);
      return normalized;
    });
  }, [activeDogId, withHydratedSyncState]);

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
    if (!activeDogId) { setScreen("select"); return; }
    const normalizedId = canonicalDogId(activeDogId);
    const dog = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (!dog) { setScreen("select"); return; }
    const local = hydrateDogFromLocal(normalizedId);
    const hydratedSessions = normalizeSessions(local.sessions).map(withHydratedSyncState);
    const hydratedWalks = sortByDateAsc(ensureArray(local.walks).map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) })));
    const hydratedPatterns = sortByDateAsc(ensureArray(local.patterns).map(withHydratedSyncState));
    const hydratedFeedings = normalizeFeedings(local.feedings).map(withHydratedSyncState);
    setSessions(hydratedSessions);
    setWalks(hydratedWalks);
    setPatterns(hydratedPatterns);
    setFeedings(hydratedFeedings);
    setPatLabels(local.patLabels);
    setDogPhoto(local.photo);
    setTarget(suggestNextWithContext(hydratedSessions, hydratedWalks, hydratedPatterns, dog) ?? suggestNext(hydratedSessions, dog));
    setScreen("app");
  }, [activeDogId, dogs, withHydratedSyncState]);

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
      setEntrySyncState(kind, entry.id, SYNC_STATE.SYNCING);
      const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, entry, dogSettings);
      if (!live) return ok;
      if (ok) {
        setEntrySyncState(kind, entry.id, SYNC_STATE.SYNCED);
        return true;
      }
      setEntrySyncState(kind, entry.id, SYNC_STATE.ERROR, error || "Push failed");
      return false;
    };

    const sync = async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        setSyncStatus("syncing");
        const { result: remote, error } = await syncFetch(canonicalDogId(activeDogId));
        if (!live) return;
        if (!remote) { setSyncStatus("err"); setSyncError(error || "Unknown sync fetch error"); return; }

        const snapshot = syncSnapshotRef.current;
        const remoteDog = remote.dog ? { ...remote.dog, id: canonicalDogId(remote.dog.id || activeDogId) } : null;
        if (remoteDog) {
          setDogs((prev) => {
            const next = [...prev.filter((d) => canonicalDogId(d.id) !== remoteDog.id), remoteDog];
            save(DOGS_KEY, next);
            return next;
          });
        }

        const remoteSessions = normalizeSessions(remote.sessions);
        const remoteWalks = ensureArray(remote.walks).map((item) => ({ ...item, type: normalizeWalkType(item?.type) }));
        const remotePatterns = ensureArray(remote.patterns);
        const remoteFeedings = normalizeFeedings(remote.feedings);

        const mergedSessions = mergeSyncedCollection(snapshot.sessions, remoteSessions);
        const mergedWalks = mergeSyncedCollection(snapshot.walks, remoteWalks);
        const mergedPatterns = mergeSyncedCollection(snapshot.patterns, remotePatterns);
        const mergedFeedings = mergeSyncedCollection(snapshot.feedings, remoteFeedings);

        commitSessions(mergedSessions);
        commitWalks(mergedWalks);
        commitPatterns(mergedPatterns);
        commitFeedings(mergedFeedings);

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

        const syncDog = remoteDog ?? currentDog;
        setTarget(suggestNextWithContext(mergedSessions, mergedWalks, mergedPatterns, syncDog) ?? suggestNext(mergedSessions, syncDog));
        if (!allPendingFlushed) {
          setSyncError("Some local changes are still waiting for confirmation.");
          setSyncStatus("err");
          return;
        }
        setSyncError(error || "");
        setSyncStatus(error ? "err" : "ok");
      } finally {
        syncInFlightRef.current = false;
      }
    };

    sync();
    const timer = setInterval(sync, 15_000);
    return () => { live = false; syncInFlightRef.current = false; clearInterval(timer); };
  }, [activeDogId, commitFeedings, commitPatterns, commitSessions, commitWalks, mergeSyncedCollection, setEntrySyncState]);

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

  const scheduleNotif = useCallback(async (time, dogName) => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    if (Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return false;
    }
    const [h, m] = time.split(":").map(Number);
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "SCHEDULE_NOTIF", hour: h, minute: m, dogName });
    return true;
  }, []);

  const cancelNotif = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    reg?.active?.postMessage({ type: "CANCEL_NOTIF" });
  }, []);

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
    save(patLblKey(normalizedId), {});
    save(photoKey(normalizedId), null);
    setSessions([]);
    setWalks([]);
    setPatterns([]);
    setFeedings([]);
    setPatLabels({});
    setDogPhoto(null);
  }, []);

  const openDog = (dog) => { logSyncDebug("openDog", { dogId: canonicalDogId(dog?.id) }); setOnboardingState(null); setActiveDogId(canonicalDogId(dog.id)); setScreen("app"); };

  const handleDogSelect = async (id, isJoin = false) => {
    const normalizedId = canonicalDogId(id);
    if (isJoin && SYNC_ENABLED) {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(normalizedId);
      if (!remote?.dog) { setSyncStatus("err"); setSyncError(error || `No shared dog account found for ${normalizedId}`); showToast(`No shared profile found for ${normalizedId} yet.`); return; }
      const sharedDog = { ...remote.dog, id: normalizedId };
      setDogs((prev) => [...prev.filter((d) => canonicalDogId(d.id) !== normalizedId), sharedDog]);
      const joinedSessions = normalizeSessions(remote.sessions).map(markRemoteEntryConfirmed);
      const joinedWalks = sortByDateAsc(ensureArray(remote.walks).map((item) => markRemoteEntryConfirmed({ ...item, type: normalizeWalkType(item?.type) })));
      const joinedPatterns = sortByDateAsc(ensureArray(remote.patterns).map(markRemoteEntryConfirmed));
      const joinedFeedings = normalizeFeedings(remote.feedings).map(markRemoteEntryConfirmed);
      setSessions(joinedSessions);
      setWalks(joinedWalks);
      setPatterns(joinedPatterns);
      setFeedings(joinedFeedings);
      save(sessKey(normalizedId), joinedSessions);
      save(walkKey(normalizedId), joinedWalks);
      save(patKey(normalizedId), joinedPatterns);
      save(feedingKey(normalizedId), joinedFeedings);
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
    const newDog = {
      ...data,
      id,
      dogName: data.dogName,
      createdAt: new Date().toISOString(),
    };
    if (isFreshProfile) clearDogActivityState(id);
    setDogs((prev) => [...prev.filter((d) => d.id !== id), newDog]);
    setOnboardingState(null);
    setActiveDogId(id);
    setTab("home");
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const startSessionCore = () => {
    setElapsed(0);
    setSessionCompleted(false);
    setSessionOutcome(null);
    setLatencyDraft("");
    setDistressTypeDraft("");
    setAudioSummaryResult(null);
    setAudioSummaryOpen(false);
    setPhase("running");
  };

  const startSession = () => {
    if (phase !== "idle") return;
    setAudioStartPromptOpen(true);
  };

  const confirmSessionStartWithAudio = async () => {
    setAudioStartPromptOpen(false);
    if (!recorder.isSupported) {
      setSessionAudioMeta({ enabled: false, status: "unsupported" });
      showToast("Audio monitoring is not supported in this browser. Session started without audio.");
      startSessionCore();
      return;
    }
    const startResult = await recorder.start();
    if (!startResult.ok) {
      setSessionAudioMeta({ enabled: false, status: startResult.reason || "failed" });
      showToast("Audio monitoring could not start. Session started without audio.");
      startSessionCore();
      return;
    }
    setSessionAudioMeta({ enabled: true, status: "recording" });
    startSessionCore();
  };

  const startSessionWithoutAudio = () => {
    setAudioStartPromptOpen(false);
    recorder.reset();
    setSessionAudioMeta({ enabled: false, status: "disabled" });
    startSessionCore();
  };

  const closeAudioStartPrompt = () => setAudioStartPromptOpen(false);

  const endSession = async () => {
    clearInterval(timerRef.current);
    setFinalElapsed(elapsed);
    setPhase("rating");
    if (!sessionAudioMeta.enabled) return;

    const stopResult = await recorder.stop();
    if (!stopResult.ok || !stopResult.blob || stopResult.blob.size === 0) {
      setSessionAudioMeta((prev) => ({ ...prev, enabled: false, status: "empty_or_failed" }));
      showToast("Audio monitoring ended, but no reviewable audio was available.");
      return;
    }

    const analysis = await analyzeSessionAudio({
      audioBlob: stopResult.blob,
      durationSeconds: stopResult.durationSeconds,
    });
    if (analysis.status !== "ready") {
      setSessionAudioMeta((prev) => ({ ...prev, enabled: true, status: analysis.status }));
      showToast("Audio analysis couldn't complete for this session.");
      return;
    }

    setAudioSummaryResult(analysis);
    setAudioSummaryOpen(true);
    setSessionAudioMeta({ enabled: true, status: "analyzed" });
  };

  const closeAudioSummary = () => setAudioSummaryOpen(false);

  const cancelSession = () => {
    setPhase("idle");
    setElapsed(0);
    setFinalElapsed(0);
    setSessionCompleted(false);
    setSessionOutcome(null);
    setLatencyDraft("");
    setDistressTypeDraft("");
    setAudioStartPromptOpen(false);
    setAudioSummaryOpen(false);
    setAudioSummaryResult(null);
    recorder.reset();
    setSessionAudioMeta({ enabled: false, status: "idle" });
    clearInterval(timerRef.current);
  };

  const pushWithSyncStatus = async (kind, data) => {
    if (!SYNC_ENABLED || !activeDogId) return { ok: false, error: "Sync is disabled" };
    const currentDog = syncSnapshotRef.current.dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    setEntrySyncState(kind, data.id, SYNC_STATE.SYNCING);
    setSyncStatus("syncing");
    const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, data, dogSettings);
    if (ok) {
      setEntrySyncState(kind, data.id, SYNC_STATE.SYNCED);
      setSyncError("");
      setSyncStatus("ok");
      return { ok: true, error: null };
    }
    const message = error || "Push failed";
    setEntrySyncState(kind, data.id, SYNC_STATE.ERROR, message);
    setSyncError(message);
    setSyncStatus("err");
    return { ok: false, error: message };
  };

  const runSyncDiagnostics = async () => {
    setSyncDiagRunning(true);
    try {
      const report = { checkedAt: new Date().toISOString(), env: { syncEnabled: SYNC_ENABLED, hasUrl: Boolean(SB_URL), hasAnonKey: Boolean(SB_KEY), normalizedUrl: SB_BASE_URL || "(missing)", urlLooksValid: /^https:\/\/[^\s]+\.supabase\.co$/i.test(SB_BASE_URL || "") }, checks: {} };
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
    const rawSession = mergeSessionWithDerivedFields({}, { id: makeEntryId("sess", activeDogId), date: now.toISOString(), plannedDuration: target, actualDuration: finalElapsed, distressLevel, result: distressLevel === "none" ? "success" : "distress", belowThreshold: distressLevel === "none" && finalElapsed >= target, latencyToFirstDistress, distressType, distressSeverity: distressLevel, context: { timeOfDay, departureType: "training", cuesUsed: [], location: null, barrierUsed: null, enrichmentPresent: null, mediaOn: null, whoLeft: null, anotherPersonStayed: null }, symptoms: { barking: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, pacing: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, destructive: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0, salivation: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0 }, videoReview: { recorded: false, firstSubtleDistressTs: null, firstActiveDistressTs: null, eventTags: [], notes: null, ratingConfidence: null }, recoverySeconds: distressLevel === "none" ? 0 : null, preSession: { walkDuration: null, enrichmentGiven: null }, environment: { noiseEvent: false }, audioMonitoringEnabled: sessionAudioMeta.enabled, audioAnalysisStatus: sessionAudioMeta.status, audioStressLevel: audioSummaryResult?.stressLevel || null, confirmedBarkCount: audioSummaryResult?.confirmedBarkCount ?? 0, reviewSegments: audioSummaryResult?.reviewSegments || [] });
    const session = stampLocalEntry(rawSession);
    const updated = commitSessions((prev) => [...prev, session]);
    pushWithSyncStatus("session", session).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    const next = suggestNextWithContext(updated, walks, patterns, dog) ?? suggestNext(updated, dog);
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

  const historyActions = useHistoryEditing({ sessions, walks, patterns, feedings, patLabels, showToast, pushWithSyncStatus, syncDelete, syncDeleteSessionsForDog, commitSessions, setWalks: commitWalks, setPatterns: commitPatterns, setFeedings: commitFeedings, recomputeTarget, activeDogId, stampLocalEntry });

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

        {tab === "home" && <HomeScreen name={appData.name} sessions={sessions} target={target} goalPct={appData.goalPct} goalSec={appData.goalSec} phase={phase} elapsed={elapsed} finalElapsed={finalElapsed} sessionCompleted={sessionCompleted} sessionOutcome={sessionOutcome} setSessionOutcome={setSessionOutcome} recordResult={recordResult} latencyDraft={latencyDraft} setLatencyDraft={setLatencyDraft} distressTypeDraft={distressTypeDraft} setDistressTypeDraft={setDistressTypeDraft} setPhase={setPhase} setElapsed={setElapsed} setFinalElapsed={setFinalElapsed} startSession={startSession} endSession={endSession} cancelSession={cancelSession} activeProto={appData.activeProto} daily={appData.daily} pattern={appData.pattern} walkPhase={walkPhase} startWalk={startWalk} cancelWalk={cancelWalk} walkElapsed={walkElapsed} endWalk={endWalk} walkPendingDuration={walkPendingDuration} saveWalkWithType={saveWalkWithType} patOpen={patOpen} setPatOpen={setPatOpen} patReminderText={appData.patReminderText} logPattern={logPattern} patLabels={patLabels} patterns={patterns} feedings={feedings} feedingOpen={feedingOpen} openFeedingForm={openFeedingForm} feedingDraft={feedingDraft} setFeedingDraft={setFeedingDraft} cancelFeedingForm={cancelFeedingForm} saveFeeding={saveFeeding} audioStartPromptOpen={audioStartPromptOpen} confirmSessionStartWithAudio={confirmSessionStartWithAudio} startSessionWithoutAudio={startSessionWithoutAudio} closeAudioStartPrompt={closeAudioStartPrompt} audioSummaryOpen={audioSummaryOpen} audioSummaryResult={audioSummaryResult} closeAudioSummary={closeAudioSummary} />}
        {tab === "history" && <HistoryScreen timeline={appData.timeline} sessions={sessions} name={appData.name} setTab={setTab} patLabels={patLabels} historyModal={historyModal} setHistoryModal={setHistoryModal} actions={historyActions} />}
        {tab === "progress" && <StatsScreen name={appData.name} totalCount={appData.totalCount} setTab={setTab} bestCalm={appData.bestCalm} target={target} relapseTone={appData.relapseTone} chartData={appData.chartData} goalSec={appData.goalSec} CustomDot={CustomDot} distressLabel={appData.distressLabel} chartTrendLabel={appData.chartTrendLabel} aloneLastWeek={appData.aloneLastWeek} avgWalkDuration={appData.avgWalkDuration} avgSessionsPerDay={appData.avgSessionsPerDay} avgWalksPerDay={appData.avgWalksPerDay} currentThreshold={appData.currentThreshold} headlineStatus={appData.headlineStatus} headlineStatusTone={appData.headlineStatusTone} />}
        {tab === "settings" && <SettingsScreen name={appData.name} activeDogId={activeDogId} copyDogId={copyDogId} notifEnabled={notifEnabled} handleToggleNotif={handleToggleNotif} notifTime={notifTime} setNotifTime={setNotifTime} scheduleNotif={scheduleNotif} dogs={dogs} activeProto={appData.activeProto} pattern={appData.pattern} setTrainingSettingsOpen={setTrainingSettingsOpen} patLabels={patLabels} editingPat={editingPat} setEditingPat={setEditingPat} setPatLabels={setPatLabels} settingsDisclosure={settingsDisclosure} setSettingsDisclosure={setSettingsDisclosure} syncDiagRunning={syncDiagRunning} runSyncDiagnostics={runSyncDiagnostics} SYNC_ENABLED={SYNC_ENABLED} SB_URL={SB_URL} SB_KEY={SB_KEY} SB_BASE_URL={SB_BASE_URL} syncDiagResult={syncDiagResult} syncSummary={syncSummary} nextTargetInfo={appData.nextTargetInfo} trainingSettingsOpen={trainingSettingsOpen} setProtoWarnAck={setProtoWarnAck} protoWarnAck={protoWarnAck} protoOverride={protoOverride} setProtoOverride={setProtoOverride} setScreen={setScreen} setOnboardingState={setOnboardingState} dogsState={dogs} setDogs={setDogs} save={save} ACTIVE_DOG_KEY={ACTIVE_DOG_KEY} setActiveDogId={setActiveDogId} />}
      </div>

      <div className="tabs">{[{ id: "home", label: "Train", icon: <HomeIcon /> }, { id: "history", label: "History", icon: <HistoryIcon /> }, { id: "progress", label: "Progress", icon: <ChartIcon /> }, { id: "settings", label: "Settings", icon: <SettingsIcon /> }].map((t) => <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.icon}{t.label}</button>)}</div>
    </>
  );
}
