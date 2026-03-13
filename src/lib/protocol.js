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
  easySessionRatio: 0.75,
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

const DEFAULT_DISTRESS_TYPE = {
  none: "none",
  subtle: "passive_stress",
  passive: "passive_stress",
  mild: "passive_stress",
  active: "active_distress",
  strong: "active_distress",
  severe: "severe_distress",
  panic: "severe_distress",
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
    if (normalized === "mild") return DISTRESS_LEVELS.SUBTLE;
    if (normalized === "strong") return DISTRESS_LEVELS.ACTIVE;
    if (normalized === "panic") return DISTRESS_LEVELS.SEVERE;
    return normalized;
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

function ratio(actual, planned) {
  const p = Number(planned) || 0;
  if (p <= 0) return 0;
  return clamp01((Number(actual) || 0) / p);
}

function getLatestSessions(sessions, count) {
  if (!Array.isArray(sessions)) return [];
  return sessions.slice(-count);
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
  if (days <= 3.5) return 0.15;
  if (days <= 6.5) return 0.28;
  return 0.42;
}

function confidenceFromSession(session = {}) {
  const rawConfidence = session.ratingConfidence ?? session.videoReview?.ratingConfidence;
  if (rawConfidence !== null && rawConfidence !== undefined) {
    const selfReported = Number(rawConfidence);
    if (Number.isFinite(selfReported)) return clamp01(selfReported);
  }
  if (session.videoReview?.recorded === true) return 0.85;
  return 0.65;
}

function deriveFoodEngagement(session = {}) {
  const feeding = session.feeding || {};
  const offered = feeding.offeredDuringSession === true;
  if (!offered) return 0.5;
  const engaged = feeding.engagedDuringAbsence === true ? 1 : 0;
  const finished = feeding.ateAmount === "fully" ? 1 : feeding.ateAmount === "partially" ? 0.5 : 0;
  const stopPenalty = feeding.stoppedEatingWhenOwnerLeft ? 0.4 : 0;
  const latency = Number(feeding.latencyToStartEatingSec);
  const latencyScore = Number.isFinite(latency) ? clamp01(1 - (latency / 300)) : 0.6;
  return clamp01((engaged * 0.4) + (finished * 0.3) + (latencyScore * 0.3) - stopPenalty);
}

function normalizeWalkType(type = "regular") {
  const value = String(type || "regular").toLowerCase();
  if (["sniffy_decompression", "regular", "intense_exercise", "training_walk", "toilet_break"].includes(value)) return value;
  return "regular";
}

function toRichSession(session = {}) {
  const planned = Math.max(
    PROTOCOL.minDurationSeconds,
    Number(session.plannedDuration || session.targetDuration || 0) || PROTOCOL.startDurationSeconds,
  );
  const actual = Math.max(0, Number(session.actualDuration || 0));
  const level = normalizeDistressLevel(session.distressLevel || session.distressSeverity);
  const distressType = session.distressType || DEFAULT_DISTRESS_TYPE[level] || "none";
  const latency = Number.isFinite(session.latencyToFirstDistress)
    ? Math.max(0, Number(session.latencyToFirstDistress))
    : level === DISTRESS_LEVELS.NONE
      ? actual
      : Math.min(actual, planned);

  const belowThreshold = Boolean(
    session.belowThreshold
    ?? session.stayedBelowThreshold
    ?? ((level === DISTRESS_LEVELS.NONE || (level === DISTRESS_LEVELS.SUBTLE && latency >= planned * 0.9)) && ratio(actual, planned) >= 0.97),
  );

  const departureType = session?.context?.departureType || session.departureType || "training";

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
    feeding: {
      timeOfLastMeal: session.feeding?.timeOfLastMeal ?? null,
      mealType: session.feeding?.mealType ?? null,
      amount: session.feeding?.amount ?? null,
      offeredDuringSession: Boolean(session.feeding?.offeredDuringSession),
      engagedDuringAbsence: Boolean(session.feeding?.engagedDuringAbsence),
      ateAmount: session.feeding?.ateAmount ?? null,
      latencyToStartEatingSec: Number.isFinite(session.feeding?.latencyToStartEatingSec) ? session.feeding.latencyToStartEatingSec : null,
      stoppedEatingWhenOwnerLeft: Boolean(session.feeding?.stoppedEatingWhenOwnerLeft),
    },
    walkContext: {
      walkType: normalizeWalkType(session.walkContext?.walkType),
      intensity: session.walkContext?.intensity ?? null,
      timingToSessionMinutes: Number.isFinite(session.walkContext?.timingToSessionMinutes) ? session.walkContext.timingToSessionMinutes : null,
      notes: session.walkContext?.notes ?? null,
    },
    dailyLoad: {
      otherTrainingDone: Boolean(session.dailyLoad?.otherTrainingDone),
      cognitiveLoad: session.dailyLoad?.cognitiveLoad ?? null,
      visitors: Boolean(session.dailyLoad?.visitors),
      grooming: Boolean(session.dailyLoad?.grooming),
      vetVisit: Boolean(session.dailyLoad?.vetVisit),
      noisyDay: Boolean(session.dailyLoad?.noisyDay),
      poorSleep: Boolean(session.dailyLoad?.poorSleep),
      longRealLifeAbsenceEarlier: Boolean(session.dailyLoad?.longRealLifeAbsenceEarlier),
      medicationOrCalmingAid: session.dailyLoad?.medicationOrCalmingAid ?? null,
      whoLeft: session.dailyLoad?.whoLeft ?? session.context?.whoLeft ?? null,
      anotherPersonStayed: Boolean(session.dailyLoad?.anotherPersonStayed ?? session.context?.anotherPersonStayed),
      location: session.dailyLoad?.location ?? session.context?.location ?? null,
      barrierUsed: Boolean(session.dailyLoad?.barrierUsed ?? session.context?.barrierUsed),
      mediaOn: Boolean(session.dailyLoad?.mediaOn ?? session.context?.mediaOn),
    },
    videoReview: {
      recorded: Boolean(session.videoReview?.recorded),
      firstSubtleDistressTs: session.videoReview?.firstSubtleDistressTs ?? null,
      firstActiveDistressTs: session.videoReview?.firstActiveDistressTs ?? null,
      eventTags: Array.isArray(session.videoReview?.eventTags) ? session.videoReview.eventTags : [],
      notes: session.videoReview?.notes ?? null,
      ratingConfidence: Number.isFinite(session.videoReview?.ratingConfidence) ? session.videoReview.ratingConfidence : null,
    },
  };
}

