import { useState, useRef, useEffect, useCallback } from "react";
import { makeEntryId } from "./storage";
import { normalizeDistressLevel } from "../../lib/protocol";
import { mergeSessionWithDerivedFields } from "./storage";
import { buildTrainTimeChangeInsight } from "../train/timeChangeInsight";
import { fmt } from "./helpers";

export function useTrainingTimer({ 
  target, 
  appData, 
  activeDogId, 
  commitSessions, 
  pushWithSyncStatus, 
  deriveRecommendation, 
  walks, 
  patterns, 
  stampLocalEntry, 
  showToast,
  setTrainTimeChangeInsight,
  completeTrainFirstRunHint,
  acknowledgeReturningTrainNudge
}) {
  const [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionOutcome, setSessionOutcome] = useState(null);
  const [latencyDraft, setLatencyDraft] = useState("");
  const [distressTypeDraft, setDistressTypeDraft] = useState("");

  const timerRef = useRef(null);
  const startRef = useRef(null);

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
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = useCallback(() => {
    if (!appData.daily.canAdd) {
      if (appData.daily.blockReason === "cap") showToast(`Daily alone-time cap reached (${appData.daily.capSec}s).`);
      else if (appData.daily.blockReason === "max_sessions") showToast(`Daily session max reached (${appData.daily.maxCount}).`);
      return;
    }
    completeTrainFirstRunHint?.();
    acknowledgeReturningTrainNudge?.();
    setTrainTimeChangeInsight?.(null);
    setElapsed(0); 
    setSessionCompleted(false); 
    setSessionOutcome(null); 
    setLatencyDraft(""); 
    setDistressTypeDraft(""); 
    setPhase("running");
  }, [appData.daily, completeTrainFirstRunHint, acknowledgeReturningTrainNudge, setTrainTimeChangeInsight, showToast]);

  const endSession = useCallback(() => { 
    clearInterval(timerRef.current); 
    setFinalElapsed(elapsed); 
    setPhase("rating"); 
  }, [elapsed]);

  const cancelSession = useCallback(() => { 
    setPhase("idle"); 
    setElapsed(0); 
    setFinalElapsed(0); 
    setSessionCompleted(false); 
    setSessionOutcome(null); 
    setLatencyDraft(""); 
    setDistressTypeDraft(""); 
    clearInterval(timerRef.current); 
  }, []);

  const recordResult = useCallback((distressLevelInput, options = {}) => {
    const distressLevel = normalizeDistressLevel(distressLevelInput);
    const dog = appData.dog;
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const latencyInput = Number(options.latencyToFirstDistress);
    const latencyToFirstDistress = Number.isFinite(latencyInput) && latencyInput >= 0 ? Math.round(latencyInput) : distressLevel === "none" ? finalElapsed : null;
    const distressType = options.distressType || (distressLevel === "none" ? "none" : null);
    
    const rawSession = mergeSessionWithDerivedFields({}, { 
      id: makeEntryId("sess", activeDogId), 
      date: now.toISOString(), 
      plannedDuration: target, 
      actualDuration: finalElapsed, 
      distressLevel, 
      result: distressLevel === "none" ? "success" : "distress", 
      latencyToFirstDistress, 
      distressType, 
      distressSeverity: distressLevel, 
      context: { timeOfDay, departureType: "training", cuesUsed: [], location: null, barrierUsed: null, enrichmentPresent: null, mediaOn: null, whoLeft: null, anotherPersonStayed: null }, 
      symptoms: { barking: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, pacing: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0, destructive: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0, salivation: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0 }, 
      videoReview: { recorded: false, firstSubtleDistressTs: null, firstActiveDistressTs: null, eventTags: [], notes: null, ratingConfidence: null }, 
      recoverySeconds: distressLevel === "none" ? 0 : null, 
      preSession: { walkDuration: null, enrichmentGiven: null }, 
      environment: { noiseEvent: false } 
    });
    
    const session = stampLocalEntry(rawSession);
    const updated = commitSessions((prev) => [...prev, session]);
    pushWithSyncStatus("session", session).then(({ ok, error }) => { if (!ok) showToast(`Sync failed: ${error}`); });
    
    const nextRecommendation = deriveRecommendation(updated, walks, patterns, dog);
    const next = nextRecommendation.duration;
    const timeChangeInsight = buildTrainTimeChangeInsight({
      previousDuration: target,
      recommendedDuration: next,
      recommendationType: nextRecommendation?.details?.recommendationType,
      distressLevel,
      dogName: dog?.dogName,
    });
    setTrainTimeChangeInsight?.(timeChangeInsight);
    cancelSession();
    
    const n = dog?.dogName ?? "your dog";
    if (distressLevel === "none") showToast(`${n} was calm. Next: ${fmt(next)}`);
    else if (distressLevel === "subtle") showToast(`Subtle stress signs — holding at ${fmt(next)}`);
    else showToast(`Rolled back to ${fmt(next)}`);
  }, [activeDogId, appData.dog, cancelSession, commitSessions, deriveRecommendation, finalElapsed, patterns, pushWithSyncStatus, setTrainTimeChangeInsight, showToast, stampLocalEntry, target, walks]);

  return {
    phase,
    setPhase,
    elapsed,
    setElapsed,
    finalElapsed,
    setFinalElapsed,
    sessionCompleted,
    sessionOutcome,
    setSessionOutcome,
    latencyDraft,
    setLatencyDraft,
    distressTypeDraft,
    setDistressTypeDraft,
    startSession,
    endSession,
    cancelSession,
    recordResult
  };
}
