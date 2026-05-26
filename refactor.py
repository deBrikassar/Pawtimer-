import re

with open('src/App.jsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { selectAppData } from "./features/app/selectors";',
    'import { selectAppData } from "./features/app/selectors";\nimport { useAppData } from "./features/app/useAppData";\nimport { useSyncEngine } from "./features/app/useSyncEngine";\nimport { useTrainingTimer } from "./features/app/useTrainingTimer";\nimport { useWalkTimer } from "./features/app/useWalkTimer";'
)

# Replace missing imports
content = content.replace('makeEntryId, ', 'makeEntryId, stampLocalEntry, markRemoteEntryConfirmed, ')

# 2. State hooks removal
content = re.sub(r'  const \[dogs, setDogs\] = useState\(\(\) => ensureArray\(load\(DOGS_KEY, \[\]\)\)\);\n', '', content)
content = re.sub(r'  const \[activeDogId, setActiveDogId\] = useState\(\(\) => canonicalDogId\(load\(ACTIVE_DOG_KEY, null\)\)\);\n', '', content)
content = re.sub(r'  const \[sessions, setSessions\].*?\n', '', content)
content = re.sub(r'  const \[walks, setWalks\].*?\n', '', content)
content = re.sub(r'  const \[patterns, setPatterns\].*?\n', '', content)
content = re.sub(r'  const \[feedings, setFeedings\].*?\n', '', content)
content = re.sub(r'  const \[tombstones, setTombstones\].*?\n', '', content)
content = re.sub(r'  const \[patLabels, setPatLabels\].*?\n', '', content)
content = re.sub(r'  const \[dogPhoto, setDogPhoto\].*?\n', '', content)
content = re.sub(r'  const \[syncStatus, setSyncStatus\].*?\n', '', content)
content = re.sub(r'  const \[syncError, setSyncError\].*?\n', '', content)
content = re.sub(r'  const \[syncDegradation, setSyncDegradation\].*?\n', '', content)
content = re.sub(r'  const \[phase, setPhase\].*?\n', '', content)
content = re.sub(r'  const \[elapsed, setElapsed\].*?\n', '', content)
content = re.sub(r'  const \[finalElapsed, setFinalElapsed\].*?\n', '', content)
content = re.sub(r'  const \[sessionCompleted, setSessionCompleted\].*?\n', '', content)
content = re.sub(r'  const \[sessionOutcome, setSessionOutcome\].*?\n', '', content)
content = re.sub(r'  const \[latencyDraft, setLatencyDraft\].*?\n', '', content)
content = re.sub(r'  const \[distressTypeDraft, setDistressTypeDraft\].*?\n', '', content)
content = re.sub(r'  const \[walkPhase, setWalkPhase\].*?\n', '', content)
content = re.sub(r'  const \[walkElapsed, setWalkElapsed\].*?\n', '', content)
content = re.sub(r'  const \[walkPendingDuration, setWalkPendingDuration\].*?\n', '', content)

# 3. Hook calls injection
injection = """
  const getSetupLandingScreen = useCallback((nextDogs = dogs) => (ensureArray(nextDogs).length > 0 ? "select" : "welcome"), [dogs]);

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

  const {
    phase, setPhase, elapsed, setElapsed, finalElapsed, setFinalElapsed,
    sessionCompleted, sessionOutcome, setSessionOutcome,
    latencyDraft, setLatencyDraft, distressTypeDraft, setDistressTypeDraft,
    startSession, endSession, cancelSession, recordResult
  } = useTrainingTimer({
    target, appData, activeDogId, commitSessions, pushWithSyncStatus, deriveRecommendation, walks, patterns, stampLocalEntry, showToast, setTrainTimeChangeInsight
  });

  const {
    walkPhase, walkElapsed, walkPendingDuration, startWalk, endWalk, saveWalkWithType, cancelWalk
  } = useWalkTimer({
    activeDogId, activeDogName: appData.name, commitWalks, pushWithSyncStatus, stampLocalEntry, showToast
  });

"""

