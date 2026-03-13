export const PROTOCOL = {
  sessionsPerDayDefault: 1,
  sessionsPerDayMax: 5,
  trainingDaysPerWeekDefault: 5,
  restDaysPerWeekMin: 1,
  restDaysPerWeekRecommended: 2,
  startDurationSeconds: 30,
  minDurationSeconds: 15,
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

const DAY_MS = 86400000;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clamp01 = (v) => clamp(v, 0, 1);

export const DISTRESS_LEVELS = {
  NONE: "none",
  SUBTLE: "subtle",
  ACTIVE: "active",
  SEVERE: "severe",
};

export const DISTRESS_CATEGORIES = ["none", "subtle", "active", "severe"];

const severityWeight = { none: 0, subtle: 0.35, passive: 0.35, mild: 0.35, active: 0.75, strong: 0.75, severe: 1, panic: 1 };
const typeBySeverity = { none: "none", subtle: "subtle", passive: "subtle", mild: "subtle", active: "active", strong: "active", severe: "severe", panic: "severe" };
const walkTypeWeights = { sniffy_decompression: 0.1, regular_walk: 0.2, training_walk: 0.25, toilet_break: 0.05, intense_exercise: 0.55 };

export function normalizeDistressLevel(level) {
  if (!level) return DISTRESS_LEVELS.NONE;
  const normalized = String(level).toLowerCase();
  if (normalized === "mild") return DISTRESS_LEVELS.SUBTLE;
  if (normalized === "strong") return DISTRESS_LEVELS.ACTIVE;
  if (normalized === "panic") return DISTRESS_LEVELS.SEVERE;
  return DISTRESS_CATEGORIES.includes(normalized) ? normalized : DISTRESS_LEVELS.NONE;
}

const toTimestamp = (v) => {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const isWithinDays = (iso, days, nowTime) => {
  const t = toTimestamp(iso);
  return Number.isFinite(t) && t >= nowTime - ((days - 1) * DAY_MS);
};
const getSeverity = (level) => severityWeight[normalizeDistressLevel(level)] ?? 0;
const ratio = (actual, planned) => {
  const p = Number(planned) || 0;
  return p <= 0 ? 0 : clamp01((Number(actual) || 0) / p);
};
const getLatestSessions = (sessions, count) => (Array.isArray(sessions) ? sessions.slice(-count) : []);
const countStreak = (items, predicate) => {
  let streak = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!predicate(items[i])) break;
    streak += 1;
  }
  return streak;
};

function confidenceFromSession(session = {}) {
  const explicit = Number(session.ratingConfidence ?? session.videoReview?.ratingConfidence);
  if (Number.isFinite(explicit)) return clamp01(explicit);
  return session.videoReview?.recorded ? 0.85 : 0.65;
}

function normalizeStressEvents(session = {}) {
  if (Array.isArray(session.stressEventTimestamps)) return session.stressEventTimestamps;
  if (Array.isArray(session.videoReview?.stressEventTimestamps)) return session.videoReview.stressEventTimestamps;
  return [];
}

function toRichSession(session = {}) {
  const planned = Math.max(PROTOCOL.minDurationSeconds, Number(session.plannedDuration || session.planned_duration || session.targetDuration || PROTOCOL.startDurationSeconds));
  const actual = Math.max(0, Number(session.actualDuration || session.actual_duration || 0));
  const level = normalizeDistressLevel(session.distressSeverity || session.distressLevel || session.distress_level);
  const latency = Number.isFinite(session.latencyToFirstStress)
    ? Math.max(0, Number(session.latencyToFirstStress))
    : Number.isFinite(session.latencyToFirstDistress)
      ? Math.max(0, Number(session.latencyToFirstDistress))
      : level === DISTRESS_LEVELS.NONE ? actual : Math.min(actual, planned);
  const belowThreshold = Boolean(session.belowThreshold ?? session.below_threshold ?? (level === DISTRESS_LEVELS.NONE && ratio(actual, planned) >= 0.98));
  const departureType = session.departureType || session.context?.departureType || "training";

  return {
    ...session,
    plannedDuration: planned,
    actualDuration: actual,
    distressSeverity: level,
    distressLevel: level,
    distressType: session.distressType || session.distress_type || typeBySeverity[level] || "none",
    latencyToFirstStress: latency,
    latencyToFirstDistress: latency,
    belowThreshold,
    ratingConfidence: confidenceFromSession(session),
    videoReview: { recorded: Boolean(session.videoReview?.recorded || session.video_review?.recorded), ...(session.videoReview || {}) },
    stressEventTimestamps: normalizeStressEvents(session),
    departureType,
  };
}

