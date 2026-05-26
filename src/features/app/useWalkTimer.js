import { useState, useRef, useEffect } from "react";
import { makeEntryId } from "./storage";
import { normalizeWalkType, walkTypeLabel, fmt } from "./helpers";

export function useWalkTimer({ activeDogId, activeDogName, commitWalks, pushWithSyncStatus, stampLocalEntry, showToast }) {
  const [walkPhase, setWalkPhase] = useState("idle");
  const [walkElapsed, setWalkElapsed] = useState(0);
  const [walkPendingDuration, setWalkPendingDuration] = useState(0);

  const walkTimerRef = useRef(null);
  const walkStartRef = useRef(null);

  useEffect(() => {
    if (walkPhase === "timing") {
      walkStartRef.current = Date.now() - walkElapsed * 1000;
      walkTimerRef.current = setInterval(() => setWalkElapsed(Math.floor((Date.now() - walkStartRef.current) / 1000)), 500);
    } else {
      clearInterval(walkTimerRef.current);
    }
    return () => clearInterval(walkTimerRef.current);
  }, [walkPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startWalk = () => { setWalkElapsed(0); setWalkPhase("timing"); };
  
  const endWalk = () => { 
    clearInterval(walkTimerRef.current); 
    setWalkPendingDuration(walkElapsed); 
    setWalkPhase("classify"); 
  };
  
  const saveWalkWithType = (walkType) => {
    const entry = stampLocalEntry({ 
      id: makeEntryId("walk", activeDogId), 
      date: new Date().toISOString(), 
      duration: walkPendingDuration, 
      type: normalizeWalkType(walkType) 
    });
    commitWalks((prev) => [...prev, entry]);
    pushWithSyncStatus("walk", entry).then(({ ok, error }) => { 
      if (!ok) showToast(`Sync failed: ${error}`); 
    });
    showToast(`${walkTypeLabel(normalizeWalkType(walkType))} with ${activeDogName} logged — ${fmt(walkPendingDuration)}.`);
    setWalkPhase("idle"); 
    setWalkElapsed(0); 
    setWalkPendingDuration(0);
  };
  
  const cancelWalk = () => { 
    clearInterval(walkTimerRef.current); 
    setWalkPhase("idle"); 
    setWalkElapsed(0); 
    setWalkPendingDuration(0); 
  };

  return {
    walkPhase,
    walkElapsed,
    walkPendingDuration,
    startWalk,
    endWalk,
    saveWalkWithType,
    cancelWalk
  };
}