function computeSafeAloneTime(sessions = []) {
  const rich = sessions.map(toRichSession);
  const calm = rich.filter((s) => s.belowThreshold);
  if (!calm.length) return PROTOCOL.startDurationSeconds;
  const weighted = calm.reduce((sum, s) => sum + (Math.min(s.actualDuration, s.plannedDuration) * s.confidence), 0);
  const weight = calm.reduce((sum, s) => sum + s.confidence, 0);
  return Math.max(PROTOCOL.minDurationSeconds, Math.round(weighted / Math.max(weight, 1)));
}

function computeLatencyTrend(sessions = []) {
  const rich = sessions.map(toRichSession);
  if (rich.length < 4) return 0.5;
  const middle = Math.floor(rich.length / 2);
  const early = rich.slice(0, middle);
  const late = rich.slice(middle);
  const avg = (arr) => arr.reduce((sum, s) => sum + s.latencyToFirstDistress, 0) / Math.max(1, arr.length);
  const earlyLatency = avg(early);
  const lateLatency = avg(late);
  const trend = clamp((lateLatency - earlyLatency) / Math.max(earlyLatency, 30), -1, 1);
  return clamp01((trend + 1) / 2);
}

function computeStability(sessions = []) {
  const recent = getLatestSessions(sessions.map(toRichSession), PROTOCOL.calmWindow);
  if (!recent.length) return 0;
  const calmConsistency = recent.filter((s) => s.belowThreshold).length / recent.length;
  const subtlePenalty = recent.filter((s) => s.distressLevel === DISTRESS_LEVELS.SUBTLE).length / recent.length;
  const activePenalty = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length / recent.length;
  const latencyReliability = recent.reduce((sum, s) => sum + ratio(s.latencyToFirstDistress, s.plannedDuration), 0) / recent.length;
  return clamp01((calmConsistency * 0.45) + ((1 - subtlePenalty) * 0.2) + ((1 - activePenalty) * 0.2) + (latencyReliability * 0.15));
}

