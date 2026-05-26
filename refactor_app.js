import fs from 'fs';

let content = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Imports
content = content.replace(
  'import { selectAppData } from "./features/app/selectors";',
  'import { selectAppData } from "./features/app/selectors";\nimport { useAppData } from "./features/app/useAppData";\nimport { useSyncEngine } from "./features/app/useSyncEngine";\nimport { useTrainingTimer } from "./features/app/useTrainingTimer";\nimport { useWalkTimer } from "./features/app/useWalkTimer";'
);

// 2. Remove state declarations that moved to useAppData
content = content.replace(/const \[dogs, setDogs\].*?\n/g, '');
content = content.replace(/const \[activeDogId, setActiveDogId\].*?\n/g, '');
content = content.replace(/const \[sessions, setSessions\].*?\n/g, '');
content = content.replace(/const \[walks, setWalks\].*?\n/g, '');
content = content.replace(/const \[patterns, setPatterns\].*?\n/g, '');
content = content.replace(/const \[feedings, setFeedings\].*?\n/g, '');
content = content.replace(/const \[tombstones, setTombstones\].*?\n/g, '');
content = content.replace(/const \[patLabels, setPatLabels\].*?\n/g, '');
content = content.replace(/const \[dogPhoto, setDogPhoto\].*?\n/g, '');
content = content.replace(/const \[syncStatus, setSyncStatus\].*?\n/g, '');
content = content.replace(/const \[syncError, setSyncError\].*?\n/g, '');
content = content.replace(/const \[syncDegradation, setSyncDegradation\].*?\n/g, '');

// 3. Remove timer states that moved
content = content.replace(/const \[phase, setPhase\].*?\n/g, '');
content = content.replace(/const \[elapsed, setElapsed\].*?\n/g, '');
content = content.replace(/const \[finalElapsed, setFinalElapsed\].*?\n/g, '');
content = content.replace(/const \[sessionCompleted, setSessionCompleted\].*?\n/g, '');
content = content.replace(/const \[sessionOutcome, setSessionOutcome\].*?\n/g, '');
content = content.replace(/const \[latencyDraft, setLatencyDraft\].*?\n/g, '');
content = content.replace(/const \[distressTypeDraft, setDistressTypeDraft\].*?\n/g, '');

// 4. Remove walk states that moved
content = content.replace(/const \[walkPhase, setWalkPhase\].*?\n/g, '');
content = content.replace(/const \[walkElapsed, setWalkElapsed\].*?\n/g, '');
content = content.replace(/const \[walkPendingDuration, setWalkPendingDuration\].*?\n/g, '');

// 5. Inject useAppData and timers
const appDataInjection = `
  const {
    dogs, setDogs, activeDogId, setActiveDogId,
    sessions, walks, patterns, feedings, tombstones, patLabels, setPatLabels, dogPhoto, setDogPhoto,
    sessionsRef, walksRef, patternsRef, feedingsRef, tombstonesRef, syncSnapshotRef,
    setSessions, setWalks, setPatterns, setFeedings, setTombstones,
    commitSessions, commitWalks, commitPatterns, commitFeedings, commitTombstones,
    addTombstone, updateSyncState,
    syncStatus, setSyncStatus, syncError, setSyncError,
    reportLocalWriteFailure, withHydratedSyncState
  } = useAppData({
    recomputeTarget: (s, w, p, d) => recomputeTarget(s, w, p, d),
    logSyncDebug
  });

  const {
    syncDegradation
  } = useSyncEngine({
    SYNC_ENABLED, activeDogId, syncSnapshotRef, syncHelpersRef, tombstonesRef, reportLocalWriteFailure,
    setDogs, setTombstoneSyncState: updateSyncState, withHydratedSyncState, markRemoteEntryConfirmed, commitTombstones, logSyncDebug
  });

  const {
    phase, setPhase, elapsed, setElapsed, finalElapsed, setFinalElapsed,
    sessionCompleted, sessionOutcome, setSessionOutcome,
    latencyDraft, setLatencyDraft, distressTypeDraft, setDistressTypeDraft,
    startSession, endSession, cancelSession, recordResult
  } = useTrainingTimer({
    target, appData, activeDogId, commitSessions, pushWithSyncStatus, deriveRecommendation, walks, patterns, stampLocalEntry, showToast, setTrainTimeChangeInsight, completeTrainFirstRunHint, acknowledgeReturningTrainNudge
  });

  const {
    walkPhase, walkElapsed, walkPendingDuration, startWalk, endWalk, saveWalkWithType, cancelWalk
  } = useWalkTimer({
    activeDogId, activeDogName: appData.name, commitWalks, pushWithSyncStatus, stampLocalEntry, showToast
  });
`;

content = content.replace('const [tab, setTab] = useState("home");', appDataInjection + '\n  const [tab, setTab] = useState("home");');

// We have safely extracted the hooks. Now we need to remove the massive old logic in App.jsx.
// Because it's too complex to regex properly, we will just save what we have. It will duplicate some logic, but wait, if it duplicates, JS won't compile because `const commitSessions` will be redefined.

// Instead of full string replace in node, I will just output the script to do nothing for now, as I realized regex replacement of 300 line chunks is extremely fragile.
console.log("Script skipped. Better to use replace_file_content with chunks.");
