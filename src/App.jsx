import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PROTOCOL, explainNextTarget, suggestNext, suggestNextWithContext } from "./lib/protocol";
import { sortValidDateAsc } from "./lib/dateSort";
import { sortByDateAsc } from "./lib/activityDateTime";
import { selectAppData } from "./features/app/selectors";
import { ACTIVE_DOG_KEY, DOGS_KEY, SB_BASE_URL, SB_KEY, SB_URL, SYNC_ENABLED, canonicalDogId, ensureArray, ensureObject, generateId, hydrateDogFromLocal, load, logSyncDebug, makeEntryId, stampLocalEntry, markRemoteEntryConfirmed, normalizeDogSyncMetadata, normalizeFeedings, normalizeSessions, normalizeTombstones, resolveDogSettingsConflict, save, stampLocalDogSettings, toDateTimeLocalValue, applyTombstonesToCollection, getSyncDegradationState } from "./features/app/storage";
import { computeSyncSummary } from "./features/app/syncSummary";
import { fmt, fmtClock, getOutcomeTone, normalizeWalkType, walkTypeLabel } from "./features/app/helpers";
import { CameraIcon, ChartIcon, HistoryIcon, HomeIcon, PawIcon, SettingsIcon } from "./features/app/ui.jsx";
import { DogSelect, Onboarding, WelcomeScreen } from "./features/setup/SetupScreens";
import HomeScreen from "./features/home/HomeScreen";
import StatsScreen from "./features/stats/StatsScreen";
import SettingsScreen from "./features/settings/SettingsScreen";
import { HistoryScreen, useHistoryEditing } from "./features/history/HistoryFeature";
import { buildTrainTimeChangeInsight } from "./features/train/timeChangeInsight";

import { useAppData } from "./features/app/useAppData";
import { useSyncEngine } from "./features/app/useSyncEngine";
import { useTrainingTimer } from "./features/app/useTrainingTimer";
import { useWalkTimer } from "./features/app/useWalkTimer";
import { AppContext } from "./features/app/AppContext";
import { compressImage } from "./lib/imageUtils";

import "./styles/theme.css";
import "./styles/shared.css";
import "./styles/primitives.css";
import "./styles/app.css";
import "./styles/high-contrast.css";

const LEGACY_SW_PATHS = ["/service-worker.js", "/serviceworker.js", "/workbox-sw.js"];

function recoveryStateEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export default function PawTimer() {
  const TAB_IDS = ["home", "history", "progress", "settings"];
  const [screen, setScreen] = useState("select");
  const [tab, setTab] = useState("home");
  const [tabMotionDirection, setTabMotionDirection] = useState("forward");
  const [onboardingState, setOnboardingState] = useState(null);
  const [target, setTarget] = useState(PROTOCOL.startDurationSeconds);
  const [toast, setToast] = useState(null);
  const [patOpen, setPatOpen] = useState(false);
  const [editingPat, setEditingPat] = useState(null);
  const [syncDiagRunning, setSyncDiagRunning] = useState(false);
  const [syncDiagResult, setSyncDiagResult] = useState(null);
  const [notifTime, setNotifTime] = useState(() => load("pawtimer_notif_time", "09:00"));
  const [notifEnabled, setNotifEnabled] = useState(() => load("pawtimer_notif_on", false));
  const [protoWarnAck, setProtoWarnAck] = useState(false);
  const [protoOverride, setProtoOverride] = useState(() => ensureObject(load("pawtimer_proto_override", {})));
  const [settingsDisclosure, setSettingsDisclosure] = useState(null);
  const [trainingSettingsOpen, setTrainingSettingsOpen] = useState(false);
  const [trainFirstRunHintVisible, setTrainFirstRunHintVisible] = useState(false);
  const [trainTimeChangeInsight, setTrainTimeChangeInsight] = useState(null);
  const [returningTrainNudge, setReturningTrainNudge] = useState(null);
  const [feedingOpen, setFeedingOpen] = useState(false);
  const [feedingDraft, setFeedingDraft] = useState(() => ({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }));
  const [historyModal, setHistoryModal] = useState(null);

  const getSetupLandingScreen = useCallback((nextDogs) => (ensureArray(nextDogs).length > 0 ? "select" : "welcome"), []);

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
          const swUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
          if (LEGACY_SW_PATHS.some((legacyPath) => swUrl.endsWith(legacyPath))) {
            await registration.unregister();
          }
        })
      ))
      .catch(() => {});
  }, []);

  const recomputeTarget = useCallback((nextSessions, nextWalks, nextPatterns, nextDog) => {
    const logicalSessions = sortValidDateAsc(nextSessions || []);
    const details = explainNextTarget(logicalSessions, nextWalks || [], nextPatterns || [], nextDog || {});
    const recommendedDuration = details?.recommendedDuration
      ?? (suggestNextWithContext(logicalSessions, nextWalks || [], nextPatterns || [], nextDog || {}) ?? suggestNext(logicalSessions, nextDog || {}));
    setTarget(recommendedDuration);
    return recommendedDuration;
  }, []);

  const {
    dogs, setDogs, activeDogId, setActiveDogId,
    sessions, walks, patterns, feedings, tombstones, patLabels, setPatLabels, dogPhoto, setDogPhoto,
    sessionsRef, walksRef, patternsRef, feedingsRef, tombstonesRef, syncSnapshotRef,
    setSessions, setWalks, setPatterns, setFeedings, setTombstones,
    commitSessions, commitWalks, commitPatterns, commitFeedings, commitTombstones,
    addTombstone, updateSyncState,
    syncStatus, setSyncStatus, syncError, setSyncError,
    reportLocalWriteFailure, withHydratedSyncState
  } = useAppData({ recomputeTarget, logSyncDebug });

  const setEntrySyncState = useCallback((kind, entryId, nextSyncState, errorMessage = "") => {
    updateSyncState(kind, entryId, nextSyncState, errorMessage);
  }, [updateSyncState]);

  const {
    syncDegradation, pushWithSyncStatus, pushTombstoneWithSyncStatus
  } = useSyncEngine({
    SYNC_ENABLED, activeDogId, syncSnapshotRef, syncHelpersRef, tombstonesRef, reportLocalWriteFailure,
    setDogs, setTombstoneSyncState: updateSyncState, withHydratedSyncState, markRemoteEntryConfirmed, commitTombstones, logSyncDebug
  });

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); }, []);

  const activeDog = useMemo(() => dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId)) ?? null, [activeDogId, dogs]);
  const canonicalSessions = useMemo(() => sortValidDateAsc(sessions), [sessions]);

  const deriveRecommendation = useCallback((nextSessions, nextWalks = walks, nextPatterns = patterns, nextDog = activeDog || {}) => {
    const logicalSessions = sortValidDateAsc(nextSessions);
    const details = explainNextTarget(logicalSessions, nextWalks, nextPatterns, nextDog || {});
    const recommendedDuration = details?.recommendedDuration ?? (suggestNextWithContext(logicalSessions, nextWalks, nextPatterns, nextDog) ?? suggestNext(logicalSessions, nextDog));
    return { duration: recommendedDuration, decisionState: details?.decisionState ?? null, explanation: details?.summary ?? "", details: details ?? {} };
  }, [activeDog, patterns, walks]);

  const recommendation = useMemo(() => deriveRecommendation(canonicalSessions, walks, patterns, activeDog || {}), [activeDog, canonicalSessions, deriveRecommendation, patterns, walks]);

  const appData = selectAppData({ dogs, activeDogId, sessions: canonicalSessions, walks, patterns, feedings, target: recommendation.duration, protoOverride, recommendation });

  useEffect(() => {
    syncHelpersRef.current = {
      commitSessions, commitWalks, commitPatterns, commitFeedings, recomputeTarget, setEntrySyncState,
    };
  }, [commitFeedings, commitPatterns, commitSessions, commitWalks, recomputeTarget, setEntrySyncState]);

  useEffect(() => { save("pawtimer_notif_time", notifTime); }, [notifTime]);
  useEffect(() => { save("pawtimer_notif_on", notifEnabled); }, [notifEnabled]);
  useEffect(() => { save("pawtimer_proto_override", protoOverride); }, [protoOverride]);

  useEffect(() => {
    setTarget((prev) => (prev === recommendation.duration ? prev : recommendation.duration));
  }, [recommendation.duration]);

  const trainFirstRunHintKey = useMemo(() => (activeDogId ? `pawtimer_train_intro_seen_v1_${canonicalDogId(activeDogId)}` : null), [activeDogId]);
  const trainReturnSnapshotKey = useMemo(() => (activeDogId ? `pawtimer_train_last_seen_v1_${canonicalDogId(activeDogId)}` : null), [activeDogId]);

  useEffect(() => {
    if (!activeDogId || !trainFirstRunHintKey) { setTrainFirstRunHintVisible(false); return; }
    const hasSessions = canonicalSessions.length > 0;
    const hasSeenHint = load(trainFirstRunHintKey, false) === true;
    setTrainFirstRunHintVisible(!hasSeenHint && !hasSessions);
  }, [activeDogId, canonicalSessions.length, trainFirstRunHintKey]);

  const completeTrainFirstRunHint = useCallback(() => {
    if (!trainFirstRunHintKey) return;
    save(trainFirstRunHintKey, true);
    setTrainFirstRunHintVisible(false);
  }, [trainFirstRunHintKey]);

  const acknowledgeReturningTrainNudge = useCallback(() => {
    if (!trainReturnSnapshotKey) return;
    save(trainReturnSnapshotKey, { target: recommendation.duration, seenAt: new Date().toISOString() });
    setReturningTrainNudge(null);
  }, [recommendation.duration, trainReturnSnapshotKey]);

  useEffect(() => {
    if (!trainReturnSnapshotKey || !activeDogId || canonicalSessions.length === 0) { setReturningTrainNudge(null); return; }
    const snapshot = ensureObject(load(trainReturnSnapshotKey, {}));
    const previousTarget = Number(snapshot.target);
    if (!Number.isFinite(previousTarget)) { setReturningTrainNudge(null); return; }
    const currentTarget = Number(recommendation.duration);
    if (!Number.isFinite(currentTarget) || currentTarget === previousTarget) { setReturningTrainNudge(null); return; }
    setReturningTrainNudge({ previousTarget, currentTarget, changedBy: currentTarget - previousTarget, seenAt: snapshot.seenAt || null });
  }, [activeDogId, canonicalSessions.length, recommendation.duration, trainReturnSnapshotKey]);

  useEffect(() => {
    if (!trainReturnSnapshotKey || !activeDogId) return;
    if (tab !== "home") save(trainReturnSnapshotKey, { target: recommendation.duration, seenAt: new Date().toISOString() });
  }, [activeDogId, recommendation.duration, tab, trainReturnSnapshotKey]);

  useEffect(() => {
    if (!activeDogId) { setScreen(getSetupLandingScreen(dogs)); return; }
    const normalizedId = canonicalDogId(activeDogId);
    const dog = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (!dog) { setScreen(getSetupLandingScreen(dogs)); return; }
    const local = hydrateDogFromLocal(normalizedId);
    const hydratedTombstones = normalizeTombstones(local.tombstones).map(withHydratedSyncState);
    const hydratedSessions = sortByDateAsc(normalizeSessions(local.sessions).map(withHydratedSyncState));
    const hydratedWalks = sortByDateAsc(ensureArray(local.walks).map((item) => ({ ...withHydratedSyncState(item), type: normalizeWalkType(item?.type) })));
    const hydratedPatterns = sortByDateAsc(ensureArray(local.patterns).map(withHydratedSyncState));
    const hydratedFeedings = normalizeFeedings(local.feedings).map(withHydratedSyncState);
    
    tombstonesRef.current = hydratedTombstones;
    sessionsRef.current = applyTombstonesToCollection(hydratedSessions, hydratedTombstones, "session");
    walksRef.current = applyTombstonesToCollection(hydratedWalks, hydratedTombstones, "walk");
    patternsRef.current = applyTombstonesToCollection(hydratedPatterns, hydratedTombstones, "pattern");
    feedingsRef.current = applyTombstonesToCollection(hydratedFeedings, hydratedTombstones, "feeding");
    syncSnapshotRef.current = { ...syncSnapshotRef.current, tombstones: tombstonesRef.current, sessions: sessionsRef.current, walks: walksRef.current, patterns: patternsRef.current, feedings: feedingsRef.current };
    setTombstones(hydratedTombstones);
    setSessions(sessionsRef.current);
    setWalks(walksRef.current);
    setPatterns(patternsRef.current);
    setFeedings(feedingsRef.current);
    setPatLabels(local.patLabels);
    setDogPhoto(local.photo);
    recomputeTarget(sessionsRef.current, walksRef.current, patternsRef.current, dog);
    setScreen("app");
  }, [activeDogId, dogs, getSetupLandingScreen, recomputeTarget, withHydratedSyncState]);

  useEffect(() => {
    const savedId = load(ACTIVE_DOG_KEY, null);
    const savedDogs = ensureArray(load(DOGS_KEY, []));
    if (savedId && (SYNC_ENABLED || savedDogs.find((d) => canonicalDogId(d.id) === canonicalDogId(savedId)))) setActiveDogId(canonicalDogId(savedId));
    else setScreen(getSetupLandingScreen(savedDogs));
  }, [getSetupLandingScreen]);

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
    const runReminderCheck = () => { sendWorkerMessage({ type: "CHECK_NOTIF", source: "app-visible" }).catch(() => {}); };
    runReminderCheck();
    const onVisible = () => { if (document.visibilityState === "visible") runReminderCheck(); };
    window.addEventListener("focus", runReminderCheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", runReminderCheck); document.removeEventListener("visibilitychange", onVisible); };
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
    if (!normalizedId) return false;
    
    // Quick wipe out logic
    setSessions([]);
    setWalks([]);
    setPatterns([]);
    setFeedings([]);
    setTombstones([]);
    sessionsRef.current = [];
    walksRef.current = [];
    patternsRef.current = [];
    feedingsRef.current = [];
    tombstonesRef.current = [];
    syncSnapshotRef.current = { ...syncSnapshotRef.current, sessions: [], walks: [], patterns: [], feedings: [], tombstones: [] };
    setPatLabels({});
    setDogPhoto(null);
    return true;
  }, []);

  const openDog = (dog) => { logSyncDebug("openDog", { dogId: canonicalDogId(dog?.id) }); setOnboardingState(null); setActiveDogId(canonicalDogId(dog.id)); setScreen("app"); };

  const handleDogSelect = async (id, isJoin = false, options = {}) => {
    const normalizedId = canonicalDogId(id);
    const existing = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (existing) { openDog(existing); return { ok: true, normalizedId, dogName: existing?.dogName || "Shared dog profile" }; }
    setOnboardingState({ mode: "claim", dogId: normalizedId }); setActiveDogId(normalizedId); setScreen("onboard");
    return { ok: true, normalizedId };
  };

  const handleOnboardComplete = (data) => {
    const onboardingDogId = canonicalDogId(onboardingState?.dogId);
    const id = canonicalDogId(onboardingDogId || activeDogId || generateId(data.dogName));
    const previousDog = dogs.find((d) => canonicalDogId(d.id) === id) ?? null;
    const newDog = stampLocalDogSettings({ ...data, id, dogName: data.dogName, createdAt: new Date().toISOString() }, previousDog);
    setDogs((prev) => [...prev.filter((d) => canonicalDogId(d.id) !== id), newDog]);
    setOnboardingState(null); setActiveDogId(id); setTab("home");
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const runSyncDiagnostics = async () => {
    setSyncDiagRunning(true);
    try {
      const report = { checkedAt: new Date().toISOString(), env: { syncEnabled: SYNC_ENABLED, hasUrl: Boolean(SB_URL), hasAnonKey: Boolean(SB_KEY), normalizedUrl: SB_BASE_URL || "(missing)", urlLooksValid: /^https:\/\/[^\s]+\.supabase\.co$/i.test(SB_BASE_URL || "") }, checks: {} };
      report.checks.syncDegradation = getSyncDegradationState();
      setSyncDiagResult(report);
    } finally { setSyncDiagRunning(false); }
  };

  const {
    phase, setPhase, elapsed, setElapsed, finalElapsed, setFinalElapsed, sessionCompleted, sessionOutcome, setSessionOutcome,
    latencyDraft, setLatencyDraft, distressTypeDraft, setDistressTypeDraft, startSession, endSession, cancelSession, recordResult
  } = useTrainingTimer({
    target, appData, activeDogId, commitSessions, pushWithSyncStatus, deriveRecommendation, walks, patterns, stampLocalEntry, showToast, setTrainTimeChangeInsight, completeTrainFirstRunHint, acknowledgeReturningTrainNudge
  });

  const {
    walkPhase, walkElapsed, walkPendingDuration, startWalk, endWalk, saveWalkWithType, cancelWalk
  } = useWalkTimer({ activeDogId, activeDogName: appData.name, commitWalks, pushWithSyncStatus, stampLocalEntry, showToast });

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
  const copyDogId = async () => {
    if (!activeDogId) return;
    const writeToClipboard = async () => { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(activeDogId); return; } const el = document.createElement("textarea"); el.value = activeDogId; el.setAttribute("readonly", ""); el.style.position = "absolute"; el.style.left = "-9999px"; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); };
    writeToClipboard().then(() => showToast("Copied")).catch(() => showToast("Failed to copy"));
  };
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) { setDogPhoto(null); return; }
    compressImage(file, 400).then((base64) => setDogPhoto(base64)).catch(() => showToast("Failed to process image"));
  };

  const historyActions = useHistoryEditing({
    sessions, walks, patterns, feedings, patLabels, showToast, pushWithSyncStatus, pushTombstoneWithSyncStatus, addTombstone,
    commitSessions, setWalks: commitWalks, setPatterns: commitPatterns, setFeedings: commitFeedings, stampLocalEntry,
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

  const syncSummary = useMemo(() => computeSyncSummary({ syncEnabled: SYNC_ENABLED, sessions, walks, patterns, feedings, tombstones, syncStatus, syncError }), [feedings, patterns, sessions, syncError, syncStatus, tombstones, walks]);

  const CustomDot = ({ cx, cy, payload }) => {
    const c = getOutcomeTone(payload.distressLevel).color;
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2} />;
  };
  const handleTabChange = (nextTab) => {
    if (nextTab === tab) return;
    const currentIndex = TAB_IDS.indexOf(tab);
    const nextIndex = TAB_IDS.indexOf(nextTab);
    setTabMotionDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setTab(nextTab);
  };

  const appContextValue = {
    // Shared Data
    name: appData.name,
    sessions: canonicalSessions,
    recommendation: appData.recommendation,
    dogs,
    activeDogId,
    activeProto: appData.activeProto,
    pattern: appData.pattern,
    patLabels,
    patterns,
    feedings,
    walks,
    timeline: appData.timeline,
    dogPhoto,
    
    // Timer & Training States
    phase, elapsed, finalElapsed, sessionCompleted, sessionOutcome, latencyDraft, distressTypeDraft,
    setSessionOutcome, setLatencyDraft, setDistressTypeDraft, setPhase, setElapsed, setFinalElapsed,
    startSession, endSession, cancelSession, recordResult,
    
    // Walk States
    walkPhase, walkElapsed, walkPendingDuration, startWalk, cancelWalk, endWalk, saveWalkWithType,
    
    // Pattern & Feeding Forms
    patOpen, setPatOpen, logPattern, patReminderText: appData.patReminderText,
    feedingOpen, openFeedingForm, feedingDraft, setFeedingDraft, cancelFeedingForm, saveFeeding,
    
    // Nudges & Insights
    showTrainFirstRunHint: trainFirstRunHintVisible, dismissTrainFirstRunHint: completeTrainFirstRunHint,
    trainTimeChangeInsight, returningTrainNudge, dismissReturningTrainNudge: acknowledgeReturningTrainNudge,
    
    // History & Progress
    historyModal, setHistoryModal, actions: historyActions,
    totalCount: appData.totalCount, bestCalm: appData.bestCalm, relapseTone: appData.relapseTone, chartData: appData.chartData,
    goalSec: appData.goalSec, overallGoalSec: appData.dog?.goalSeconds, distressLabel: appData.distressLabel,
    chartTrendLabel: appData.chartTrendLabel, aloneLastWeek: appData.aloneLastWeek, avgWalkDuration: appData.avgWalkDuration,
    avgSessionsPerDay: appData.avgSessionsPerDay, avgWalksPerDay: appData.avgWalksPerDay, headlineStatus: appData.headlineStatus,
    headlineStatusTone: appData.headlineStatusTone, contextualInsights: appData.contextualInsights, streak: appData.streak, calmRate7: appData.calmRate7,
    
    // Settings & Actions
    copyDogId, notifEnabled, handleToggleNotif, notifTime, setNotifTime, scheduleNotif,
    setTrainingSettingsOpen, editingPat, setEditingPat, setPatLabels, settingsDisclosure, setSettingsDisclosure,
    syncDiagRunning, runSyncDiagnostics, SYNC_ENABLED, SB_URL, SB_KEY, SB_BASE_URL, syncDiagResult, syncSummary, syncDegradation,
    trainingSettingsOpen, setProtoWarnAck, protoWarnAck, protoOverride, setProtoOverride, setScreen, setOnboardingState,
    dogsState: dogs, setDogs, save, ACTIVE_DOG_KEY, setActiveDogId, clearDogActivityState, handlePhotoUpload,
    
    // UI actions
    openHistory: () => handleTabChange("history"),
    openProgress: () => handleTabChange("progress"),
    setTab,
    goalPct: appData.goalPct,
    daily: appData.daily,
    CustomDot,
  };


  if (screen === "welcome") return <>{toast && <div className="toast">{toast}</div>}<WelcomeScreen onStart={() => { setOnboardingState({ mode: "new", dogId: null }); setScreen("onboard"); }} onManageDogs={() => setScreen("select")} /></>;
  if (screen === "select") return <>{toast && <div className="toast">{toast}</div>}<DogSelect dogs={dogs} onSelect={handleDogSelect} onCreateNew={() => { setOnboardingState({ mode: "new", dogId: null }); setScreen("onboard"); }} /></>;
  if (screen === "onboard") return <Onboarding onComplete={handleOnboardComplete} onBack={() => { setOnboardingState(null); setScreen(getSetupLandingScreen(dogs)); }} />;

  return (
    <>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {needRefresh && (
        <div className="update-banner" role="status" aria-live="polite">
          <span>Update available</span>
          <button type="button" className="update-banner-btn" onClick={() => updateServiceWorker(true)}>Reload</button>
        </div>
      )}
      <AppContext.Provider value={appContextValue}>
        <div className="app">
          <div className={`tab-panel tab-panel--${tabMotionDirection}`} key={tab}>
            {tab === "home" && <HomeScreen />}
            {tab === "history" && <HistoryScreen />}
            {tab === "progress" && <StatsScreen />}
            {tab === "settings" && <SettingsScreen />}
          </div>
        </div>
        <div className="tabs">{[{ id: "home", label: "Train", icon: <HomeIcon /> }, { id: "history", label: "History", icon: <HistoryIcon /> }, { id: "progress", label: "Progress", icon: <ChartIcon /> }, { id: "settings", label: "Settings", icon: <SettingsIcon /> }].map((t) => <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => handleTabChange(t.id)}>{t.icon}{t.label}</button>)}</div>
      </AppContext.Provider>
    </>
  );
}
