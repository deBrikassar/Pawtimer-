export const PROTOCOL = {
  sessionsPerDayDefault: 1,
  sessionsPerDayMax: 5,
  trainingDaysPerWeekDefault: 5,
  restDaysPerWeekMin: 1,
  restDaysPerWeekRecommended: 2,
  startDurationSeconds: 30,
  minDurationSeconds: 30,
  goalDurationDefaultSeconds: 7200,
  subtleRecoveryDurationSeconds: 60,
  subtleRecoverySessionCount: 2,
  subtleRecoveryAnchorClosureCalmSessions: 3,
  subtleRecoveryAnchorMaxAgeDays: 7,
  stabilizationDistressThreshold: 2,
  stabilizationWindow: 6,
  calmWindow: 8,
  confidenceSessionWindow: 10,
  easySessionRatio: 0.8,
  easySessionFrequency: 4,
  minPauseBetweenBlocksMinutes: 30,
  adherenceTargetGapDays: 1,
  largeStepStabilityGate: 0.82,
  maxDailyAloneMinutes: 30,
  desensitizationBlocksPerDayRecommendedMin: 3,
  desensitizationBlocksPerDayRecommendedMax: 5,
  desensitizationBlocksPerDayMax: 12,
  cuesPerBlockMin: 2,
  cuesPerBlockMax: 5,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clamp01 = (v) => clamp(v, 0, 1);

const severityWeight = {
  none: 0,
  subtle: 0.35,
  passive: 0.35,
  mild: 0.35,
  active: 0.75,
  strong: 0.75,
  severe: 1,
  panic: 1,
};

const typeBySeverity = {
  none: "none",
  subtle: "passive",
  passive: "passive",
  mild: "passive",
  active: "active",
  strong: "active",
  severe: "severe",
  panic: "severe",
};

export const DISTRESS_LEVELS = {
  NONE: "none",
  SUBTLE: "subtle",
  ACTIVE: "active",
  SEVERE: "severe",
};

export const DISTRESS_CATEGORIES = ["none", "subtle", "active", "severe"];

export function normalizeDistressLevel(level) {
  if (!level) return DISTRESS_LEVELS.NONE;
  const normalized = String(level).toLowerCase();
  if (normalized in severityWeight) {
    return normalized === "mild"
      ? DISTRESS_LEVELS.SUBTLE
      : normalized === "strong"
        ? DISTRESS_LEVELS.ACTIVE
        : normalized === "panic"
          ? DISTRESS_LEVELS.SEVERE
          : normalized;
  }
  return DISTRESS_LEVELS.NONE;
}

function toTimestamp(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isWithinDays(iso, days, nowTime) {
  const value = toTimestamp(iso);
  if (!Number.isFinite(value)) return false;
  return value >= nowTime - ((days - 1) * DAY_MS);
}

function getSeverity(level) {
  return severityWeight[normalizeDistressLevel(level)] ?? 0;
}

function getDistressType(level, explicitType) {
  if (explicitType) return explicitType;
  return typeBySeverity[normalizeDistressLevel(level)] ?? "none";
}

function ratio(actual, planned) {
  const p = Number(planned) || 0;
  if (p <= 0) return 0;
  return clamp01((Number(actual) || 0) / p);
}

function getLatestSessions(sessions, count) {
  if (!Array.isArray(sessions)) return [];
  return sessions.slice(-count);
}

function sortByDateAsc(sessions = []) {
  return [...sessions].sort((a, b) => {
    const timeA = toTimestamp(a?.date);
    const timeB = toTimestamp(b?.date);
    if (timeA == null && timeB == null) return 0;
    if (timeA == null) return -1;
    if (timeB == null) return 1;
    return timeA - timeB;
  });
}

function countStreak(items, predicate) {
  let streak = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!predicate(items[i])) break;
    streak += 1;
  }
  return streak;
}

export function getDistressCounts(sessions = []) {
  return sessions.reduce((counts, session) => {
    const level = normalizeDistressLevel(session?.distressLevel);
    if (level === DISTRESS_LEVELS.SUBTLE) counts.subtle += 1;
    else if (level === DISTRESS_LEVELS.ACTIVE) counts.active += 1;
    else if (level === DISTRESS_LEVELS.SEVERE) counts.severe += 1;
    else counts.none += 1;
    return counts;
  }, {
    none: 0,
    subtle: 0,
    active: 0,
    severe: 0,
  });
}

export function getCalmStreak(sessions = []) {
  return countStreak(sessions, (session) => normalizeDistressLevel(session?.distressLevel) === DISTRESS_LEVELS.NONE);
}

export function getRecentHighDistressSummary(sessions = [], window = PROTOCOL.stabilizationWindow) {
  const recentSessions = getLatestSessions(sessions, window).map(toRichSession);
  const severeCount = recentSessions.filter((session) => session.distressLevel === DISTRESS_LEVELS.SEVERE).length;
  const highDistressCount = recentSessions.filter((session) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(session.distressLevel)).length;
  return {
    window,
    recentSessions,
    severeCount,
    highDistressCount,
    relapseRisk: highDistressCount >= 2,
  };
}

function gapPenalty(sessions = [], now = new Date()) {
  if (!sessions.length) return 0.4;
  const last = sessions[sessions.length - 1];
  const lastTime = toTimestamp(last.date) ?? now.getTime();
  const days = (now.getTime() - lastTime) / DAY_MS;
  if (days <= 1.5) return 0;
  if (days <= 3.5) return 0.12;
  if (days <= 6.5) return 0.24;
  return 0.38;
}

function confidenceFromSession(session = {}) {
  const selfReported = Number(session.ratingConfidence ?? session.videoReview?.ratingConfidence);
  if (Number.isFinite(selfReported)) return clamp01(selfReported);
  if (session.videoReview?.recorded === true) return 0.85;
  return 0.65;
}

