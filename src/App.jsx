import { useCallback, useEffect, useRef, useState } from "react";
import { PROTOCOL, normalizeDistressLevel, suggestNext, suggestNextWithContext } from "./lib/protocol";
import { selectAppData } from "./features/app/selectors";
import { ACTIVE_DOG_KEY, DOGS_KEY, SB_BASE_URL, SB_KEY, SB_URL, SYNC_ENABLED, canonicalDogId, ensureArray, ensureObject, feedingKey, generateId, hydrateDogFromLocal, load, logSyncDebug, makeEntryId, mergeSessionWithDerivedFields, normalizeFeedings, normalizeSessions, photoKey, save, sessKey, syncDelete, syncDeleteSessionsForDog, syncFetch, syncPush, syncUpsertDog, toDateTimeLocalValue, walkKey, patKey, patLblKey } from "./features/app/storage";
import { DISTRESS_TYPES, fmt, isToday, normalizeWalkType, PATTERN_TYPES, walkTypeLabel } from "./features/app/helpers";
import { ChartIcon, HistoryIcon, HomeIcon, Img, PawIcon, SettingsIcon } from "./features/app/ui.jsx";
import { DogSelect, Onboarding } from "./features/setup/SetupScreens";
import HomeScreen from "./features/home/HomeScreen";
import StatsScreen from "./features/stats/StatsScreen";
import SettingsScreen from "./features/settings/SettingsScreen";
import { HistoryScreen, useHistoryEditing } from "./features/history/HistoryFeature";
import "./styles/theme.css";
import "./styles/shared.css";
import "./styles/app.css";

