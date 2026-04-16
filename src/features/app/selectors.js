import { PROTOCOL, getCalmStreak, getDistressCounts, getRecentHighDistressSummary } from "../../lib/protocol";
import { hasValidDate, sortValidDateAsc, toTimestampOrNull } from "../../lib/dateSort";
import { dailyInfo, distressLabel, fmt, getInformationalTone, getLeaveProfile, getRiskTone, isToday, patternInfo, toDayKey } from "./helpers";

const hasValue = (value) => value !== null && value !== undefined;
const toSortableTimestamp = (value) => toTimestampOrNull(value) ?? Number.NEGATIVE_INFINITY;
const resolveActivityDate = (entry = {}) => (
  entry?.date
  ?? entry?.updatedAt
  ?? entry?.updated_at
  ?? entry?.createdAt
  ?? entry?.created_at
  ?? null
);
const YESTERDAY_MS = 24 * 60 * 60 * 1000;

export function buildProgressInsights({
  chartData = [],
  canonicalSessions = [],
  recommendationDuration = null,
  lastPlannedDuration = null,
  decisionState = null,
  streak = 0,
}) {
  const insights = [];
  const pushInsight = (insight) => {
    if (!insight || insights.some((existing) => existing.id === insight.id)) return;
    insights.push(insight);
  };

  const durations = chartData
    .map((item) => Number(item.durationSeconds))
    .filter((value) => Number.isFinite(value));
  const recentSlice = durations.slice(-4);
  const previousSlice = durations.slice(-8, -4);
  const recentAvg = recentSlice.length
    ? recentSlice.reduce((sum, value) => sum + value, 0) / recentSlice.length
    : null;
  const previousAvg = previousSlice.length
    ? previousSlice.reduce((sum, value) => sum + value, 0) / previousSlice.length
    : null;

  const lastSession = canonicalSessions.at(-1);
  const prevSession = canonicalSessions.at(-2);
  const lastSessionTime = new Date(resolveActivityDate(lastSession)).getTime();
  const now = Date.now();
  const happenedYesterday = Number.isFinite(lastSessionTime)
    && (now - lastSessionTime) >= YESTERDAY_MS
    && (now - lastSessionTime) < (YESTERDAY_MS * 2);
  const wasHighStress = ["active", "severe"].includes(lastSession?.distressLevel);
  const pushedTooFast = Number.isFinite(lastSession?.actualDuration)
    && Number.isFinite(prevSession?.actualDuration)
    && lastSession.actualDuration > prevSession.actualDuration * 1.2
    && wasHighStress;

  if (happenedYesterday && pushedTooFast) {
    pushInsight({
      id: "yesterday-pacing",
      tone: "caution",
      message: "You pushed too fast yesterday.",
      detail: "Last session spiked with stress, so today should stay gentler.",
    });
  }

  if (Number.isFinite(lastPlannedDuration) && Number.isFinite(recommendationDuration) && recommendationDuration < lastPlannedDuration) {
    pushInsight({
      id: "reduced-time",
      tone: "caution",
      message: "Time was reduced to protect calmness.",
      detail: `Target shifted from ${fmt(lastPlannedDuration)} to ${fmt(recommendationDuration)} for steadier confidence.`,
    });
  }

  if (previousAvg != null && recentAvg != null && recentAvg > previousAvg * 1.05 && previousAvg > 0) {
    pushInsight({
      id: "recovering",
      tone: "positive",
      message: "Progress is recovering.",
      detail: `Recent sessions are trending longer (${fmt(Math.round(recentAvg))} average).`,
    });
  }

  if (streak >= 2 && decisionState?.uiTone !== "risk_high") {
    pushInsight({
      id: "stable-streak",
      tone: "positive",
      message: "Stable streak restored.",
      detail: streak >= 4
        ? `${streak} calm sessions in a row are reinforcing predictability.`
        : "Consecutive calm sessions are rebuilding rhythm.",
    });
  }

  if (!insights.length && recentAvg != null && previousAvg != null) {
    pushInsight({
      id: "steady-base",
      tone: "neutral",
      message: "Progress is holding steady.",
      detail: "Consistency is more important than bigger jumps right now.",
    });
  }

  return insights.slice(0, 3);
}

