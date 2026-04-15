import { PROTOCOL, getCalmStreak, getDistressCounts, getRecentHighDistressSummary } from "../../lib/protocol";
import { dailyInfo, distressLabel, fmt, getInformationalTone, getLeaveProfile, getRiskTone, isToday, patternInfo, toDayKey } from "./helpers";

const hasValue = (value) => value !== null && value !== undefined;
const toSortableTimestamp = (value) => {
  const parsed = new Date(value ?? "").getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};
const resolveActivityDate = (entry = {}) => (
  entry?.date
  ?? entry?.updatedAt
  ?? entry?.updated_at
  ?? entry?.createdAt
  ?? entry?.created_at
  ?? null
);

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
  const dog = dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase());
  const name = dog?.dogName ?? "your dog";
  const goalSec = dog?.goalSeconds ?? 2400;
  const goalPct = Math.min((target / goalSec) * 100, 100);
  const activeProto = { ...PROTOCOL, ...protoOverride };

  const daily = dailyInfo(sessions);
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

  const totalCount = sessions.length;
  const bestCalm = sessions.filter((s) => s.distressLevel === "none").reduce((m, s) => Math.max(m, s.actualDuration), 0);
  const avgWalkDuration = walks.length ? walks.reduce((sum, w) => sum + (Number.isFinite(w.duration) ? w.duration : 0), 0) / walks.length : null;
  const uniqueSessionDays = new Set(sessions.map((s) => toDayKey(s.date)).filter(Boolean));
  const uniqueWalkDays = new Set(walks.map((w) => toDayKey(w.date)).filter(Boolean));
  const avgSessionsPerDay = uniqueSessionDays.size ? totalCount / uniqueSessionDays.size : null;
  const avgWalksPerDay = uniqueWalkDays.size ? walks.length / uniqueWalkDays.size : null;
  const recentWeekCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const aloneLastWeek = sessions.reduce((sum, s) => {
    const ts = new Date(s.date).getTime();
    if (!Number.isFinite(ts) || ts < recentWeekCutoff) return sum;
    return sum + (Number.isFinite(s.actualDuration) ? s.actualDuration : 0);
  }, 0);
  const streak = getCalmStreak(sessions);
  const lastSess = sessions[sessions.length - 1];

  const recommendationCoverageCount = sessions.filter((s) =>
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
    const windowSessions = sessions.filter((s) => {
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
    if (!sessions.length) return "building";
    const recent = sessions.slice(-8);
    const calmRecent = recent.filter((s) => s.distressLevel === "none").length;
    const subtleRecent = recent.filter((s) => s.distressLevel === "subtle").length;
    const activeRecent = recent.filter((s) => s.distressLevel === "active").length;
    const severeRecent = recent.filter((s) => s.distressLevel === "severe").length;
    const sessionVolumeScore = Math.min(1, sessions.length / 12);
    const qualityScore = Math.max(0, Math.min(1, (calmRecent + (subtleRecent * 0.45) - (activeRecent * 0.7) - (severeRecent * 0.9)) / Math.max(1, recent.length)));
    const streakScore = Math.min(1, streak / 5);
    const weighted = (sessionVolumeScore * 0.3) + (qualityScore * 0.5) + (streakScore * 0.2);
    if (weighted >= 0.72) return "strong";
    if (weighted >= 0.42) return "stable";
    return "building";
  })();

  const calmDurations = sessions.filter((s) => s.distressLevel === "none" && Number.isFinite(s.actualDuration)).map((s) => s.actualDuration).slice(-11);
  const calmMedian = (() => {
    if (!calmDurations.length) return null;
    const sorted = [...calmDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  })();
  const durationVariability = (() => {
    const durations = sessions.map((s) => s.actualDuration).filter((n) => Number.isFinite(n));
    if (durations.length < 2) return null;
    const mean = durations.reduce((sum, n) => sum + n, 0) / durations.length;
    const variance = durations.reduce((sum, n) => sum + ((n - mean) ** 2), 0) / durations.length;
    return Math.round(Math.sqrt(variance));
  })();

  const recentHighDistress = getRecentHighDistressSummary(sessions);
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

  const chartData = sessions.slice(-25).map((s, i) => ({
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

  const timeline = [
    ...sessions.map((s, idx) => ({ kind: "session", date: resolveActivityDate(s), data: s, sourceOrder: idx })),
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

  const distressCounts = getDistressCounts(sessions);

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
    timeline,
    distressCounts,
    distressLabel,
  };
}