function computeSafeAloneTime(trainingSessions = []) {
  const calm = trainingSessions.filter((s) => s.belowThreshold);
  if (!calm.length) return PROTOCOL.startDurationSeconds;
  const weightedDuration = calm.reduce((sum, s) => sum + (s.actualDuration * s.ratingConfidence), 0);
  const confidenceWeight = calm.reduce((sum, s) => sum + s.ratingConfidence, 0);
  return Math.max(PROTOCOL.minDurationSeconds, Math.round(weightedDuration / Math.max(confidenceWeight, 1)));
}

function computeStability(trainingSessions = []) {
  const recent = getLatestSessions(trainingSessions, PROTOCOL.calmWindow);
  if (!recent.length) return 0;
  const calmConsistency = recent.filter((s) => s.belowThreshold).length / recent.length;
  const subtlePenalty = recent.filter((s) => s.distressSeverity === DISTRESS_LEVELS.SUBTLE).length / recent.length;
  const activePenalty = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressSeverity)).length / recent.length;
  const completion = recent.reduce((sum, s) => sum + ratio(s.actualDuration, s.plannedDuration), 0) / recent.length;
  return clamp01((0.52 * calmConsistency) + (0.24 * completion) + (0.14 * (1 - subtlePenalty)) + (0.10 * (1 - activePenalty)));
}

function computeLatencyTrend(trainingSessions = []) {
  if (trainingSessions.length < 4) return 0.5;
  const mid = Math.floor(trainingSessions.length / 2);
  const early = trainingSessions.slice(0, mid);
  const late = trainingSessions.slice(mid);
  const earlyLatency = early.reduce((sum, s) => sum + s.latencyToFirstStress, 0) / early.length;
  const lateLatency = late.reduce((sum, s) => sum + s.latencyToFirstStress, 0) / late.length;
  return clamp01((clamp((lateLatency - earlyLatency) / Math.max(earlyLatency, 30), -1, 1) + 1) / 2);
}

function computeMomentum(trainingSessions = []) {
  if (trainingSessions.length < 4) return 0;
  const mid = Math.floor(trainingSessions.length / 2);
  const early = trainingSessions.slice(0, mid);
  const late = trainingSessions.slice(mid);
  const durationTrend = clamp((computeSafeAloneTime(late) - computeSafeAloneTime(early)) / Math.max(computeSafeAloneTime(early), 30), -1, 1);
  const latencyTrend = clamp((computeLatencyTrend(late) - computeLatencyTrend(early)), -1, 1);
  return clamp01((durationTrend * 0.6 + latencyTrend * 0.4 + 1) / 2);
}

function computeFoodEngagement(feedingEvents = []) {
  if (!feedingEvents.length) return 0.5;
  const score = feedingEvents.reduce((sum, event) => {
    const eatenMap = { yes: 1, partial: 0.5, no: 0 };
    const eaten = eatenMap[event.eatenDuringSession] ?? eatenMap[event.eaten_during_session] ?? 0;
    const latency = Number(event.latencyToStartEating ?? event.latency_to_start_eating);
    const latencyScore = Number.isFinite(latency) ? clamp01(1 - (latency / 300)) : 0.6;
    const stopPenalty = (event.stoppedEatingWhenOwnerLeft ?? event.stopped_eating_when_owner_left) ? 0.25 : 0;
    return sum + clamp01((eaten * 0.65) + (latencyScore * 0.35) - stopPenalty);
  }, 0);
  return clamp01(score / feedingEvents.length);
}

function computeWalkContext(walks = []) {
  if (!walks.length) return 0.5;
  const weighted = walks.reduce((sum, w) => {
    const type = w.walkType || w.walk_type || "regular_walk";
    const intensity = clamp01((Number(w.intensity) || 2) / 5);
    const base = walkTypeWeights[type] ?? 0.2;
    return sum + clamp01(base + (0.25 * intensity));
  }, 0);
  return clamp01(weighted / walks.length);
}