function computeMomentum(sessions = []) {
  const rich = sessions.map(toRichSession);
  if (rich.length < 4) return 0;
  const early = rich.slice(0, Math.floor(rich.length / 2));
  const late = rich.slice(Math.floor(rich.length / 2));
  const durationTrend = clamp((computeSafeAloneTime(late) - computeSafeAloneTime(early)) / Math.max(computeSafeAloneTime(early), 30), -1, 1);
  const latencyTrend = clamp((computeLatencyTrend(late) - computeLatencyTrend(early)), -1, 1);
  return clamp01((durationTrend * 0.55 + latencyTrend * 0.45 + 1) / 2);
}

function computeFoodEngagementUnderAbsence(sessions = []) {
  const rich = sessions.map(toRichSession).filter((s) => s.feeding.offeredDuringSession);
  if (!rich.length) return 0.5;
  return rich.reduce((sum, s) => sum + deriveFoodEngagement(s), 0) / rich.length;
}

function computeReadiness(sessions = [], now = new Date()) {
  const recent = getLatestSessions(sessions.map(toRichSession), 8);
  if (!recent.length) return 0.5;
  const calmRatio = recent.filter((s) => s.belowThreshold).length / recent.length;
  const distressLoad = recent.reduce((sum, s) => sum + getSeverity(s.distressLevel), 0) / recent.length;
  const loadRisk = recent.reduce((sum, s) => {
    const d = s.dailyLoad;
    return sum + (
      (d.noisyDay ? 0.15 : 0)
      + (d.poorSleep ? 0.2 : 0)
      + (d.vetVisit ? 0.2 : 0)
      + (d.longRealLifeAbsenceEarlier ? 0.2 : 0)
      + (d.visitors ? 0.1 : 0)
      + (d.otherTrainingDone ? 0.08 : 0)
    );
  }, 0) / recent.length;

  return clamp01((calmRatio * 0.5) + ((1 - distressLoad) * 0.3) + ((1 - loadRisk) * 0.2) - gapPenalty(sessions, now) * 0.2);
}

function computeRelapseRisk(sessions = [], realAbsences = [], now = new Date()) {
  const recent = getLatestSessions(sessions.map(toRichSession), PROTOCOL.confidenceSessionWindow);
  if (!recent.length) return 0.5;
  const distressLoad = recent.reduce((sum, s) => sum + getSeverity(s.distressLevel), 0) / recent.length;
  const activeOrSevere = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length / recent.length;
  const unstable = countStreak(recent, (s) => !s.belowThreshold || s.distressLevel !== DISTRESS_LEVELS.NONE);
  const recentReal = realAbsences.map(toRichSession).filter((s) => isWithinDays(s.date, 7, now.getTime()));
  const uncontrolledReal = recentReal.filter((s) => !s.belowThreshold).length;
  return clamp01((distressLoad * 0.3) + (activeOrSevere * 0.3) + (Math.min(1, unstable / 4) * 0.18) + (Math.min(1, uncontrolledReal / 2) * 0.14) + gapPenalty(sessions, now) * 0.08);
}

