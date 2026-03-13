export const PROTOCOL = {
  sessionsPerDayDefault: 1,
  sessionsPerDayMax: 5,
  trainingDaysPerWeekDefault: 5,
  restDaysPerWeekMin: 1,
  restDaysPerWeekRecommended: 2,
  startDurationSeconds: 30,
  minDurationSeconds: 30,
  goalDurationDefaultSeconds: 7200,
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

function toRichSession(session = {}) {
  const planned = Math.max(PROTOCOL.minDurationSeconds, Number(session.plannedDuration || session.targetDuration || 0) || PROTOCOL.startDurationSeconds);
  const actual = Math.max(0, Number(session.actualDuration || 0));
  const level = normalizeDistressLevel(session.distressLevel || session.distressSeverity);
  const distressType = getDistressType(level, session.distressType);
  const latency = Number.isFinite(session.latencyToFirstDistress)
    ? Math.max(0, Number(session.latencyToFirstDistress))
    : level === DISTRESS_LEVELS.NONE
      ? actual
      : Math.min(actual, planned);
  const belowThreshold = Boolean(
    session.belowThreshold
    ?? session.stayedBelowThreshold
    ?? (level === DISTRESS_LEVELS.NONE && ratio(actual, planned) >= 0.98),
  );

  const departureType = session?.context?.departureType || "training";

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
  const calm = getLatestSessions(sortByDateAsc(sessions).map(toRichSession), PROTOCOL.confidenceSessionWindow)
    .filter((s) => s.belowThreshold);
  if (!calm.length) return PROTOCOL.startDurationSeconds;

  const weighted = calm.reduce((sum, s) => sum + (s.actualDuration * s.confidence), 0);
  const weight = calm.reduce((sum, s) => sum + s.confidence, 0);
  return Math.max(PROTOCOL.minDurationSeconds, Math.round(weighted / Math.max(weight, 1)));
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

function getStepMultiplier(stats, latestSessions = []) {
  const calmStreak = countStreak(latestSessions, (s) => s.belowThreshold);

  if (stats.relapseRisk >= 0.72) return -0.25;
  if (calmStreak >= 4 && stats.stabilityScore >= PROTOCOL.largeStepStabilityGate && stats.subtleDistressRate <= 0.15) {
    return 0.2;
  }
  if (calmStreak >= 2 && stats.stabilityScore >= 0.62) return 0.08;
  if (stats.subtleDistressRate > 0.25) return 0;
  return 0.03;
}

function chooseRecommendationType(last, stats, recent) {
  if (!last) return "keep_same_duration";
  if (last.distressLevel === DISTRESS_LEVELS.SEVERE) return "stabilization_block";
  if (last.distressLevel === DISTRESS_LEVELS.ACTIVE) return "reduce_duration";
  if (last.distressLevel === DISTRESS_LEVELS.SUBTLE) return "repeat_current_duration";
  if (stats.relapseRisk >= 0.68) return "insert_easy_sessions";
  if (countStreak(recent, (s) => s.belowThreshold) % PROTOCOL.easySessionFrequency === 0) return "insert_easy_sessions";
  return "keep_same_duration";
}

export function buildRecommendation(sessions = [], options = {}) {
  const rich = sortByDateAsc(sessions).map(toRichSession);
  const training = rich.filter((s) => s.departureType !== "real_life");
  const recent = getLatestSessions(training, PROTOCOL.calmWindow);
  const last = training[training.length - 1] || null;
  const stats = calculateTrainingStats(training, options);
  const safeAlone = stats.safeAloneTime || PROTOCOL.startDurationSeconds;

  let recommendedDuration = safeAlone;
  const recommendationType = chooseRecommendationType(last, stats, recent);

  if (recommendationType === "reduce_duration") {
    recommendedDuration = Math.round(safeAlone * 0.75);
  } else if (recommendationType === "stabilization_block") {
    recommendedDuration = Math.round(safeAlone * 0.6);
  } else if (recommendationType === "repeat_current_duration") {
    recommendedDuration = Math.round(Math.min(safeAlone, last?.plannedDuration || safeAlone));
  } else if (recommendationType === "insert_easy_sessions") {
    recommendedDuration = Math.round(safeAlone * PROTOCOL.easySessionRatio);
  } else {
    const multiplier = getStepMultiplier(stats, recent);
    recommendedDuration = Math.round(safeAlone * (1 + multiplier));
  }

  const panicPattern = getLatestSessions(training, 8).filter((s) => s.distressLevel === DISTRESS_LEVELS.SEVERE).length >= 2;
  const uncontrolledRealAbsence = rich.filter((s) => s.departureType === "real_life" && !s.belowThreshold).slice(-3).length >= 1;
  const warnings = [];

  if (panicPattern) warnings.push("Repeated panic markers. Pause escalation and consult a veterinarian/behavior professional.");
  if (uncontrolledRealAbsence) warnings.push("Recent real-life absence exceeded threshold. Prioritize management and easier sessions.");
  if (stats.adherenceScore < 0.45) warnings.push("Practice consistency is low. Focus on cadence before increasing duration.");

  const cueStats = buildCueStats(options.cueSessions || []);
  const mostTriggeringCue = cueStats.slice().sort((a, b) => b.sensitivity - a.sensitivity)[0];
  const focusArea = mostTriggeringCue && mostTriggeringCue.sensitivity >= 0.55
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
    stats,
    warnings,
    safeAbsenceAlert: Number(options.plannedRealAbsenceSeconds || 0) > safeAlone,
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
  const normalizedSessions = sessions.map(toRichSession);

  const cueSessions = patterns.map((p) => ({
    cue: p.type,
    date: p.date,
    reactionLevel: p.reactionLevel || "none",
  }));

  const recommendation = buildRecommendation(normalizedSessions, {
    goalSeconds: dog?.goalSeconds,
    plannedRealAbsenceSeconds: dog?.plannedRealAbsenceSeconds,
    cueSessions,
    plan: {
      recommendedDuration: normalizedSessions[normalizedSessions.length - 1]?.plannedDuration || null,
      targetCadenceDays: 1,
    },
  });

  if (!walks.length) return recommendation.recommendedDuration;

  const recentWalks = walks.slice(-8);
  const avgWalkDuration = recentWalks.reduce((sum, w) => sum + (Number(w.duration) || 0), 0) / recentWalks.length;
  const walkTypePenalty = recentWalks.filter((w) => (w.type || "regular") === "intense_exercise").length / recentWalks.length;

  if (avgWalkDuration > 0 && walkTypePenalty > 0.65 && recommendation.stats.stabilityScore < 0.6) {
    return Math.max(PROTOCOL.minDurationSeconds, Math.round(recommendation.recommendedDuration * 0.95));
  }

  return recommendation.recommendedDuration;
}

export function mapLegacySession(session = {}) {
  const normalized = toRichSession(session);
  return {
    ...session,
    ...normalized,
  };
}