# Find getSetupLandingScreen and replace it + everything up to activeDog definition, but be careful.
# The safest way is to use regex to wipe out the giant blocks and inject the hooks right after the useState section.

# Delete the old getSetupLandingScreen line
content = re.sub(r'  const getSetupLandingScreen = useCallback.*?\n', '', content)

content = content.replace('  const [historyModal, setHistoryModal] = useState(null);\n', '  const [historyModal, setHistoryModal] = useState(null);\n' + injection)

# 4. Wipe out lines from walkTimerRef up to the end of syncSnapshotRef effects
import re
content = re.sub(r'  const walkTimerRef = useRef\(null\);.*?  useEffect\(\(\) => \{ save\("pawtimer_proto_override", protoOverride\); \}, \[protoOverride\]\);\n', '', content, flags=re.DOTALL)

# 5. Wipe out old `deriveRecommendation` down to `setEntrySyncState` (including the massive commit methods)
content = re.sub(r'  const activeDog = useMemo\(.*?  useEffect\(\(\) => \{\n    syncHelpersRef\.current = \{\n      commitSessions,\n      commitWalks,\n      commitPatterns,\n      commitFeedings,\n      recomputeTarget,\n      setEntrySyncState,\n    \};\n  \}, \[commitFeedings, commitPatterns, commitSessions, commitWalks, recomputeTarget, setEntrySyncState\]\);\n', 
"""  const trainFirstRunHintKey = useMemo(() => (activeDogId ? `pawtimer_train_intro_seen_v1_${canonicalDogId(activeDogId)}` : null), [activeDogId]);
  const trainReturnSnapshotKey = useMemo(() => (activeDogId ? `pawtimer_train_last_seen_v1_${canonicalDogId(activeDogId)}` : null), [activeDogId]);

  useEffect(() => {
    syncHelpersRef.current = {
      commitSessions, commitWalks, commitPatterns, commitFeedings, recomputeTarget, setEntrySyncState,
    };
  }, [commitFeedings, commitPatterns, commitSessions, commitWalks, recomputeTarget, setEntrySyncState]);
""", content, flags=re.DOTALL)

# 6. Wipe out old hydrateDogFromLocal (lines 509-553) which is effectively lines starting with `useEffect(() => {\n    if (!activeDogId) { setScreen(getSetupLandingScreen(dogs)); return; }`
content = re.sub(r'  useEffect\(\(\) => \{\n    if \(\!activeDogId\) \{ setScreen\(getSetupLandingScreen\(dogs\)\); return; \}\n.*?  \}, \[activeDogId, dogs, getSetupLandingScreen, recomputeTarget, withHydratedSyncState\]\);\n', 
"""  useEffect(() => {
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
""", content, flags=re.DOTALL)

# 7. Wipe out sync engine useEffect
content = re.sub(r'  useEffect\(\(\) => \{\n    if \(\!activeDogId \|\| \!SYNC_ENABLED\) \{ setSyncStatus\("idle"\); setSyncError\(""\); return; \}\n.*?  \}, \[activeDogId, SYNC_ENABLED, syncSnapshotRef\]\); // eslint-disable-line react-hooks/exhaustive-deps\n', '', content, flags=re.DOTALL)

# 8. Wipe out timer intervals and push functions
content = re.sub(r'  useEffect\(\(\) => \{\n    if \(phase \!\=\= "running"\) \{ setSessionCompleted\(false\); return; \}\n.*?  const cancelWalk = \(\) => \{ clearInterval\(walkTimerRef\.current\); setWalkPhase\("idle"\); setWalkElapsed\(0\); setWalkPendingDuration\(0\); \};\n', '', content, flags=re.DOTALL)

# Also remove showToast which was replaced
content = re.sub(r'  const showToast = useCallback\(\(msg\) => \{\n    setToast\(msg\);\n    setTimeout\(\(\) => setToast\(null\), 3200\);\n  \}, \[\]\);\n', '', content, flags=re.DOTALL)

with open('src/App.new.jsx', 'w') as f:
    f.write(content)
