import { PROTOCOL, explainNextTarget, getCalmStreak, getDistressCounts, getRecentHighDistressSummary, normalizeDistressLevel } from "../../lib/protocol";
import { dailyInfo, distressLabel, fmt, getInformationalTone, getLeaveProfile, getRiskTone, isToday, patternInfo, toDayKey } from "./helpers";

const hasValue = (value) => value !== null && value !== undefined;

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

export function selectAppData({ dogs, activeDogId, sessions, walks, patterns, feedings, target, protoOverride }) {
  const dog = dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase());
  const name = dog?.dogName ?? "your dog";
  const goalSec = dog?.goalSeconds ?? 2400;
  const goalPct = Math.min((target / goalSec) * 100, 100);
  const activeProto = { ...PROTOCOL, ...protoOverride };

  const daily = dailyInfo(sessions);
  const capPct = Math.min((daily.usedSec / daily.capSec) * 100, 100);
  const leaveProfile = getLeaveProfile(dog?.leavesPerDay);
  const pattern = patternInfo(patterns, walks, dog?.leavesPerDay, activeProto);
  const nextTargetInfo = explainNextTarget(sessions, walks, patterns, dog || {});

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

  const trainingReadiness = (() => {
    const now = Date.now();
    const lastWalk = walks.length ? walks[walks.length - 1] : null;
    const lastWalkTs = lastWalk ? new Date(lastWalk.date).getTime() : NaN;
    const walkToday = walks.some((w) => isToday(w.date));
    const walkWithinTwoHours = Number.isFinite(lastWalkTs) && ((now - lastWalkTs) <= (2 * 60 * 60 * 1000));
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null;
    const lastSessionLevel = normalizeDistressLevel(lastSession?.distressLevel);
    const lastSessionTs = lastSession ? new Date(lastSession.date).getTime() : NaN;
    const minutesSinceLastSession = Number.isFinite(lastSessionTs) ? ((now - lastSessionTs) / 60000) : null;
    if (!walkToday || ["active", "severe"].includes(lastSessionLevel) || (minutesSinceLastSession != null && minutesSinceLastSession < 5)) {
      return { level: "LOW", ...getRiskTone("low") };
    }
    if (walkWithinTwoHours && lastSessionLevel === "none" && (minutesSinceLastSession == null || minutesSinceLastSession >= 10)) {
      return { level: "HIGH", ...getRiskTone("high") };
    }
    return { level: "MEDIUM", ...getRiskTone("medium") };
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
    if (recentHighDistress.relapseRisk) return getRiskTone("high");
    if (recentHighDistress.highDistressCount === 1 || recentHighDistress.recentSessions.length < recentHighDistress.window) {
      return getRiskTone("medium");
    }
    return getRiskTone("low");
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
    if (recentHighDistress.relapseRisk || recentHighDistress.severeCount > 0 || momentumTone.label === "Watch closely") return "Needs attention";
    if ((calmRate7 != null && calmRate14 != null && calmRate7 > calmRate14) || streak >= 3 || bestCalm >= currentThreshold) return "Improving";
    return "Stable";
  })();
  const headlineStatusTone = headlineStatus === "Needs attention"
    ? { ...getRiskTone("high"), label: headlineStatus, surfaceState: "overdue" }
    : headlineStatus === "Improving"
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
    ...sessions.map((s) => ({ kind: "session", date: s.date, data: s })),
    ...walks.map((w) => ({ kind: "walk", date: w.date, data: w })),
    ...patterns.map((p) => ({ kind: "pat", date: p.date, data: p })),
    ...feedings.map((f) => ({ kind: "feeding", date: f.date, data: f })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

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
    nextTargetInfo,
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