export default function PawTimer() {
  const [dogs, setDogs] = useState(() => ensureArray(load(DOGS_KEY, [])));
  const [activeDogId, setActiveDogId] = useState(() => canonicalDogId(load(ACTIVE_DOG_KEY, null)));
  const [screen, setScreen] = useState("select");
  const [sessions, setSessions] = useState([]);
  const [walks, setWalks] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [tab, setTab] = useState("home");
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
  const [showCoach, setShowCoach] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [openTip, setOpenTip] = useState(null);
  const [metricHelp, setMetricHelp] = useState(null);
  const [walkPhase, setWalkPhase] = useState("idle");
  const [walkElapsed, setWalkElapsed] = useState(0);
  const [walkPendingDuration, setWalkPendingDuration] = useState(0);
  const [feedingOpen, setFeedingOpen] = useState(false);
  const [feedingDraft, setFeedingDraft] = useState(() => ({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }));
  const [historyModal, setHistoryModal] = useState(null);

  const walkTimerRef = useRef(null);
  const walkStartRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);

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

  useEffect(() => {
    if (!activeDogId) { setScreen("select"); return; }
    const normalizedId = canonicalDogId(activeDogId);
    const dog = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (!dog) { setScreen("select"); return; }
    const local = hydrateDogFromLocal(normalizedId);
    setSessions(local.sessions);
    setWalks(local.walks);
    setPatterns(local.patterns);
    setFeedings(normalizeFeedings(local.feedings));
    setPatLabels(local.patLabels);
    setDogPhoto(local.photo);
    setTarget(suggestNextWithContext(local.sessions, local.walks, local.patterns, dog) ?? suggestNext(local.sessions, dog));
    setScreen("app");
  }, [activeDogId, dogs]);

  useEffect(() => {
    const savedId = load(ACTIVE_DOG_KEY, null);
    const savedDogs = ensureArray(load(DOGS_KEY, []));
    if (savedId && (SYNC_ENABLED || savedDogs.find((d) => canonicalDogId(d.id) === canonicalDogId(savedId)))) setActiveDogId(canonicalDogId(savedId));
    else setScreen("select");
  }, []);

  useEffect(() => {
    if (!activeDogId || !SYNC_ENABLED) { setSyncStatus("idle"); setSyncError(""); return; }
    let live = true;
    const sync = async () => {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(canonicalDogId(activeDogId));
      if (!live) return;
      if (!remote) { setSyncStatus("err"); setSyncError(error || "Unknown sync fetch error"); return; }
      if (remote.dog) {
        setDogs((prev) => {
          const mergedDog = { ...remote.dog, id: canonicalDogId(remote.dog.id || activeDogId) };
          const next = [...prev.filter((d) => canonicalDogId(d.id) !== mergedDog.id), mergedDog];
          save(DOGS_KEY, next);
          return next;
        });
      }
      const remoteSessions = normalizeSessions(remote.sessions);
      const remoteWalks = ensureArray(remote.walks);
      const remotePatterns = ensureArray(remote.patterns);
      let remoteFeedings = normalizeFeedings(remote.feedings);
      const localFeedings = normalizeFeedings(load(feedingKey(activeDogId), feedings));
      const missingRemoteFeedings = localFeedings.filter((localEntry) => !remoteFeedings.some((remoteEntry) => remoteEntry.id === localEntry.id));
      if (missingRemoteFeedings.length > 0) {
        const currentDog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
        const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
        for (const entry of missingRemoteFeedings) await syncPush(canonicalDogId(activeDogId), "feeding", entry, dogSettings);
      }
      const syncDog = remote.dog
        ? { ...remote.dog, id: canonicalDogId(remote.dog.id || activeDogId) }
        : dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
      setSessions(remoteSessions);
      setWalks(remoteWalks);
      setPatterns(remotePatterns);
      setFeedings(remoteFeedings);
      save(sessKey(activeDogId), remoteSessions);
      save(walkKey(activeDogId), remoteWalks);
      save(patKey(activeDogId), remotePatterns);
      save(feedingKey(activeDogId), remoteFeedings);
      setTarget(suggestNextWithContext(remoteSessions, remoteWalks, remotePatterns, syncDog) ?? suggestNext(remoteSessions, syncDog));
      setSyncError("");
      setSyncStatus("ok");
    };
    sync();
    const timer = setInterval(sync, 15_000);
    return () => { live = false; clearInterval(timer); };
  }, [activeDogId]);

  useEffect(() => {
    if (!SYNC_ENABLED || !activeDogId) return;
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    if (!dog) return;
    syncUpsertDog(dog).then(({ ok, error }) => {
      if (!ok) { setSyncStatus("err"); setSyncError(error || "Unable to sync dog settings"); }
    });
  }, [activeDogId, dogs]);

  useEffect(() => {
    if (screen === "app" && sessions.length === 0) {
      const seen = load("pawtimer_coach_seen", false);
      if (!seen) setTimeout(() => setShowCoach(true), 600);
    }
  }, [screen, sessions.length]);

  useEffect(() => {
    if (screen === "app" && sessions.length > 0) {
      const last = sessions[sessions.length - 1];
      const daysSince = (Date.now() - new Date(last.date)) / 86400000;
      if (daysSince >= 5) setShowWelcomeBack(true);
    }
  }, [screen, sessions]);

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

  const appData = selectAppData({ dogs, activeDogId, sessions, walks, patterns, feedings, target, protoOverride });
  const recomputeTarget = useCallback((nextSessions, nextWalks = walks, nextPatterns = patterns, nextDog = appData.dog) => {
    const nextTarget = suggestNextWithContext(nextSessions, nextWalks, nextPatterns, nextDog) ?? suggestNext(nextSessions, nextDog);
    setTarget(nextTarget);
    return nextTarget;
  }, [appData.dog, patterns, walks]);
  const commitSessions = useCallback((nextSessions) => {
    const normalized = normalizeSessions(nextSessions);
    setSessions(normalized);
    if (activeDogId) save(sessKey(activeDogId), normalized);
    recomputeTarget(normalized);
    return normalized;
  }, [activeDogId, recomputeTarget]);

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
  const cancelNotif = useCallback(async () => { const reg = await navigator.serviceWorker.ready.catch(() => null); reg?.active?.postMessage({ type: "CANCEL_NOTIF" }); }, []);
  const handleToggleNotif = async () => {
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogName = dog?.dogName ?? "your dog";
    if (!notifEnabled) {
      const ok = await scheduleNotif(notifTime, dogName);
      if (ok) { setNotifEnabled(true); showToast("🔔 Reminder set!"); } else showToast("⚠️ Notifications blocked — check browser settings");
    } else { cancelNotif(); setNotifEnabled(false); showToast("🔕 Reminder turned off"); }
  };

  const openDog = (dog) => { logSyncDebug("openDog", { dogId: canonicalDogId(dog?.id) }); setActiveDogId(canonicalDogId(dog.id)); setScreen("app"); };
  const handleDogSelect = async (id, isJoin = false) => {
    const normalizedId = canonicalDogId(id);
    if (isJoin && SYNC_ENABLED) {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(normalizedId);
      if (!remote?.dog) { setSyncStatus("err"); setSyncError(error || `No shared dog account found for ${normalizedId}`); showToast(`⚠️ No shared profile found for ${normalizedId} yet.`); return; }
      const sharedDog = { ...remote.dog, id: normalizedId };
      setDogs((prev) => [...prev.filter((d) => canonicalDogId(d.id) !== normalizedId), sharedDog]);
      setSessions(normalizeSessions(remote.sessions));
      setWalks(ensureArray(remote.walks));
      setPatterns(ensureArray(remote.patterns));
      setFeedings(normalizeFeedings(remote.feedings));
      if (error) { setSyncStatus("err"); setSyncError(error); showToast(`⚠️ Joined ${normalizedId}, but related history failed to load.`); }
      else { setSyncError(""); setSyncStatus("ok"); showToast(`✅ Joined shared profile ${normalizedId}.`); }
      openDog(sharedDog);
      return;
    }
    const existing = dogs.find((d) => canonicalDogId(d.id) === normalizedId) ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (existing) { openDog(existing); return; }
    if (isJoin) { setSyncStatus("err"); setSyncError(`No shared dog account found for ${normalizedId}`); showToast(`⚠️ No shared profile found for ${normalizedId}. Check the ID and try again.`); }
    else { setActiveDogId(normalizedId); setScreen("onboard"); }
  };
  const handleOnboardComplete = (data) => {
    const id = canonicalDogId(activeDogId || generateId(data.dogName));
    const newDog = { ...data, id, dogName: data.dogName, createdAt: new Date().toISOString() };
    setDogs((prev) => [...prev.filter((d) => d.id !== id), newDog]);
    setActiveDogId(id);
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const startSession = () => { setElapsed(0); setSessionCompleted(false); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); setPhase("running"); };
  const endSession = () => { clearInterval(timerRef.current); setFinalElapsed(elapsed); setPhase("rating"); };
  const cancelSession = () => { setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionCompleted(false); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); clearInterval(timerRef.current); };

  const pushWithSyncStatus = async (kind, data) => {
    if (!SYNC_ENABLED || !activeDogId) return { ok: false, error: "Sync is disabled" };
    const currentDog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    setSyncStatus("syncing");
    const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, data, dogSettings);
    if (ok) { setSyncError(""); setSyncStatus("ok"); return { ok: true, error: null }; }
    const message = error || "Push failed";
    setSyncError(message); setSyncStatus("err");
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
    const session = mergeSessionWithDerivedFields({}, { id: makeEntryId("sess", activeDogId), date: now.toISOString(), plannedDuration: target, actualDuration: finalElapsed, distressLevel, result: distressLevel === "none" ? "success" : "distress", belowThreshold: distressLevel === "none" && finalElapsed >= target, latencyToFirstDistress, distressType, distressSeverity: distressLevel, context: { timeOfDay, departureType: "training", cuesUsed: [], location: null, barrierUsed: null, enrichmentPresent: null, mediaOn: null, whoLeft: null, anotherPersonStayed: null }, symptoms: { barking: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, pacing: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, destructive: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0, salivation: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0 }, videoReview: { recorded: false, firstSubtleDistressTs: null, firstActiveDistressTs: null, eventTags: [], notes: null, ratingConfidence: null }, recoverySeconds: distressLevel === "none" ? 0 : null, preSession: { walkDuration: null, enrichmentGiven: null }, environment: { noiseEvent: false } });
    const updated = commitSessions([...sessions, session]);
    pushWithSyncStatus("session", session).then(({ ok, error }) => { if (!ok) showToast(`⚠️ Sync failed: ${error}`); });
    const next = suggestNextWithContext(updated, walks, patterns, dog) ?? suggestNext(updated, dog);
    cancelSession();
    const n = dog?.dogName ?? "your dog";
    if (distressLevel === "none") showToast(`✅ ${n} was calm! Next: ${fmt(next)}`);
    else if (distressLevel === "subtle") showToast(`⚠️ Subtle stress signs — holding at ${fmt(next)}`);
    else showToast(`❤️ Rolled back to ${fmt(next)}`);
  };

  const startWalk = () => { setWalkElapsed(0); setWalkPhase("timing"); };
  const endWalk = () => { clearInterval(walkTimerRef.current); setWalkPendingDuration(walkElapsed); setWalkPhase("classify"); };
  const saveWalkWithType = (walkType) => {
    const entry = { id: makeEntryId("walk", activeDogId), date: new Date().toISOString(), duration: walkPendingDuration, type: normalizeWalkType(walkType) };
    setWalks((prev) => [...prev, entry]);
    pushWithSyncStatus("walk", entry).then(({ ok, error }) => { if (!ok) showToast(`⚠️ Sync failed: ${error}`); });
    showToast(`🚶 ${walkTypeLabel(normalizeWalkType(walkType))} with ${appData.name} logged — ${fmt(walkPendingDuration)}!`);
    setWalkPhase("idle"); setWalkElapsed(0); setWalkPendingDuration(0);
  };
  const cancelWalk = () => { clearInterval(walkTimerRef.current); setWalkPhase("idle"); setWalkElapsed(0); setWalkPendingDuration(0); };
  const logPattern = (type) => {
    const entry = { id: makeEntryId("pat", activeDogId), date: new Date().toISOString(), type };
    setPatterns((prev) => [...prev, entry]);
    pushWithSyncStatus("pattern", entry).then(({ ok, error }) => { if (!ok) showToast(`⚠️ Sync failed: ${error}`); });
    showToast("✓ Pattern break logged!");
  };
  const openFeedingForm = () => { setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }); setFeedingOpen(true); };
  const cancelFeedingForm = () => { setFeedingOpen(false); setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }); };
  const saveFeeding = () => {
    const when = feedingDraft.time ? new Date(feedingDraft.time) : new Date();
    if (Number.isNaN(when.getTime())) { showToast("⚠️ Please enter a valid feeding time"); return; }
    const entry = { id: makeEntryId("feed", activeDogId), date: when.toISOString(), foodType: feedingDraft.foodType, amount: feedingDraft.amount };
    setFeedings((prev) => normalizeFeedings([...prev, entry]));
    pushWithSyncStatus("feeding", entry).then(({ ok, error }) => { if (!ok) showToast(`⚠️ Sync failed: ${error}`); });
    setFeedingOpen(false); showToast("🍽️ Feeding logged");
  };
  const copyDogId = () => { navigator.clipboard?.writeText(activeDogId).catch(() => {}); showToast(`📋 ID copied: ${activeDogId}`); };
  const handlePhotoUpload = (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => setDogPhoto(ev.target.result); reader.readAsDataURL(file); };

  const historyActions = useHistoryEditing({ sessions, walks, patterns, feedings, patLabels, showToast, pushWithSyncStatus, syncDelete, syncDeleteSessionsForDog, commitSessions, setWalks, setPatterns, setFeedings, recomputeTarget, activeDogId });

  const openMetricHelp = (metricKey) => { if (appData.metricExplainers[metricKey]) setMetricHelp(metricKey); };
  const CustomDot = ({ cx, cy, payload }) => {
    const c = payload.distressLevel === "none" ? "var(--green-dark)" : payload.distressLevel === "subtle" ? "var(--orange)" : payload.distressLevel === "active" ? "#d65f3c" : "var(--red)";
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2} />;
  };

  if (screen === "select") return <>{toast && <div className="toast">{toast}</div>}<DogSelect dogs={dogs} onSelect={handleDogSelect} onCreateNew={() => setScreen("onboard")} /></>;
  if (screen === "onboard") return <Onboarding onComplete={handleOnboardComplete} onBack={() => setScreen("select")} />;

  return (
    <>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {metricHelp && <div className="metric-help-overlay" role="dialog" aria-modal="true" aria-labelledby="metric-help-title" onClick={() => setMetricHelp(null)}><div className="metric-help-card" onClick={(e) => e.stopPropagation()}><div className="metric-help-title" id="metric-help-title">{appData.metricExplainers[metricHelp]?.title}</div><div className="metric-help-body">{appData.metricExplainers[metricHelp]?.body}</div>{appData.metricExplainers[metricHelp]?.detail && <div className="metric-help-detail">{appData.metricExplainers[metricHelp]?.detail}</div>}<button className="metric-help-close" onClick={() => setMetricHelp(null)} type="button">Got it</button></div></div>}
      {showCoach && <div className="coach-overlay" role="dialog" aria-modal="true" aria-labelledby="coach-title"><div className="coach-backdrop" onClick={() => { setShowCoach(false); save("pawtimer_coach_seen", true); }} /><div className="coach-tip" style={{ bottom: 220 }}><div className="coach-tip-arrow" /><div className="coach-title" id="coach-title">This is {appData.name}'s first session 🐾</div><div className="coach-body prose">Tap <strong>Start Session</strong> when you're ready to step out. We'll track the time and check in on how {appData.name} felt when you come back.</div><button className="coach-btn" onClick={() => { setShowCoach(false); save("pawtimer_coach_seen", true); }}>Got it — let's start</button></div></div>}

      <div className="app">
        <div className="header"><div className="header-top"><div className="identity-zone"><label className="dog-photo-btn" title="Tap to change photo"><input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />{dogPhoto ? <img src={dogPhoto} className="dog-photo-img" alt={appData.name} /> : <div className="dog-photo-placeholder"><PawIcon size={28} /></div>}<div className="dog-photo-overlay">📷</div></label><div className="identity-copy"><div className="app-title">{appData.name}</div><div className="app-subtitle">Separation anxiety training</div></div></div></div></div>

        {tab === "home" && <HomeScreen name={appData.name} sessions={sessions} target={target} goalPct={appData.goalPct} goalSec={appData.goalSec} phase={phase} elapsed={elapsed} finalElapsed={finalElapsed} sessionCompleted={sessionCompleted} sessionOutcome={sessionOutcome} setSessionOutcome={setSessionOutcome} recordResult={recordResult} latencyDraft={latencyDraft} setLatencyDraft={setLatencyDraft} distressTypeDraft={distressTypeDraft} setDistressTypeDraft={setDistressTypeDraft} setPhase={setPhase} setElapsed={setElapsed} setFinalElapsed={setFinalElapsed} startSession={startSession} endSession={endSession} cancelSession={cancelSession} showWelcomeBack={showWelcomeBack} setShowWelcomeBack={setShowWelcomeBack} activeProto={appData.activeProto} daily={appData.daily} recommendationConfidence={appData.recommendationConfidence} adjustedTarget={appData.adjustedTarget} pattern={appData.pattern} leaveProfile={appData.leaveProfile} openTip={openTip} setOpenTip={setOpenTip} walkPhase={walkPhase} startWalk={startWalk} cancelWalk={cancelWalk} walkElapsed={walkElapsed} endWalk={endWalk} walkPendingDuration={walkPendingDuration} saveWalkWithType={saveWalkWithType} patOpen={patOpen} setPatOpen={setPatOpen} patReminderText={appData.patReminderText} logPattern={logPattern} patLabels={patLabels} patterns={patterns} feedings={feedings} feedingOpen={feedingOpen} openFeedingForm={openFeedingForm} feedingDraft={feedingDraft} setFeedingDraft={setFeedingDraft} cancelFeedingForm={cancelFeedingForm} saveFeeding={saveFeeding} />}
        {tab === "history" && <HistoryScreen timeline={appData.timeline} sessions={sessions} name={appData.name} setTab={setTab} patLabels={patLabels} historyModal={historyModal} setHistoryModal={setHistoryModal} actions={historyActions} />}
        {tab === "progress" && <StatsScreen name={appData.name} totalCount={appData.totalCount} setTab={setTab} bestCalm={appData.bestCalm} target={target} relapseTone={appData.relapseTone} openMetricHelp={openMetricHelp} chartData={appData.chartData} goalSec={appData.goalSec} CustomDot={CustomDot} distressLabel={appData.distressLabel} chartTrendLabel={appData.chartTrendLabel} aloneLastWeek={appData.aloneLastWeek} avgWalkDuration={appData.avgWalkDuration} avgSessionsPerDay={appData.avgSessionsPerDay} avgWalksPerDay={appData.avgWalksPerDay} currentThreshold={appData.currentThreshold} headlineStatus={appData.headlineStatus} headlineStatusColor={appData.headlineStatusColor} />}
        {tab === "tips" && <SettingsScreen name={appData.name} activeDogId={activeDogId} copyDogId={copyDogId} notifEnabled={notifEnabled} handleToggleNotif={handleToggleNotif} notifTime={notifTime} setNotifTime={setNotifTime} scheduleNotif={scheduleNotif} dogs={dogs} activeProto={appData.activeProto} pattern={appData.pattern} setTrainingSettingsOpen={setTrainingSettingsOpen} patLabels={patLabels} editingPat={editingPat} setEditingPat={setEditingPat} setPatLabels={setPatLabels} settingsDisclosure={settingsDisclosure} setSettingsDisclosure={setSettingsDisclosure} syncDiagRunning={syncDiagRunning} runSyncDiagnostics={runSyncDiagnostics} SYNC_ENABLED={SYNC_ENABLED} SB_URL={SB_URL} SB_KEY={SB_KEY} SB_BASE_URL={SB_BASE_URL} syncDiagResult={syncDiagResult} nextTargetInfo={appData.nextTargetInfo} trainingSettingsOpen={trainingSettingsOpen} setProtoWarnAck={setProtoWarnAck} protoWarnAck={protoWarnAck} protoOverride={protoOverride} setProtoOverride={setProtoOverride} setScreen={setScreen} dogsState={dogs} setDogs={setDogs} save={save} ACTIVE_DOG_KEY={ACTIVE_DOG_KEY} setActiveDogId={setActiveDogId} />}
      </div>

      <div className="tabs">{[{ id: "home", label: "Train", icon: <HomeIcon /> }, { id: "history", label: "History", icon: <HistoryIcon /> }, { id: "progress", label: "Stats", icon: <ChartIcon /> }, { id: "tips", label: "Settings", icon: <SettingsIcon /> }].map((t) => <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.icon}{t.label}</button>)}</div>
    </>
  );
}