function computeDailyLoad(contextEntries = []) {
  if (!contextEntries.length) return 0.3;
  const riskFlags = ["visitors", "grooming", "vetVisits", "noisyEnvironment", "poorSleep", "realAbsenceEarlier", "medicationOrCalmingAids", "highCognitiveLoad"];
  const load = contextEntries.reduce((sum, item) => {
    const local = riskFlags.reduce((r, key) => r + (item[key] ? 1 : 0), 0);
    return sum + clamp01(local / riskFlags.length);
  }, 0);
  return clamp01(load / contextEntries.length);
}

function computeAdherence(sessions = [], plan = {}, now = new Date()) {
  const cadence = Math.max(1, Number(plan.targetCadenceDays || PROTOCOL.adherenceTargetGapDays));
  const recent = sessions.filter((s) => isWithinDays(s.date, 14, now.getTime()));
  if (!recent.length) return 0;
  const completed = recent.filter((s) => ratio(s.actualDuration, s.plannedDuration) >= 0.95).length / recent.length;
  const cadenceTarget = Math.max(1, Math.floor(14 / cadence));
  const cadenceScore = clamp01(recent.length / cadenceTarget);
  const planMatch = Number(plan.recommendedDuration)
    ? recent.filter((s) => Math.abs(s.plannedDuration - plan.recommendedDuration) <= Math.max(10, plan.recommendedDuration * 0.25)).length / recent.length
    : 1;
  return clamp01((0.4 * cadenceScore) + (0.35 * completed) + (0.25 * planMatch));
}

function computeRelapseRisk(trainingSessions = [], realAbsences = [], contextLoad = 0.3) {
  const recent = getLatestSessions(trainingSessions, PROTOCOL.confidenceSessionWindow);
  if (!recent.length) return 0.5;
  const distressLoad = recent.reduce((sum, s) => sum + getSeverity(s.distressSeverity), 0) / recent.length;
  const activeCount = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressSeverity)).length;
  const panicCount = recent.filter((s) => s.distressSeverity === DISTRESS_LEVELS.SEVERE).length;
  const realRisk = realAbsences.length ? realAbsences.filter((s) => !s.belowThreshold).length / realAbsences.length : 0;
  return clamp01((0.33 * distressLoad) + (0.24 * clamp01(activeCount / recent.length)) + (0.18 * clamp01(panicCount / 2)) + (0.15 * realRisk) + (0.10 * contextLoad));
}

function buildCueStats(cueSessions = []) {
  const byCue = new Map();
  cueSessions.forEach((entry) => {
    const cue = entry?.cue || entry?.type;
    if (!cue) return;
    const level = normalizeDistressLevel(entry.reactionLevel || entry.distressLevel);
    if (!byCue.has(cue)) byCue.set(cue, { cue, exposures: 0, cumulative: 0, worst: DISTRESS_LEVELS.NONE });
    const row = byCue.get(cue);
    row.exposures += 1;
    row.cumulative += getSeverity(level);
    if (getSeverity(level) > getSeverity(row.worst)) row.worst = level;
  });
  return [...byCue.values()].map((row) => ({ ...row, sensitivity: clamp01(row.cumulative / Math.max(row.exposures, 1)) })).sort((a, b) => a.sensitivity - b.sensitivity);
}

function buildReadiness(trainingSessions = [], foodEngagement = 0.5, walkScore = 0.5, dailyLoad = 0.3) {
  const recent = getLatestSessions(trainingSessions, 6);
  if (!recent.length) return { score: 0.5, bestTimeOfDay: null, bestAfterWalkMinutes: null, bestAfterFeedingMinutes: null, risks: [] };

  const calmRate = recent.filter((s) => s.belowThreshold).length / recent.length;
  const latencyScore = clamp01((recent.reduce((sum, s) => sum + s.latencyToFirstStress, 0) / recent.length) / Math.max(computeSafeAloneTime(trainingSessions), 30));
  const score = clamp01((0.4 * calmRate) + (0.22 * latencyScore) + (0.16 * foodEngagement) + (0.12 * (1 - walkScore)) + (0.10 * (1 - dailyLoad)));

  const byTime = new Map();
  trainingSessions.forEach((s) => {
    const key = s.context?.timeOfDay || "unknown";
    if (!byTime.has(key)) byTime.set(key, { n: 0, calm: 0 });
    const row = byTime.get(key);
    row.n += 1;
    if (s.belowThreshold) row.calm += 1;
  });
  const bestTimeOfDay = [...byTime.entries()].sort((a, b) => (b[1].calm / b[1].n) - (a[1].calm / a[1].n))[0]?.[0] || null;

  const risks = [];
  if (dailyLoad > 0.65) risks.push("high_overstimulation_risk");
  if (foodEngagement < 0.35) risks.push("unmet_needs_risk");

  return {
    score,
    bestTimeOfDay,
    bestAfterWalkMinutes: walkScore > 0.55 ? 90 : 35,
    bestAfterFeedingMinutes: foodEngagement > 0.6 ? 30 : 50,
    risks,
  };
}