function computeAdherence(sessions = [], plan = {}, now = new Date()) {
  const cadenceDays = Math.max(1, Number(plan.targetCadenceDays || PROTOCOL.adherenceTargetGapDays));
  const recent = sessions.map(toRichSession).filter((s) => isWithinDays(s.date, 14, now.getTime()));
  if (!recent.length) return 0;
  const completed = recent.filter((s) => ratio(s.actualDuration, s.plannedDuration) >= 0.95).length;
  const cadenceTarget = Math.max(1, Math.floor(14 / cadenceDays));
  const cadenceScore = clamp01(recent.length / cadenceTarget);
  const completionScore = completed / recent.length;
  const planMatchScore = recent.filter((s) => {
    if (!Number(plan.recommendedDuration)) return true;
    return Math.abs(s.plannedDuration - plan.recommendedDuration) <= Math.max(10, plan.recommendedDuration * 0.25);
  }).length / recent.length;
  return clamp01((cadenceScore * 0.45) + (completionScore * 0.35) + (planMatchScore * 0.2));
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

function contextRiskScore(session) {
  return clamp01(
    (session.walkContext.walkType === "intense_exercise" ? 0.2 : 0)
    + (session.dailyLoad.noisyDay ? 0.2 : 0)
    + (session.dailyLoad.vetVisit ? 0.2 : 0)
    + (session.dailyLoad.poorSleep ? 0.15 : 0)
    + (session.dailyLoad.longRealLifeAbsenceEarlier ? 0.2 : 0)
    + (session.dailyLoad.visitors ? 0.1 : 0),
  );
}

function buildContextInsights(trainingSessions = []) {
  if (!trainingSessions.length) return [];
  const calm = trainingSessions.filter((s) => s.belowThreshold);
  const intense = trainingSessions.filter((s) => s.walkContext.walkType === "intense_exercise");
  const sniffy = trainingSessions.filter((s) => s.walkContext.walkType === "sniffy_decompression");
  const insight = [];

  if (sniffy.length >= 3) {
    const sniffyCalm = sniffy.filter((s) => s.belowThreshold).length / sniffy.length;
    if (sniffyCalm > 0.65) insight.push("Sessions after sniffy decompression walks trend calmer.");
  }

  if (intense.length >= 3) {
    const intenseActive = intense.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length / intense.length;
    if (intenseActive > 0.4) insight.push("Intense activity before sessions correlates with higher distress.");
  }

  const highLoad = trainingSessions.filter((s) => contextRiskScore(s) >= 0.4);
  if (highLoad.length >= 3) {
    const highLoadCalmRate = highLoad.filter((s) => s.belowThreshold).length / highLoad.length;
    if (highLoadCalmRate < 0.4) insight.push("High daily load conditions reduce session quality.");
  }

  if (calm.length / trainingSessions.length < 0.5) insight.push("Use stabilization blocks until calm rates recover.");
  return insight;
}

function getWindowLabel(dateIso) {
  const date = new Date(dateIso);
  const hour = date.getHours();
  if (hour < 11) return "morning";
  if (hour < 16) return "midday";
  if (hour < 20) return "evening";
  return "late_evening";
}

function bestAndWorstWindow(sessions = []) {
  const buckets = new Map();
  sessions.forEach((s) => {
    const key = getWindowLabel(s.date || new Date().toISOString());
    if (!buckets.has(key)) buckets.set(key, { total: 0, calm: 0, subtle: 0, active: 0 });
    const row = buckets.get(key);
    row.total += 1;
    if (s.belowThreshold) row.calm += 1;
    if (s.distressLevel === DISTRESS_LEVELS.SUBTLE) row.subtle += 1;
    if ([DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)) row.active += 1;
  });

  const scored = [...buckets.entries()].map(([key, val]) => {
    const calmRate = val.total ? val.calm / val.total : 0;
    const subtleRate = val.total ? val.subtle / val.total : 0;
    const activeRate = val.total ? val.active / val.total : 0;
    return { key, score: (calmRate * 0.6) + ((1 - subtleRate) * 0.2) + ((1 - activeRate) * 0.2), total: val.total };
  }).filter((x) => x.total >= 2);

  if (!scored.length) return { best: null, worst: null };
  scored.sort((a, b) => b.score - a.score);
  return { best: scored[0].key, worst: scored[scored.length - 1].key };
}

function getProgressionPhase(recent = [], stats = {}) {
  const activeRecent = recent.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length;
  const subtleRecent = recent.filter((s) => s.distressLevel === DISTRESS_LEVELS.SUBTLE).length;
  const calmStreak = countStreak(recent, (s) => s.belowThreshold && s.distressLevel === DISTRESS_LEVELS.NONE);

  if (activeRecent >= 2 || stats.relapseRisk >= 0.72) return "stabilization";
  if (subtleRecent >= 2 || stats.stabilityScore < 0.58) return "hold";
  if (calmStreak >= 3 && stats.stabilityScore >= PROTOCOL.largeStepStabilityGate && stats.relapseRisk < 0.4) return "progress_large";
  if (calmStreak >= 2 && stats.stabilityScore >= 0.65) return "progress_small";
  return "hold";
}

function computeDurationByPhase(safeAlone, last, phase, recent = []) {
  const lastPlan = Number(last?.plannedDuration || safeAlone);
  if (phase === "stabilization") return Math.round(safeAlone * 0.6);
  if (phase === "hold") return Math.round(Math.min(lastPlan, safeAlone));
  if (phase === "progress_large") return Math.round(safeAlone * 1.12);
  if (phase === "progress_small") return Math.round(safeAlone * 1.05);

  const fallbackStreak = countStreak(recent, (s) => s.belowThreshold);
  const pct = fallbackStreak >= 3 ? 0.1 : 0.03;
  return Math.round(safeAlone * (1 + pct));
}

export function calculateTrainingStats(sessions = [], options = {}) {
  const richSessions = sessions.map(toRichSession);
  const realAbsences = richSessions.filter((s) => s.departureType === "real_life");
  const trainingSessions = richSessions.filter((s) => s.departureType !== "real_life");
  const safeAloneTime = computeSafeAloneTime(trainingSessions);

  const calmSessionRate = trainingSessions.length ? trainingSessions.filter((s) => s.belowThreshold).length / trainingSessions.length : 0;
  const subtleDistressRate = trainingSessions.length ? trainingSessions.filter((s) => s.distressLevel === DISTRESS_LEVELS.SUBTLE).length / trainingSessions.length : 0;
  const activeDistressRate = trainingSessions.length ? trainingSessions.filter((s) => [DISTRESS_LEVELS.ACTIVE, DISTRESS_LEVELS.SEVERE].includes(s.distressLevel)).length / trainingSessions.length : 0;

  const averageLatency = trainingSessions.length
    ? trainingSessions.reduce((sum, s) => sum + s.latencyToFirstDistress, 0) / trainingSessions.length
    : 0;

  const cueSensitivity = buildCueStats(options.cueSessions || []);
  const foodEngagement = computeFoodEngagementUnderAbsence(trainingSessions);
  const readiness = computeReadiness(trainingSessions);

  return {
    safeAloneTime,
    bestRecentSafeAloneTime: safeAloneTime,
    latencyToDistressTrend: computeLatencyTrend(trainingSessions),
    averageLatencyToDistress: Math.round(averageLatency),
    calmSessionRate,
    subtleDistressRate,
    activeDistressRate,
    stabilityScore: computeStability(trainingSessions),
    momentumScore: computeMomentum(trainingSessions),
    relapseRisk: computeRelapseRisk(trainingSessions, realAbsences),
    adherenceScore: computeAdherence(trainingSessions, options.plan || {}),
    foodEngagementUnderAbsence: foodEngagement,
    cueSensitivity,
    contextInsights: buildContextInsights(trainingSessions),
    dailyReadinessScore: readiness,
  };
}

function chooseRecommendationType(last, phase, stats, recent, cueStats) {
  if (!last) return "keep_same_duration";
  if (cueStats[cueStats.length - 1]?.sensitivity >= 0.65) return "prioritize_cue_work";
  if (stats.dailyReadinessScore < 0.4) return "avoid_training_under_conditions";
  if (phase === "stabilization") return "switch_to_stabilization_block";
  if (phase === "hold") {
    if (last.distressLevel === DISTRESS_LEVELS.SUBTLE) return "repeat_current_step";
    return "keep_same_duration";
  }
  if (countStreak(recent, (s) => s.belowThreshold) % PROTOCOL.easySessionFrequency === 0) return "insert_easy_sessions";
  if (phase === "progress_large" || phase === "progress_small") return "keep_same_duration";
  return "reduce_duration";
}

export function buildRecommendation(sessions = [], options = {}) {
  const rich = sessions.map(toRichSession);
  const training = rich.filter((s) => s.departureType !== "real_life");
  const recent = getLatestSessions(training, PROTOCOL.calmWindow);
  const last = training[training.length - 1] || null;
  const stats = calculateTrainingStats(training, options);
  const safeAlone = stats.safeAloneTime || PROTOCOL.startDurationSeconds;
  const cueStats = buildCueStats(options.cueSessions || []);

  const phase = getProgressionPhase(recent, stats);
  let recommendedDuration = computeDurationByPhase(safeAlone, last, phase, recent);
  let recommendationType = chooseRecommendationType(last, phase, stats, recent, cueStats);

  if (recommendationType === "insert_easy_sessions") {
    recommendedDuration = Math.round(safeAlone * PROTOCOL.easySessionRatio);
  }

  const boundedDuration = clamp(recommendedDuration, PROTOCOL.minDurationSeconds, Number(options.goalSeconds || PROTOCOL.goalDurationDefaultSeconds));

  const panicPattern = getLatestSessions(training, 8).filter((s) => s.distressLevel === DISTRESS_LEVELS.SEVERE).length >= 2;
  const uncontrolledRealAbsence = rich.filter((s) => s.departureType === "real_life" && !s.belowThreshold).slice(-3).length >= 1;

  const warnings = [];
  if (panicPattern) warnings.push("Repeated severe distress markers. Pause escalation and consult a veterinarian/behavior professional.");
  if (uncontrolledRealAbsence) warnings.push("Recent real-life absence exceeded threshold. Lower confidence and use easier sessions.");
  if (stats.adherenceScore < 0.45) warnings.push("Practice consistency is low. Prioritize cadence and repetition.");
  if (stats.foodEngagementUnderAbsence < 0.35) warnings.push("Food engagement under absence is low; food may be neutral or misleading support right now.");

  const windows = bestAndWorstWindow(training);
  const readinessBand = stats.dailyReadinessScore >= 0.7 ? "high" : stats.dailyReadinessScore >= 0.45 ? "moderate" : "low";

  if (recommendationType === "prioritize_cue_work") {
    recommendationType = "prioritize_cue_work_first";
  }

  return {
    recommendedDuration: boundedDuration,
    recommendationType,
    progressionPhase: phase,
    stabilizationMode: phase === "stabilization",
    stats,
    warnings,
    safeAbsenceAlert: Number(options.plannedRealAbsenceSeconds || 0) > safeAlone,
    scheduler: {
      bestTimeOfDayWindow: windows.best,
      worstTimeOfDayWindow: windows.worst,
      bestPostWalkWindow: "derived_from_data",
      bestPostFeedingWindow: "derived_from_data",
      dailyReadinessBand: readinessBand,
      unmetNeedsRisk: clamp01(1 - stats.dailyReadinessScore),
      overstimulationRisk: clamp01(stats.activeDistressRate + (1 - stats.dailyReadinessScore) * 0.4),
    },
  };
}

export function getNextDurationSeconds(lastSuccessfulDurationSec, options = {}) {
  const fallbackSafe = Number(lastSuccessfulDurationSec) > 0 ? Number(lastSuccessfulDurationSec) : PROTOCOL.startDurationSeconds;
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
  const intenseRatio = recentWalks.filter((w) => normalizeWalkType(w.type) === "intense_exercise").length / recentWalks.length;
  const sniffyRatio = recentWalks.filter((w) => normalizeWalkType(w.type) === "sniffy_decompression").length / recentWalks.length;

  if (intenseRatio > 0.6 && recommendation.stats.dailyReadinessScore < 0.65) {
    return Math.max(PROTOCOL.minDurationSeconds, Math.round(recommendation.recommendedDuration * 0.93));
  }
  if (sniffyRatio > 0.5 && recommendation.stats.stabilityScore > 0.7) {
    return Math.round(recommendation.recommendedDuration * 1.02);
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