const statusTone = (value, { good, warn, invert = false }) => {
  if (value == null) return getInformationalTone("neutral");
  if (!invert) {
    if (value >= good) return getInformationalTone("stable");
    if (value >= warn) return { ...getRiskTone("medium"), label: "Mixed", surfaceState: "upcoming" };
    return { ...getRiskTone("high"), label: "Watch closely", surfaceState: "overdue" };
  }
  if (value <= good) return getInformationalTone("stable");
  if (value <= warn) return { ...getRiskTone("medium"), label: "Variable", surfaceState: "upcoming" };
  return { ...getRiskTone("high"), label: "Unsteady", surfaceState: "overdue" };
};

export function selectAppData({ dogs, activeDogId, sessions, walks, patterns, feedings, target, protoOverride, recommendation }) {
  const canonicalSessions = sortValidDateAsc(sessions);
  const dog = dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase());
  const name = dog?.dogName ?? "your dog";
  const goalSec = dog?.goalSeconds ?? 2400;
  const goalPct = Math.min((target / goalSec) * 100, 100);
  const activeProto = { ...PROTOCOL, ...protoOverride };

  const daily = dailyInfo(canonicalSessions);
  const capPct = Math.min((daily.usedSec / daily.capSec) * 100, 100);
  const leaveProfile = getLeaveProfile(dog?.leavesPerDay);
  const pattern = patternInfo(patterns, walks, dog?.leavesPerDay, activeProto);
  const unifiedRecommendation = recommendation || {
    duration: target,
    decisionState: null,
    explanation: "",
    details: {},
  };

  const patReminderText = (() => {
    if (pattern.todayPat === 0) {
      return `Do ${pattern.recMin}–${pattern.recMax} pattern breaks today (based on ~${pattern.normalizedLeaves} daily leave${pattern.normalizedLeaves === 1 ? "" : "s"}) — spread throughout the day, NOT linked to actual walks. Put on shoes (or jacket, or pick up keys), then take them off and sit back down. This teaches ${name} that these actions don't always mean you're leaving.`;
    }
    if (pattern.behind) {
      const deficit = pattern.needed - pattern.todayPat;
      return `You've logged ${pattern.todayWalks} walk${pattern.todayWalks !== 1 ? "s" : ""} but only ${pattern.todayPat} pattern break${pattern.todayPat !== 1 ? "s" : ""}. Do ${deficit} more — with ~${pattern.normalizedLeaves} daily departures we add ${pattern.walkBuffer} extra pattern-break cues so pattern breaks clearly outnumber full departures.`;
    }
    if (pattern.todayPat >= pattern.recMax) return `${pattern.todayPat} pattern breaks done today — great work! Cues are losing their power.`;
    return `${pattern.todayPat} of ${pattern.recMin}–${pattern.recMax} pattern breaks done for a ${leaveProfile.desc}. Do a few more at random times — not before walks, just scattered through the day.`;
  })();

  const totalCount = canonicalSessions.length;
  const bestCalm = canonicalSessions.filter((s) => s.distressLevel === "none").reduce((m, s) => Math.max(m, s.actualDuration), 0);
  const avgWalkDuration = walks.length ? walks.reduce((sum, w) => sum + (Number.isFinite(w.duration) ? w.duration : 0), 0) / walks.length : null;
  const uniqueSessionDays = new Set(canonicalSessions.map((s) => toDayKey(s.date)).filter(Boolean));
  const uniqueWalkDays = new Set(walks.map((w) => toDayKey(w.date)).filter(Boolean));
  const avgSessionsPerDay = uniqueSessionDays.size ? totalCount / uniqueSessionDays.size : null;
  const avgWalksPerDay = uniqueWalkDays.size ? walks.length / uniqueWalkDays.size : null;
  const recentWeekCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const aloneLastWeek = canonicalSessions.reduce((sum, s) => {
    const ts = new Date(s.date).getTime();
    if (!Number.isFinite(ts) || ts < recentWeekCutoff) return sum;
    return sum + (Number.isFinite(s.actualDuration) ? s.actualDuration : 0);
  }, 0);
  const streak = getCalmStreak(canonicalSessions);
  const lastSess = canonicalSessions[canonicalSessions.length - 1];

  const recommendationCoverageCount = canonicalSessions.filter((s) =>
    (hasValue(s.context?.timeOfDay) || hasValue(s.context?.departureType) || (Array.isArray(s.context?.cuesUsed) && s.context.cuesUsed.length > 0))
    && ["barking", "pacing", "destructive", "salivation"].some((k) => hasValue(s.symptoms?.[k]))
    && hasValue(s.recoverySeconds)
    && (hasValue(s.preSession?.walkDuration) || hasValue(s.preSession?.enrichmentGiven))
    && hasValue(s.environment?.noiseEvent)
  ).length;
  const recommendationCoveragePct = totalCount ? Math.round((recommendationCoverageCount / totalCount) * 100) : 0;

  const calcWindowCalmRate = (days) => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const windowSessions = canonicalSessions.filter((s) => {
      const d = new Date(s.date);
      return !isNaN(d) && d >= cutoff;
    });
    if (!windowSessions.length) return null;
    const calm = windowSessions.filter((s) => s.distressLevel === "none").length;
    return Math.round((calm / windowSessions.length) * 100);
  };
  const calmRate7 = calcWindowCalmRate(7);
  const calmRate14 = calcWindowCalmRate(14);

  const doseMultiplier = leaveProfile.confidenceScale;
  const adjustedTarget = Math.max(activeProto.startDurationSeconds, Math.round(target * doseMultiplier));
  const recommendationConfidence = (() => {
    if (!canonicalSessions.length) return "building";
    const recent = canonicalSessions.slice(-8);
    const calmRecent = recent.filter((s) => s.distressLevel === "none").length;
    const subtleRecent = recent.filter((s) => s.distressLevel === "subtle").length;
    const activeRecent = recent.filter((s) => s.distressLevel === "active").length;
    const severeRecent = recent.filter((s) => s.distressLevel === "severe").length;
    const sessionVolumeScore = Math.min(1, canonicalSessions.length / 12);
    const qualityScore = Math.max(0, Math.min(1, (calmRecent + (subtleRecent * 0.45) - (activeRecent * 0.7) - (severeRecent * 0.9)) / Math.max(1, recent.length)));
    const streakScore = Math.min(1, streak / 5);
    const weighted = (sessionVolumeScore * 0.3) + (qualityScore * 0.5) + (streakScore * 0.2);
    if (weighted >= 0.72) return "strong";
    if (weighted >= 0.42) return "stable";
    return "building";
  })();

  const calmDurations = canonicalSessions.filter((s) => s.distressLevel === "none" && Number.isFinite(s.actualDuration)).map((s) => s.actualDuration).slice(-11);
  const calmMedian = (() => {
    if (!calmDurations.length) return null;
    const sorted = [...calmDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  })();
  const durationVariability = (() => {
    const durations = canonicalSessions.map((s) => s.actualDuration).filter((n) => Number.isFinite(n));
    if (durations.length < 2) return null;
    const mean = durations.reduce((sum, n) => sum + n, 0) / durations.length;
    const variance = durations.reduce((sum, n) => sum + ((n - mean) ** 2), 0) / durations.length;
    return Math.round(Math.sqrt(variance));
  })();

  const recentHighDistress = getRecentHighDistressSummary(canonicalSessions);
  const decisionState = unifiedRecommendation.decisionState || null;

  const trainingReadiness = (() => {
    if (decisionState?.readiness === "high") return { level: "HIGH", ...getInformationalTone("improving") };
    if (decisionState?.readiness === "moderate") return { level: "MEDIUM", ...getInformationalTone("stable") };
    if (decisionState?.readiness === "guarded") return { level: "GUARDED", ...getRiskTone("medium"), label: "Guarded" };
    if (decisionState?.readiness === "low") return { level: "LOW", ...getRiskTone("high") };
    return { level: "BUILDING", ...getInformationalTone("neutral"), label: "Building baseline" };
  })();

  const adherenceByDay = (() => {
    const dayMap = new Map();
    walks.forEach((w) => {
      const key = toDayKey(w.date);
      if (!key) return;
      if (!dayMap.has(key)) dayMap.set(key, { walks: 0, pats: 0 });
      dayMap.get(key).walks += 1;
    });
    patterns.forEach((p) => {
      const key = toDayKey(p.date);
      if (!key) return;
      if (!dayMap.has(key)) dayMap.set(key, { walks: 0, pats: 0 });
      dayMap.get(key).pats += 1;
    });
    const days = [...dayMap.values()];
    if (!days.length) return null;
    const score = days.reduce((sum, day) => {
      if (day.walks === 0 && day.pats > 0) return sum + 1;
      if (day.walks === 0) return sum;
      return sum + Math.min(day.pats / day.walks, 1);
    }, 0) / days.length;
    return Math.round(score * 100);
  })();

  const momentumTone = statusTone(calmRate7, { good: 75, warn: 55 });
  const stabilityTone = statusTone(durationVariability, { good: 120, warn: 240, invert: true });
  const adherenceTone = statusTone(adherenceByDay, { good: 85, warn: 65 });
  const relapseTone = (() => {
    return getRiskTone(decisionState?.riskLevel || "medium");
  })();

  const chartData = canonicalSessions.slice(-25).map((s, i) => ({
    session: i + 1,
    durationSeconds: s.actualDuration,
    durationMinutes: Math.round(s.actualDuration / 60 * 10) / 10,
    distressLevel: s.distressLevel,
  }));
  const currentThreshold = target;
  const lastPlannedDuration = Number.isFinite(lastSess?.plannedDuration) ? lastSess.plannedDuration : null;
  const headlineStatus = (() => {
    return decisionState?.statusLabel || "Stable";
  })();
  const headlineStatusTone = decisionState?.uiTone === "risk_high"
    ? { ...getRiskTone("high"), label: headlineStatus, surfaceState: "overdue" }
    : decisionState?.uiTone === "informational_improving"
      ? { ...getInformationalTone("improving"), surfaceState: "upcoming" }
      : { ...getInformationalTone("stable"), surfaceState: "today" };
  const chartTrendLabel = (() => {
    const recentDurations = chartData.map((item) => item.durationSeconds).filter((value) => Number.isFinite(value));
    if (recentDurations.length < 4) return "Trend: Plateau";
    const recentSlice = recentDurations.slice(-4);
    const previousSlice = recentDurations.slice(-8, -4);
    if (!previousSlice.length) return "Trend: Plateau";
    const recentAvg = recentSlice.reduce((sum, value) => sum + value, 0) / recentSlice.length;
    const previousAvg = previousSlice.reduce((sum, value) => sum + value, 0) / previousSlice.length;
    if (recentAvg > previousAvg * 1.08) return "Trend: Improving";
    if (recentAvg < previousAvg * 0.92) return "Trend: Declining";
    return "Trend: Plateau";
  })();
  const contextualInsights = buildProgressInsights({
    chartData,
    canonicalSessions,
    recommendationDuration: unifiedRecommendation?.duration,
    lastPlannedDuration,
    decisionState,
    streak,
  });

  const timeline = [
    ...canonicalSessions
      .filter((s) => hasValidDate(resolveActivityDate(s)))
      .map((s, idx) => ({ kind: "session", date: resolveActivityDate(s), data: s, sourceOrder: idx })),
    ...walks.map((w, idx) => ({ kind: "walk", date: resolveActivityDate(w), data: w, sourceOrder: idx })),
    ...patterns.map((p, idx) => ({ kind: "pat", date: resolveActivityDate(p), data: p, sourceOrder: idx })),
    ...feedings.map((f, idx) => ({ kind: "feeding", date: resolveActivityDate(f), data: f, sourceOrder: idx })),
  ]
    .filter((entry) => entry?.data?.id)
    .sort((a, b) => {
      const byDateDesc = toSortableTimestamp(b.date) - toSortableTimestamp(a.date);
      if (byDateDesc !== 0) return byDateDesc;
      return a.sourceOrder - b.sourceOrder;
    });

  const distressCounts = getDistressCounts(canonicalSessions);

  return {
    dog,
    name,
    goalSec,
    goalPct,
    activeProto,
    daily,
    capPct,
    leaveProfile,
    pattern,
    recommendation: unifiedRecommendation,
    patReminderText,
    totalCount,
    bestCalm,
    avgWalkDuration,
    avgSessionsPerDay,
    avgWalksPerDay,
    aloneLastWeek,
    streak,
    lastSess,
    recommendationCoverageCount,
    recommendationCoveragePct,
    calmRate7,
    calmRate14,
    adjustedTarget,
    recommendationConfidence,
    calmMedian,
    durationVariability,
    recentHighDistress,
    trainingReadiness,
    adherenceByDay,
    momentumTone,
    stabilityTone,
    adherenceTone,
    relapseTone,
    chartData,
    currentThreshold,
    lastPlannedDuration,
    headlineStatus,
    headlineStatusTone,
    chartTrendLabel,
    contextualInsights,
    timeline,
    distressCounts,
    distressLabel,
  };
}