export function calculateTrainingStats(sessions = [], options = {}) {
  const richSessions = sessions.map(toRichSession);
  const realAbsences = richSessions.filter((s) => s.departureType === "real_life");
  const trainingSessions = richSessions.filter((s) => s.departureType !== "real_life");

  const safeAloneTime = computeSafeAloneTime(trainingSessions);
  const calmSessionRate = trainingSessions.length ? trainingSessions.filter((s) => s.belowThreshold).length / trainingSessions.length : 0;
  const subtleDistressRate = trainingSessions.length ? trainingSessions.filter((s) => s.distressSeverity === DISTRESS_LEVELS.SUBTLE).length / trainingSessions.length : 0;
  const activeDistressRate = trainingSessions.length ? trainingSessions.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressSeverity)).length / trainingSessions.length : 0;

  const foodEngagementUnderAbsence = computeFoodEngagement(options.feedingEvents || []);
  const walkContextScore = computeWalkContext(options.walks || []);
  const dailyLoad = computeDailyLoad(options.dailyContext || []);
  const readiness = buildReadiness(trainingSessions, foodEngagementUnderAbsence, walkContextScore, dailyLoad);
  const cueSensitivity = buildCueStats(options.cueSessions || []);

  return {
    safeAloneTime,
    latencyToFirstStressTrend: computeLatencyTrend(trainingSessions),
    calmSessionRate,
    subtleStressRate: subtleDistressRate,
    subtleDistressRate,
    activeStressRate: activeDistressRate,
    activeDistressRate,
    stabilityScore: computeStability(trainingSessions),
    momentumScore: computeMomentum(trainingSessions),
    relapseRisk: computeRelapseRisk(trainingSessions, realAbsences, dailyLoad),
    adherenceScore: computeAdherence(trainingSessions, options.plan || {}),
    foodEngagementUnderAbsence,
    cueSensitivity,
    contextInsights: readiness.risks,
    dailyReadinessScore: readiness.score,
    readiness,
  };
}

function getProgressionStep(stats, recentTraining = []) {
  const calmStreak = countStreak(recentTraining, (s) => s.belowThreshold);
  const subtleSeen = recentTraining.slice(-3).some((s) => s.distressSeverity === DISTRESS_LEVELS.SUBTLE);
  const distressStreak = countStreak(recentTraining, (s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressSeverity));

  if (distressStreak >= 2 || stats.relapseRisk >= 0.72) return -0.35;
  if (distressStreak === 1) return -0.2;
  if (subtleSeen || calmStreak < 2) return 0;
  if (calmStreak >= 5 && stats.stabilityScore >= 0.86 && stats.dailyReadinessScore >= 0.65) return 0.16;
  if (calmStreak >= 3 && stats.stabilityScore >= 0.72) return 0.1;
  return 0.05;
}

function chooseRecommendationType(last, stats, trainingSessions) {
  if (!last) return "keep_duration";
  const recent = getLatestSessions(trainingSessions, 4);
  const distressStreak = countStreak(recent, (s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressSeverity));

  if (stats.dailyReadinessScore < 0.35) return "avoid_training_today";
  if (distressStreak >= 2) return "stabilization_mode";
  if (last.distressSeverity === DISTRESS_LEVELS.ACTIVE || last.distressSeverity === DISTRESS_LEVELS.SEVERE) return "reduce_duration";
  if (last.distressSeverity === DISTRESS_LEVELS.SUBTLE) return "repeat_step";
  if (stats.cueSensitivity.some((cue) => cue.sensitivity >= 0.6)) return "cue_training_recommended";
  if (stats.relapseRisk >= 0.65) return "insert_confidence_session";
  return "keep_duration";
}