function pickFinite(session = {}, keys = []) {
  for (const key of keys) {
    const value = Number(session?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function resolveDurationSeconds(session = {}, config = {}) {
  const {
    secondsKeys = [],
    canonicalKeys = [],
    minutesKeys = [],
    ambiguousKeys = [],
  } = config;

  const explicitSeconds = pickFinite(session, secondsKeys);
  if (explicitSeconds != null) return Math.max(0, Math.round(explicitSeconds));

  const canonical = pickFinite(session, canonicalKeys);
  if (canonical != null) return Math.max(0, Math.round(canonical));

  const explicitMinutes = pickFinite(session, minutesKeys);
  if (explicitMinutes != null) return Math.max(0, Math.round(explicitMinutes * 60));

  const ambiguous = pickFinite(session, ambiguousKeys);
  if (ambiguous != null) return Math.max(0, Math.round(ambiguous));

  return null;
}

function toRichSession(session = {}) {
  const planned = Math.max(PROTOCOL.minDurationSeconds, resolveDurationSeconds(session, {
    secondsKeys: ["plannedDurationSeconds", "planned_duration_seconds", "targetDurationSeconds", "target_duration_seconds"],
    canonicalKeys: ["plannedDuration", "planned_duration", "targetDuration", "target_duration"],
    minutesKeys: ["plannedDurationMinutes", "planned_duration_minutes", "targetDurationMinutes", "target_duration_minutes"],
  }) ?? PROTOCOL.startDurationSeconds);
  const actual = resolveDurationSeconds(session, {
    secondsKeys: ["actualDurationSeconds", "actual_duration_seconds", "durationSeconds", "duration_seconds", "completedDurationSeconds", "completed_duration_seconds"],
    canonicalKeys: ["actualDuration", "actual_duration"],
    minutesKeys: ["actualDurationMinutes", "actual_duration_minutes", "durationMinutes", "duration_minutes", "completedDurationMinutes", "completed_duration_minutes"],
    ambiguousKeys: ["duration", "value"],
  }) ?? 0;
  const level = normalizeDistressLevel(
    session.distressLevel
    || session.distress_level
    || session.distressSeverity
    || session.distress_severity,
  );
  const distressType = getDistressType(level, session.distressType);
  const latency = Number.isFinite(session.latencyToFirstDistress)
    ? Math.max(0, Number(session.latencyToFirstDistress))
    : level === DISTRESS_LEVELS.NONE
      ? actual
      : Math.min(actual, planned);
  const belowThreshold = Boolean(
    session.belowThreshold
    ?? session.below_threshold
    ?? session.stayedBelowThreshold
    ?? (level === DISTRESS_LEVELS.NONE && ratio(actual, planned) >= 0.98),
  );

  const departureType = session?.context?.departureType
    || session?.context?.departure_type
    || "training";

  return {
    ...session,
    plannedDuration: planned,
    actualDuration: actual,
    distressLevel: level,
    distressType,
    distressSeverity: level,
    latencyToFirstDistress: latency,
    belowThreshold,
    departureType,
    confidence: confidenceFromSession(session),
  };
}

function classifyWindow(sessions = []) {
  const rich = sessions.map(toRichSession);
  const counts = {
    none: 0,
    subtle: 0,
    active: 0,
    severe: 0,
  };
  rich.forEach((session) => {
    const level = session.distressLevel;
    if (level === DISTRESS_LEVELS.NONE) counts.none += 1;
    else if (level === DISTRESS_LEVELS.SUBTLE) counts.subtle += 1;
    else if (level === DISTRESS_LEVELS.ACTIVE) counts.active += 1;
    else counts.severe += 1;
  });
  return { rich, counts };
}

function computeSafeAloneTime(sessions = []) {
  const sorted = sortByDateAsc(sessions).map(toRichSession);
  const nowTime = Date.now();
  const recentWindow = getLatestSessions(sorted, PROTOCOL.confidenceSessionWindow);
  const calmBelowThreshold = recentWindow
    .filter((s) => s.belowThreshold)
    .map((s) => {
      const ageDays = Math.max(0, (nowTime - (toTimestamp(s.date) ?? nowTime)) / DAY_MS);
      let recencyWeight = 0.1;
      if (ageDays <= 1) recencyWeight = 1;
      else if (ageDays <= 3) recencyWeight = 0.7;
      else if (ageDays <= 7) recencyWeight = 0.4;

      return {
        ...s,
        recencyWeight,
      };
    });

  const calm = calmBelowThreshold.length
    ? calmBelowThreshold
    : recentWindow
      .filter((s) => s.distressLevel === DISTRESS_LEVELS.NONE)
      .map((s) => {
        const ageDays = Math.max(0, (nowTime - (toTimestamp(s.date) ?? nowTime)) / DAY_MS);
        let recencyWeight = 0.08;
        if (ageDays <= 1) recencyWeight = 0.85;
        else if (ageDays <= 3) recencyWeight = 0.6;
        else if (ageDays <= 7) recencyWeight = 0.35;

        return {
          ...s,
          recencyWeight,
          // If calm sessions are present but marked not below-threshold (often because the
          // planned duration exceeded what was attempted), still use them as evidence of
          // tolerated time with a conservative haircut.
          actualDuration: Math.max(PROTOCOL.minDurationSeconds, Math.round(s.actualDuration * 0.9)),
        };
      });
  if (!calm.length) return PROTOCOL.startDurationSeconds;

  const weighted = calm.reduce((sum, s) => sum + (s.actualDuration * s.confidence * s.recencyWeight), 0);
  const weight = calm.reduce((sum, s) => sum + (s.confidence * s.recencyWeight), 0);
  return Math.max(PROTOCOL.minDurationSeconds, Math.round(weighted / Math.max(weight, 0.01)));
}

function getSubtleRecoveryContext(trainingSessions = []) {
  const base = {
    active: false,
    remainingSessions: 0,
    subtleIndex: -1,
    completedRecoveryEndIndex: -1,
    recoveryStep: 0,
    nextRecoveryDuration: PROTOCOL.subtleRecoveryDurationSeconds,
    anchorDuration: null,
    postRecoveryDuration: null,
    justCompleted: false,
  };
  if (!trainingSessions.length) return base;

  let subtleIndex = -1;
  for (let i = trainingSessions.length - 1; i >= 0; i -= 1) {
    if (trainingSessions[i].distressLevel === DISTRESS_LEVELS.SUBTLE) {
      subtleIndex = i;
      break;
    }
  }
  if (subtleIndex < 0) return base;

  const subtle = trainingSessions[subtleIndex];
  const nowTime = Date.now();
  const subtleTime = toTimestamp(subtle?.date);
  const anchorIsRecent = Number.isFinite(subtleTime)
    && (nowTime - subtleTime) <= (PROTOCOL.subtleRecoveryAnchorMaxAgeDays * DAY_MS);

  let trailingCalmAfterSubtle = 0;
  for (let i = trainingSessions.length - 1; i > subtleIndex; i -= 1) {
    if (trainingSessions[i].distressLevel !== DISTRESS_LEVELS.NONE) break;
    trailingCalmAfterSubtle += 1;
  }
  const anchorHasCalmClosure = trailingCalmAfterSubtle >= PROTOCOL.subtleRecoveryAnchorClosureCalmSessions;
  const anchorStillValid = anchorIsRecent && !anchorHasCalmClosure;
  if (!anchorStillValid) return base;

  const anchorDuration = Math.max(
    PROTOCOL.minDurationSeconds,
    Number(subtle?.actualDuration) > 0 ? Number(subtle.actualDuration) : Number(subtle?.plannedDuration || PROTOCOL.minDurationSeconds),
  );
  const after = trainingSessions.slice(subtleIndex + 1);
  let step = 0; // 0 => next is 60s, 1 => next is 120s, 2 => complete
  let completedRecoveryEndIndex = -1;

  for (let offset = 0; offset < after.length; offset += 1) {
    const session = after[offset];
    const calm = session.distressLevel === DISTRESS_LEVELS.NONE;
    if (!calm) {
      step = 0; // restart sequence after any non-calm recovery attempt
      continue;
    }
    if (step === 0) {
      step = 1;
      continue;
    }
    step = 2;
    completedRecoveryEndIndex = subtleIndex + 1 + offset;
    break;
  }

  const completed = step >= 2;
  const justCompleted = completed && completedRecoveryEndIndex === (trainingSessions.length - 1);
  const remainingSessions = completed ? 0 : Math.max(0, PROTOCOL.subtleRecoverySessionCount - step);

  return {
    active: !completed,
    remainingSessions,
    subtleIndex,
    completedRecoveryEndIndex,
    recoveryStep: Math.min(step + 1, PROTOCOL.subtleRecoverySessionCount),
    nextRecoveryDuration: step === 0
      ? PROTOCOL.subtleRecoveryDurationSeconds
      : (PROTOCOL.subtleRecoveryDurationSeconds * 2),
    anchorDuration,
    postRecoveryDuration: Math.max(PROTOCOL.minDurationSeconds, Math.round(anchorDuration * 0.95)),
    justCompleted,
  };
}

function hasPriorStressEvent(sessions = []) {
  return sessions.some((session) => {
    const level = normalizeDistressLevel(session?.distressLevel);
    return level !== DISTRESS_LEVELS.NONE;
  });
}

function computeStability(sessions = []) {
  const recent = getLatestSessions(sessions.map(toRichSession), PROTOCOL.calmWindow);
  if (!recent.length) return 0;

  const calmConsistency = recent.filter((s) => s.belowThreshold).length / recent.length;
  const subtlePenalty = recent.filter((s) => s.distressLevel === DISTRESS_LEVELS.SUBTLE).length / recent.length;
  const severePenalty = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length / recent.length;
  const completion = recent.reduce((sum, s) => sum + ratio(s.actualDuration, s.plannedDuration), 0) / recent.length;

  return clamp01((calmConsistency * 0.55) + (completion * 0.25) + ((1 - subtlePenalty) * 0.12) + ((1 - severePenalty) * 0.08));
}

function computeMomentum(sessions = []) {
  const rich = sessions.map(toRichSession);
  if (rich.length < 4) return 0;
  const early = rich.slice(0, Math.floor(rich.length / 2));
  const late = rich.slice(Math.floor(rich.length / 2));

  const earlySafe = computeSafeAloneTime(early);
  const lateSafe = computeSafeAloneTime(late);
  const latencyEarly = early.reduce((sum, s) => sum + s.latencyToFirstDistress, 0) / early.length;
  const latencyLate = late.reduce((sum, s) => sum + s.latencyToFirstDistress, 0) / late.length;

  const durationTrend = clamp((lateSafe - earlySafe) / Math.max(earlySafe, 30), -1, 1);
  const latencyTrend = clamp((latencyLate - latencyEarly) / Math.max(latencyEarly, 30), -1, 1);
  return clamp01((durationTrend * 0.55 + latencyTrend * 0.45 + 1) / 2);
}

function computeRelapseRisk(sessions = [], realAbsences = [], now = new Date()) {
  const recent = getLatestSessions(sessions.map(toRichSession), PROTOCOL.confidenceSessionWindow);
  if (!recent.length) return 0.5;

  const distressLoad = recent.reduce((sum, s) => sum + getSeverity(s.distressLevel), 0) / recent.length;
  const volatility = recent.length > 1
    ? recent.slice(1).reduce((sum, s, idx) => sum + Math.abs(s.actualDuration - recent[idx].actualDuration), 0)
      / (recent.length - 1)
    : 0;
  const baseVolatility = clamp01(volatility / Math.max(computeSafeAloneTime(recent), 30));
  const panicEvents = recent.filter((s) => s.distressLevel === DISTRESS_LEVELS.SEVERE).length;
  const recentReal = realAbsences
    .map(toRichSession)
    .filter((s) => isWithinDays(s.date, 7, now.getTime()));
  const uncontrolledReal = recentReal.filter((s) => !s.belowThreshold).length;

  const risk =
    (distressLoad * 0.35)
    + (baseVolatility * 0.2)
    + (Math.min(1, panicEvents / 2) * 0.2)
    + (Math.min(1, uncontrolledReal / 3) * 0.15)
    + gapPenalty(sessions, now) * 0.1;
  return clamp01(risk);
}

function computeAdherence(sessions = [], plan = {}, now = new Date()) {
  const cadenceDays = Math.max(1, Number(plan.targetCadenceDays || PROTOCOL.adherenceTargetGapDays));
  const recent = sessions.filter((s) => isWithinDays(s.date, 14, now.getTime()));
  if (!recent.length) return 0;

  const completed = recent.filter((s) => (Number(s.actualDuration) || 0) >= (Number(s.plannedDuration) || 0) * 0.95).length;
  const cadenceTarget = Math.max(1, Math.floor(14 / cadenceDays));
  const cadenceScore = clamp01(recent.length / cadenceTarget);
  const completionScore = completed / recent.length;

  const withinBandCount = recent.filter((s) => {
    if (!Number(plan.recommendedDuration)) return true;
    return Math.abs((Number(s.plannedDuration) || 0) - plan.recommendedDuration) <= Math.max(10, plan.recommendedDuration * 0.25);
  }).length;

  const planMatchScore = withinBandCount / recent.length;
  return clamp01((cadenceScore * 0.4) + (completionScore * 0.35) + (planMatchScore * 0.25));
}

function buildCueStats(cueSessions = []) {
  const byCue = new Map();
  cueSessions.forEach((entry) => {
    const cue = entry?.cue || entry?.type;
    if (!cue) return;
    const level = normalizeDistressLevel(entry?.distressLevel || entry?.reactionLevel);
    if (!byCue.has(cue)) byCue.set(cue, { cue, exposures: 0, score: 0, worst: DISTRESS_LEVELS.NONE });
    const row = byCue.get(cue);
    row.exposures += 1;
    row.score += getSeverity(level);
    if (getSeverity(level) > getSeverity(row.worst)) row.worst = level;
  });

  return [...byCue.values()]
    .map((cue) => ({
      ...cue,
      sensitivity: cue.exposures ? clamp01(cue.score / cue.exposures) : 0,
    }))
    .sort((a, b) => a.sensitivity - b.sensitivity);
}

export function calculateTrainingStats(sessions = [], options = {}) {
  const richSessions = sortByDateAsc(sessions).map(toRichSession);
  const realAbsences = richSessions.filter((s) => s.departureType === "real_life");
  const trainingSessions = richSessions.filter((s) => s.departureType !== "real_life");
  const safeAloneTime = computeSafeAloneTime(trainingSessions);

  const calmRate = trainingSessions.length
    ? trainingSessions.filter((s) => s.belowThreshold).length / trainingSessions.length
    : 0;
  const subtleRate = trainingSessions.length
    ? trainingSessions.filter((s) => s.distressLevel === DISTRESS_LEVELS.SUBTLE).length / trainingSessions.length
    : 0;
  const activeRate = trainingSessions.length
    ? trainingSessions.filter((s) => s.distressLevel === DISTRESS_LEVELS.ACTIVE).length / trainingSessions.length
    : 0;

  const averageLatency = trainingSessions.length
    ? trainingSessions.reduce((sum, s) => sum + s.latencyToFirstDistress, 0) / trainingSessions.length
    : 0;

  const cueSensitivity = buildCueStats(options.cueSessions || []);

  return {
    safeAloneTime,
    bestRecentSafeAloneTime: safeAloneTime,
    latencyToDistressTrend: computeMomentum(trainingSessions),
    averageLatencyToDistress: Math.round(averageLatency),
    calmSessionRate: calmRate,
    subtleDistressRate: subtleRate,
    activeDistressRate: activeRate,
    stabilityScore: computeStability(trainingSessions),
    momentumScore: computeMomentum(trainingSessions),
    relapseRisk: computeRelapseRisk(trainingSessions, realAbsences),
    adherenceScore: computeAdherence(trainingSessions, options.plan || {}),
    cueSensitivity,
    contextInsights: [],
  };
}

function labelRelapseRisk(risk = 0) {
  if (risk >= 0.72) return "high";
  if (risk >= 0.58) return "medium";
  return "low";
}

function buildDecisionState({ recommendedDuration, recommendationType, stats, recoveryMode, factors = [], hasHistory }) {
  if (!hasHistory || !stats) {
    return {
      targetSeconds: recommendedDuration,
      riskLevel: "medium",
      readiness: "building",
      statusLabel: "Stable",
      uiTone: "informational_stable",
      reasonTags: ["baseline_start"],
      factors,
    };
  }

  const riskLevel = labelRelapseRisk(stats.relapseRisk);
  const cautionType = ["stabilization_block", "reduce_duration", "subtle_recovery_mode"].includes(recommendationType);
  const guardedType = ["repeat_current_duration", "insert_easy_sessions", "departure_cues_first"].includes(recommendationType);
  const readiness = cautionType
    ? "low"
    : (riskLevel === "high" || recoveryMode?.active || guardedType)
      ? "guarded"
      : riskLevel === "medium"
        ? "moderate"
        : "high";
  const statusLabel = cautionType || riskLevel === "high"
    ? "Needs attention"
    : (readiness === "high" || recommendationType === "subtle_recovery_resume")
      ? "Improving"
      : "Stable";
  const uiTone = statusLabel === "Needs attention"
    ? "risk_high"
    : statusLabel === "Improving"
      ? "informational_improving"
      : "informational_stable";
  const reasonTags = [
    `risk_${riskLevel}`,
    `type_${recommendationType}`,
    recoveryMode?.active ? "recovery_active" : "recovery_inactive",
  ];

  return {
    targetSeconds: recommendedDuration,
    riskLevel,
    readiness,
    statusLabel,
    uiTone,
    reasonTags,
    factors,
  };
}


function getRecentTrainingWindow(trainingSessions = [], window = 7) {
  return getLatestSessions(trainingSessions, window);
}

function getSessionDurationAnchor(session = null) {
  if (!session) return null;
  const actual = Number(session.actualDuration);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const planned = Number(session.plannedDuration);
  if (Number.isFinite(planned) && planned > 0) return planned;
  return null;
}

function getLastCalmSession(sessions = []) {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    if (sessions[i].distressLevel === DISTRESS_LEVELS.NONE) return sessions[i];
  }
  return null;
}

function clampRateChange(nextDuration, referenceDuration) {
  if (!Number.isFinite(referenceDuration) || referenceDuration <= 0) return Math.round(nextDuration);
  const minAllowed = referenceDuration * 0.75; // Smoothing guard: never decrease by more than 25% in one step.
  const maxAllowed = referenceDuration * 1.2; // Smoothing guard: never increase by more than 20% in one step.
  return Math.round(clamp(nextDuration, minAllowed, maxAllowed));
}

function computeProgressiveIncrease(anchorDuration, calmStreak = 1) {
  if (!Number.isFinite(anchorDuration) || anchorDuration <= 0) return PROTOCOL.startDurationSeconds;

  // Before 40 minutes, scale up by 10-15% based on how steady the current calm streak is.
  if (anchorDuration < 40 * 60) {
    const percentIncrease = clamp(0.14 + (Math.max(0, calmStreak - 1) * 0.01), 0.1, 0.15);
    return Math.round(anchorDuration * (1 + percentIncrease));
  }

  // At/after 40 minutes, switch to fixed +3 to +5 minute steps.
  const fixedStepSeconds = anchorDuration >= 60 * 60 ? 5 * 60 : 3 * 60;
  return Math.round(anchorDuration + fixedStepSeconds);
}

function computeFallbackFromCalmHistory(recentWindow = [], anchorDuration = null) {
  const calmBelowThresholdDurations = recentWindow
    .filter((session) => session.distressLevel === DISTRESS_LEVELS.NONE && session.belowThreshold)
    .map((session) => getSessionDurationAnchor(session))
    .filter((value) => Number.isFinite(value) && value > 0);
  const calmDurations = calmBelowThresholdDurations.length
    ? calmBelowThresholdDurations
    : recentWindow
      .filter((session) => session.distressLevel === DISTRESS_LEVELS.NONE)
    .map((session) => getSessionDurationAnchor(session))
    .filter((value) => Number.isFinite(value) && value > 0);

  const calmAverage = calmDurations.length
    ? calmDurations.reduce((sum, value) => sum + value, 0) / calmDurations.length
    : null;

  const baseCandidates = [anchorDuration, calmAverage].filter((value) => Number.isFinite(value) && value > 0);
  if (!baseCandidates.length) return null;

  // Fallback is based on calm evidence, not a hard floor reset.
  const fallbackBase = Math.min(...baseCandidates);
  return {
    fallbackBase: Math.round(fallbackBase),
    usedRelaxedCalmEvidence: calmBelowThresholdDurations.length === 0 && calmDurations.length > 0,
  };
}

export function computeNextTarget(trainingSessions = [], options = {}) {
  const normalizedTraining = sortByDateAsc(trainingSessions).map(toRichSession);
  const recentWindow = getRecentTrainingWindow(normalizedTraining, 7);
  const lastSession = recentWindow[recentWindow.length - 1] || null;
  const goalSeconds = Number(options.goalSeconds || PROTOCOL.goalDurationDefaultSeconds);
  const relapseRisk = clamp01(Number(options.relapseRisk));
  const reductionPercent = relapseRisk >= 0.72 ? 0.2 : relapseRisk >= 0.58 ? 0.15 : 0.1;

  if (!lastSession) {
    return {
      recommendedDuration: PROTOCOL.startDurationSeconds,
      recommendationType: 'baseline_start',
      recoveryMode: {
        active: false,
        remainingSessions: 0,
        step: 0,
        anchorSessionDate: null,
        anchorDuration: null,
        recoveryDuration: null,
        postRecoveryDuration: null,
      },
    };
  }

  const stressIndex = Math.max(
    recentWindow.map((session) => session.distressLevel).lastIndexOf(DISTRESS_LEVELS.SUBTLE),
    recentWindow.map((session) => session.distressLevel).lastIndexOf(DISTRESS_LEVELS.ACTIVE),
    recentWindow.map((session) => session.distressLevel).lastIndexOf(DISTRESS_LEVELS.SEVERE),
  );

  if (stressIndex >= 0) {
    const stressSession = recentWindow[stressIndex];
    const stressLevel = stressSession.distressLevel;
    const beforeStress = recentWindow.slice(0, stressIndex);
    const afterStress = recentWindow.slice(stressIndex + 1);
    const lastFullyCalm = getLastCalmSession(beforeStress);
    const anchorDuration = getSessionDurationAnchor(lastFullyCalm)
      ?? (
        stressLevel === DISTRESS_LEVELS.SUBTLE && Number(stressSession?.actualDuration) > 0
          ? getSessionDurationAnchor(stressSession)
          : null
      );

    if (stressLevel === DISTRESS_LEVELS.SUBTLE) {
      const recoveryDurations = [60, 120];
      let calmRecoveryCount = 0;

      if (!Number.isFinite(anchorDuration) || anchorDuration <= 0) {
        const baseline = getSessionDurationAnchor(lastSession) ?? PROTOCOL.startDurationSeconds;
        return {
          recommendedDuration: clamp(Math.max(PROTOCOL.minDurationSeconds, Math.round(baseline)), PROTOCOL.minDurationSeconds, goalSeconds),
          recommendationType: "keep_same_duration",
          recoveryMode: {
            active: false,
            remainingSessions: 0,
            step: 0,
            anchorSessionDate: null,
            anchorDuration: null,
            recoveryDuration: null,
            postRecoveryDuration: null,
          },
        };
      }

      // Recovery progress only advances on consecutive calm sessions after the subtle marker.
      for (const session of afterStress) {
        if (session.distressLevel === DISTRESS_LEVELS.NONE) calmRecoveryCount += 1;
        else calmRecoveryCount = 0;
      }

      // If we already observed a sustained calm closure (3+ calm sessions), the subtle marker is closed out.
      if (afterStress.length >= 3 && afterStress.slice(-3).every((session) => session.distressLevel === DISTRESS_LEVELS.NONE)) {
        const closureBase = getSessionDurationAnchor(getLastCalmSession(recentWindow)) ?? PROTOCOL.startDurationSeconds;
        const closureNext = clampRateChange(computeProgressiveIncrease(closureBase, 3), closureBase);
        return {
          recommendedDuration: clamp(closureNext, PROTOCOL.minDurationSeconds, goalSeconds),
          recommendationType: "keep_same_duration",
          recoveryMode: {
            active: false,
            remainingSessions: 0,
            step: 0,
            anchorSessionDate: lastFullyCalm?.date || null,
            anchorDuration: anchorDuration ?? null,
            recoveryDuration: null,
            postRecoveryDuration: null,
          },
        };
      }

      if (calmRecoveryCount < 2) {
        return {
          recommendedDuration: recoveryDurations[Math.min(calmRecoveryCount, recoveryDurations.length - 1)],
          recommendationType: 'subtle_recovery_mode',
          recoveryMode: {
            active: true,
            remainingSessions: Math.max(0, 2 - calmRecoveryCount),
            step: Math.min(2, calmRecoveryCount + 1),
            anchorSessionDate: lastFullyCalm?.date || null,
            anchorDuration: anchorDuration ?? null,
            recoveryDuration: recoveryDurations[Math.min(calmRecoveryCount, recoveryDurations.length - 1)],
            postRecoveryDuration: Number.isFinite(anchorDuration) ? Math.max(PROTOCOL.minDurationSeconds, Math.round(anchorDuration * 0.95)) : null,
          },
        };
      }

      const resumeAnchor = anchorDuration;
      const resumeDuration = Number.isFinite(resumeAnchor)
        ? Math.max(PROTOCOL.minDurationSeconds, Math.round(resumeAnchor * 0.95))
        : PROTOCOL.minDurationSeconds;

      return {
        recommendedDuration: clamp(resumeDuration, PROTOCOL.minDurationSeconds, goalSeconds),
        recommendationType: 'subtle_recovery_resume',
        recoveryMode: {
          active: false,
          remainingSessions: 0,
          step: 2,
          anchorSessionDate: lastFullyCalm?.date || null,
          anchorDuration: anchorDuration ?? null,
          recoveryDuration: null,
          postRecoveryDuration: resumeDuration,
        },
      };
    }

    if ([DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(stressLevel)) {
      const recoveryDurations = stressLevel === DISTRESS_LEVELS.SEVERE ? [60, 120, 120] : [60, 120];
      let calmRecoveryCount = 0;
      for (const session of afterStress) {
        const sessionDuration = getSessionDurationAnchor(session);
        const looksLikeRecovery = Number.isFinite(sessionDuration) && sessionDuration <= 120;
        if (session.distressLevel === DISTRESS_LEVELS.NONE && looksLikeRecovery) calmRecoveryCount += 1;
        else calmRecoveryCount = 0;
      }

      const fallbackInfo = computeFallbackFromCalmHistory(recentWindow, anchorDuration);
      const reducedFallback = fallbackInfo?.usedRelaxedCalmEvidence
        ? Math.max(PROTOCOL.minDurationSeconds, Math.round(fallbackInfo.fallbackBase * (1 - reductionPercent)))
        : fallbackInfo?.fallbackBase;
      const evidenceBasedFallback = Number.isFinite(reducedFallback)
        ? reducedFallback
        : null;
      const fallbackReference = Number.isFinite(anchorDuration) ? anchorDuration : getSessionDurationAnchor(lastSession);
      const fallbackDuration = clampRateChange(
        clamp(evidenceBasedFallback ?? PROTOCOL.startDurationSeconds, PROTOCOL.minDurationSeconds, goalSeconds),
        fallbackReference,
      );

      // First recommendation after active/severe stress is an immediate anchored fallback.
      if (!afterStress.length) {
        return {
          recommendedDuration: fallbackDuration,
          recommendationType: stressLevel === DISTRESS_LEVELS.SEVERE ? 'stabilization_block' : 'reduce_duration',
          recoveryMode: {
            active: true,
            remainingSessions: recoveryDurations.length,
            step: 1,
            anchorSessionDate: lastFullyCalm?.date || null,
            anchorDuration: anchorDuration ?? null,
            recoveryDuration: recoveryDurations[0],
            postRecoveryDuration: Math.max(PROTOCOL.minDurationSeconds, Math.round(fallbackDuration * 0.95)),
          },
        };
      }

      if (calmRecoveryCount < recoveryDurations.length) {
        const nextRecovery = recoveryDurations[Math.min(calmRecoveryCount, recoveryDurations.length - 1)];
        return {
          recommendedDuration: nextRecovery,
          recommendationType: stressLevel === DISTRESS_LEVELS.SEVERE ? 'stabilization_block' : 'reduce_duration',
          recoveryMode: {
            active: true,
            remainingSessions: Math.max(0, recoveryDurations.length - calmRecoveryCount),
            step: Math.min(recoveryDurations.length, calmRecoveryCount + 1),
            anchorSessionDate: lastFullyCalm?.date || null,
            anchorDuration: anchorDuration ?? null,
            recoveryDuration: nextRecovery,
            postRecoveryDuration: Math.max(PROTOCOL.minDurationSeconds, Math.round(fallbackDuration * 0.95)),
          },
        };
      }

      const resumeDuration = clampRateChange(
        Math.max(PROTOCOL.minDurationSeconds, Math.round(fallbackDuration * 0.95)),
        getSessionDurationAnchor(lastSession),
      );

      return {
        recommendedDuration: clamp(resumeDuration, PROTOCOL.minDurationSeconds, goalSeconds),
        recommendationType: 'keep_same_duration',
        recoveryMode: {
          active: false,
          remainingSessions: 0,
          step: recoveryDurations.length,
          anchorSessionDate: lastFullyCalm?.date || null,
          anchorDuration: anchorDuration ?? null,
          recoveryDuration: null,
          postRecoveryDuration: resumeDuration,
        },
      };
    }
  }

  const calmStreak = countStreak(recentWindow, (session) => session.distressLevel === DISTRESS_LEVELS.NONE);
  const lastCalmSession = getLastCalmSession(recentWindow);
  const anchorDuration = getSessionDurationAnchor(lastCalmSession) ?? PROTOCOL.startDurationSeconds;
  const lastReferenceDuration = getSessionDurationAnchor(lastSession) ?? anchorDuration;

  const stepped = computeProgressiveIncrease(anchorDuration, calmStreak);
  const smoothed = clampRateChange(stepped, lastReferenceDuration);

  return {
    recommendedDuration: clamp(smoothed, PROTOCOL.minDurationSeconds, goalSeconds),
    recommendationType: 'keep_same_duration',
    recoveryMode: {
      active: false,
      remainingSessions: 0,
      step: 0,
      anchorSessionDate: lastCalmSession?.date || null,
      anchorDuration,
      recoveryDuration: null,
      postRecoveryDuration: null,
    },
  };
}

function getStepMultiplier(stats, latestSessions = [], allSessions = []) {
  const calmStreak = countStreak(latestSessions, (s) => s.belowThreshold);

  if (stats.relapseRisk >= 0.72) return -0.25;
  if (!hasPriorStressEvent(allSessions) && calmStreak >= 1) return 0.2;
  if (calmStreak >= 4 && stats.stabilityScore >= PROTOCOL.largeStepStabilityGate && stats.subtleDistressRate <= 0.15) {
    return 0.2;
  }
  if (calmStreak >= 2 && stats.stabilityScore >= 0.62) return 0.08;
  if (stats.subtleDistressRate > 0.25) return 0;
  return 0.03;
}

export function buildRecommendation(sessions = [], options = {}) {
  const rich = sortByDateAsc(sessions).map(toRichSession);
  const training = rich.filter((s) => s.departureType !== "real_life");
  const stats = calculateTrainingStats(training, options);
  const nextTarget = computeNextTarget(training, { ...options, relapseRisk: stats.relapseRisk });
  const safeAlone = stats.safeAloneTime || PROTOCOL.startDurationSeconds;

  let recommendedDuration = nextTarget.recommendedDuration;
  let recommendationType = nextTarget.recommendationType;

  const panicPattern = getLatestSessions(training, 8).filter((s) => s.distressLevel === DISTRESS_LEVELS.SEVERE).length >= 2;
  const uncontrolledRealAbsence = rich.filter((s) => s.departureType === "real_life" && !s.belowThreshold).slice(-3).length >= 1;
  const warnings = [];

  if (panicPattern) warnings.push("Repeated panic markers. Pause escalation and consult a veterinarian/behavior professional.");
  if (uncontrolledRealAbsence) warnings.push("Recent real-life absence exceeded threshold. Prioritize management and easier sessions.");
  if (stats.adherenceScore < 0.45) warnings.push("Practice consistency is low. Focus on cadence before increasing duration.");

  const cueStats = buildCueStats(options.cueSessions || []);
  const mostTriggeringCue = cueStats.slice().sort((a, b) => b.sensitivity - a.sensitivity)[0];
  const focusArea = !["subtle_recovery_mode", "subtle_recovery_resume"].includes(recommendationType) && mostTriggeringCue && mostTriggeringCue.sensitivity >= 0.55
    ? "departure_cues_first"
    : recommendationType;

  const boundedDuration = clamp(
    recommendedDuration,
    PROTOCOL.minDurationSeconds,
    Number(options.goalSeconds || PROTOCOL.goalDurationDefaultSeconds),
  );

  return {
    recommendedDuration: boundedDuration,
    recommendationType: focusArea,
    stabilizationMode: stats.relapseRisk >= 0.72,
    recoveryMode: nextTarget.recoveryMode,
    stats,
    warnings,
    safeAbsenceAlert: Number(options.plannedRealAbsenceSeconds || 0) > safeAlone,
  };
}

function buildCueSessions(patterns = []) {
  return patterns.map((p) => ({
    cue: p.type,
    date: p.date,
    reactionLevel: p.reactionLevel || "none",
  }));
}

function describeRecommendationType(type) {
  switch (type) {
    case "repeat_current_duration":
      return "Recent subtle stress keeps the next target at the current level.";
    case "reduce_duration":
      return "Recent active distress triggers a shorter next target.";
    case "stabilization_block":
      return "Recent severe distress triggers a deeper step back to stabilize.";
    case "insert_easy_sessions":
      return "The plan inserts an easier confidence-building session before pushing higher.";
    case "departure_cues_first":
      return "Pattern-break logs suggest cue practice should come first before stretching duration.";
    case "subtle_recovery_mode":
      return "Recent subtle stress triggered two short confidence-recovery sessions before normal progression resumes.";
    case "subtle_recovery_resume":
      return "Recovery sessions completed. The next target resumes from the subtle-stress anchor with a 5% step-down.";
    default:
      return "The next target is adjusted from the current safe-alone estimate.";
  }
}

export function explainNextTarget(sessions = [], walks = [], patterns = [], dog = {}) {
  const sortedSessions = sortByDateAsc(sessions).map(toRichSession);
  const trainingSessions = sortedSessions.filter((s) => s.departureType !== "real_life");
  const cueSessions = buildCueSessions(patterns);
  const lastTraining = trainingSessions[trainingSessions.length - 1] || null;

  if (!trainingSessions.length) {
    const baseline = Number(dog?.currentMaxCalm || 0);
    const recommendedDuration = baseline > 0
      ? Math.max(PROTOCOL.startDurationSeconds, Math.round(baseline * 0.8))
      : PROTOCOL.startDurationSeconds;

    return {
      recommendedDuration,
      recommendationType: "baseline_start",
      summary: baseline > 0
        ? "The first target starts at about 80% of your dog's current calm-alone estimate so the opening sessions stay easy."
        : "With no history yet, PawTimer starts with the default 30-second confidence-building target.",
      factors: [
        baseline > 0
          ? `Current calm-alone estimate: ${Math.round(baseline)} sec.`
          : "No calm-alone baseline logged yet.",
        "Opening sessions stay conservative before the app has enough history to adapt.",
      ],
      stats: null,
      warnings: [],
      walkAdjustmentApplied: false,
      decisionState: buildDecisionState({
        recommendedDuration,
        recommendationType: "baseline_start",
        stats: null,
        recoveryMode: null,
        factors: [
          baseline > 0
            ? `Current calm-alone estimate: ${Math.round(baseline)} sec.`
            : "No calm-alone baseline logged yet.",
          "Opening sessions stay conservative before the app has enough history to adapt.",
        ],
        hasHistory: false,
      }),
    };
  }

  const recommendation = buildRecommendation(sortedSessions, {
    goalSeconds: dog?.goalSeconds,
    plannedRealAbsenceSeconds: dog?.plannedRealAbsenceSeconds,
    cueSessions,
    plan: {
      recommendedDuration: lastTraining?.plannedDuration || null,
      targetCadenceDays: 1,
    },
  });

  let recommendedDuration = recommendation.recommendedDuration;
  let walkAdjustmentApplied = false;

  if (walks.length) {
    const recentWalks = walks.slice(-8);
    const avgWalkDuration = recentWalks.reduce((sum, w) => sum + (Number(w.duration) || 0), 0) / recentWalks.length;
    const walkTypePenalty = recentWalks.filter((w) => (w.type || "regular") === "intense_exercise").length / recentWalks.length;

    if (avgWalkDuration > 0 && walkTypePenalty > 0.65 && recommendation.stats.stabilityScore < 0.6) {
      recommendedDuration = Math.max(PROTOCOL.minDurationSeconds, Math.round(recommendation.recommendedDuration * 0.95));
      walkAdjustmentApplied = true;
    }
  }

  const calmStreak = countStreak(trainingSessions, (session) => session.belowThreshold);
  const factors = [
    `Safe-alone estimate: ${Math.round(recommendation.stats.safeAloneTime)} sec, weighted toward recent calm sessions.`,
    `Last training result: ${lastTraining ? normalizeDistressLevel(lastTraining.distressLevel) : "none"}.`,
    `Calm streak: ${calmStreak} session${calmStreak === 1 ? "" : "s"}; stability ${(recommendation.stats.stabilityScore * 100).toFixed(0)}%.`,
    `Relapse risk: ${labelRelapseRisk(recommendation.stats.relapseRisk)} (${(recommendation.stats.relapseRisk * 100).toFixed(0)}%).`,
  ];

  if (recommendation.recommendationType === "departure_cues_first") {
    factors.push("Pattern-break logs show cue sensitivity, so cue practice is prioritized before duration growth.");
  }

  if (walkAdjustmentApplied) {
    factors.push("Recent intense walks plus low stability trimmed the target by 5% for caution.");
  }

  return {
    recommendedDuration,
    recommendationType: recommendation.recommendationType,
    summary: describeRecommendationType(recommendation.recommendationType),
    factors,
    stats: recommendation.stats,
    warnings: recommendation.warnings,
    walkAdjustmentApplied,
    recoveryMode: recommendation.recoveryMode,
    decisionState: buildDecisionState({
      recommendedDuration,
      recommendationType: recommendation.recommendationType,
      stats: recommendation.stats,
      recoveryMode: recommendation.recoveryMode,
      factors,
      hasHistory: trainingSessions.length > 0,
    }),
  };
}

export function getNextDurationSeconds(lastSuccessfulDurationSec, options = {}) {
  const fallbackSafe = Number(lastSuccessfulDurationSec) > 0
    ? Number(lastSuccessfulDurationSec)
    : PROTOCOL.startDurationSeconds;
  const recommendation = buildRecommendation(
    [{ plannedDuration: fallbackSafe, actualDuration: fallbackSafe, distressLevel: "none", date: new Date().toISOString() }],
    options,
  );
  return recommendation.recommendedDuration;
}

export function suggestNext(sessions = [], dog = {}) {
  if (!sessions.length) {
    const baseline = Number(dog?.currentMaxCalm || 0);
    if (baseline > 0) return Math.max(PROTOCOL.startDurationSeconds, Math.round(baseline * 0.8));
    return PROTOCOL.startDurationSeconds;
  }
  const result = buildRecommendation(sessions, { goalSeconds: dog?.goalSeconds });
  return result.recommendedDuration;
}

export function suggestNextWithContext(sessions = [], walks = [], patterns = [], dog = {}) {
  return explainNextTarget(sessions, walks, patterns, dog).recommendedDuration;
}

export function mapLegacySession(session = {}) {
  const normalized = toRichSession(session);
  return {
    ...session,
    ...normalized,
  };
}