export function buildRecommendation(sessions = [], options = {}) {
  const rich = sessions.map(toRichSession);
  const trainingSessions = rich.filter((s) => s.departureType !== "real_life");
  const stats = calculateTrainingStats(rich, options);
  const last = trainingSessions[trainingSessions.length - 1] || null;

  const safeAlone = stats.safeAloneTime || PROTOCOL.startDurationSeconds;
  const recommendationType = chooseRecommendationType(last, stats, trainingSessions);
  let recommendedDuration = safeAlone;

  if (recommendationType === "reduce_duration") recommendedDuration = Math.round(safeAlone * 0.75);
  else if (recommendationType === "stabilization_mode") recommendedDuration = Math.round(safeAlone * 0.6);
  else if (recommendationType === "repeat_step") recommendedDuration = Math.round(Math.min(safeAlone, last?.plannedDuration || safeAlone));
  else if (recommendationType === "insert_confidence_session") recommendedDuration = Math.round(safeAlone * PROTOCOL.easySessionRatio);
  else if (recommendationType === "avoid_training_today") recommendedDuration = Math.round(safeAlone * 0.5);
  else {
    const progression = getProgressionStep(stats, getLatestSessions(trainingSessions, 6));
    recommendedDuration = Math.round(safeAlone * (1 + progression));
  }

  const warnings = [];
  if (stats.relapseRisk >= 0.72) warnings.push("Relapse risk elevated. Use stabilization mode and prioritize easier confidence sessions.");
  if (stats.dailyReadinessScore < 0.35) warnings.push("Readiness is low today. Avoid progression and consider management-only day.");

  const safeAbsenceAlert = Number(options.plannedRealAbsenceSeconds || 0) > safeAlone;
  if (safeAbsenceAlert) warnings.push("Planned real-life absence exceeds current safe duration and increases relapse risk.");

  return {
    recommendedDuration: clamp(recommendedDuration, PROTOCOL.minDurationSeconds, Number(options.goalSeconds || PROTOCOL.goalDurationDefaultSeconds)),
    recommendationType,
    stabilizationMode: recommendationType === "stabilization_mode" || stats.relapseRisk >= 0.72,
    stats,
    warnings,
    safeAbsenceAlert,
  };
}

export function getNextDurationSeconds(lastSuccessfulDurationSec, options = {}) {
  const fallback = Number(lastSuccessfulDurationSec) > 0 ? Number(lastSuccessfulDurationSec) : PROTOCOL.startDurationSeconds;
  return buildRecommendation([{ plannedDuration: fallback, actualDuration: fallback, distressSeverity: "none", belowThreshold: true, date: new Date().toISOString() }], options).recommendedDuration;
}

export function suggestNext(sessions = [], dog = {}) {
  if (!sessions.length) {
    const baseline = Number(dog.currentMaxCalm || 0);
    return baseline > 0 ? Math.max(PROTOCOL.startDurationSeconds, Math.round(baseline * 0.8)) : PROTOCOL.startDurationSeconds;
  }
  return buildRecommendation(sessions, { goalSeconds: dog.goalSeconds }).recommendedDuration;
}

export function suggestNextWithContext(sessions = [], walks = [], patterns = [], dog = {}) {
  const cueSessions = patterns.map((p) => ({ cue: p.type, date: p.date, reactionLevel: p.reactionLevel || "none" }));
  return buildRecommendation(sessions, {
    goalSeconds: dog.goalSeconds,
    plannedRealAbsenceSeconds: dog.plannedRealAbsenceSeconds,
    walks,
    cueSessions,
    feedingEvents: dog.feedingEvents || [],
    dailyContext: dog.dailyContext || [],
    plan: { recommendedDuration: sessions[sessions.length - 1]?.plannedDuration || null, targetCadenceDays: 1 },
  }).recommendedDuration;
}

export function mapLegacySession(session = {}) {
  const normalized = toRichSession(session);
  return {
    ...session,
    planned_duration: normalized.plannedDuration,
    actual_duration: normalized.actualDuration,
    below_threshold: normalized.belowThreshold,
    latency_to_first_stress: normalized.latencyToFirstStress,
    distress_severity: normalized.distressSeverity,
    distress_type: normalized.distressType,
    rating_confidence: normalized.ratingConfidence,
    video_review: normalized.videoReview,
    stress_event_timestamps: normalized.stressEventTimestamps,
    ...normalized,
  };
}
