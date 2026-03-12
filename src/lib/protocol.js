export const PROTOCOL = {
  sessionsPerDayDefault:                    1,
  sessionsPerDayMax:                        5,
  trainingDaysPerWeekDefault:               5,
  restDaysPerWeekMin:                       1,
  restDaysPerWeekRecommended:               2,
  startDurationSeconds:                     30,
  incrementPercentMin:                      10,
  incrementPercentMax:                      20,
  incrementPercentDefault:                  15,
  microstepCeilingMinutes:                  40,
  maxDailyAloneMinutes:                     30,
  desensitizationBlocksPerDayRecommendedMin: 3,
  desensitizationBlocksPerDayRecommendedMax: 5,
  desensitizationBlocksPerDayMax:           12,
  cuesPerBlockMin:                          2,
  cuesPerBlockMax:                          5,
  minPauseBetweenBlocksMinutes:             30,
};

export function getNextDurationSeconds(lastSuccessfulDurationSec) {
  if (!lastSuccessfulDurationSec || lastSuccessfulDurationSec <= 0)
    return PROTOCOL.startDurationSeconds;
  const lastMin = lastSuccessfulDurationSec / 60;
  if (lastMin <= PROTOCOL.microstepCeilingMinutes) {
    return Math.round(lastSuccessfulDurationSec * (1 + PROTOCOL.incrementPercentDefault / 100));
  }
  return Math.round((lastMin + 5) * 60);
}

export function suggestNext(sessions, dog) {
  const goalSec = dog?.goalSeconds ?? 7200;
  if (!sessions.length) {
    const start = dog?.currentMaxCalm
      ? Math.round(dog.currentMaxCalm * 0.8)
      : PROTOCOL.startDurationSeconds;
    return Math.max(start, PROTOCOL.startDurationSeconds);
  }

  const last = sessions[sessions.length - 1];
  const successful = sessions.filter((s) => s.distressLevel === "none");

  if (last.distressLevel === "none") {
    const completed = (last.actualDuration || 0) >= (last.plannedDuration || 0);
    if (completed) {
      const next = getNextDurationSeconds(last.plannedDuration);
      return Math.min(next, goalSec);
    }
    return last.plannedDuration;
  }

  if (last.distressLevel === "mild") return last.plannedDuration;

  if (!successful.length) return PROTOCOL.startDurationSeconds;
  const rollbackIdx = Math.max(successful.length - 2, 0);
  return Math.max(successful[rollbackIdx].plannedDuration, PROTOCOL.startDurationSeconds);
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toDayKey = (value) => startOfDay(value).toISOString().slice(0, 10);

const inLastDays = (iso, days, now = new Date()) => {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  const floor = startOfDay(now).getTime() - (days - 1) * DAY_MS;
  return time >= floor;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const getRecentSessions = (sessions, count = 7) => sessions.slice(-count);

const getLastStableCalmDuration = (sessions) => {
  const reverse = [...sessions].reverse();
  const completedCalm = reverse.find(
    (s) => s?.distressLevel === "none" && (s.actualDuration || 0) >= (s.plannedDuration || 0),
  );
  if (completedCalm?.plannedDuration) return completedCalm.plannedDuration;
  const calm = reverse.find((s) => s?.distressLevel === "none");
  if (calm?.plannedDuration) return calm.plannedDuration;
  return PROTOCOL.startDurationSeconds;
};

export function suggestNextWithContext(sessions = [], walks = [], patterns = [], dog = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) return suggestNext([], dog);

  const goalSec = dog?.goalSeconds ?? 7200;
  const now = new Date();
  const last = sessions[sessions.length - 1];
  const lastPlanned = Math.max(last?.plannedDuration || 0, PROTOCOL.startDurationSeconds);

  const recent7Day = sessions.filter((s) => inLastDays(s.date, 7, now));
  const calmRatio7d = recent7Day.length
    ? recent7Day.filter((s) => s.distressLevel === "none").length / recent7Day.length
    : 0.5;

  const recentSessions = getRecentSessions(sessions, 7);
  const completionRatio = recentSessions.length
    ? recentSessions.reduce((sum, s) => {
      const planned = s?.plannedDuration || 0;
      if (planned <= 0) return sum;
      return sum + clamp01((s?.actualDuration || 0) / planned);
    }, 0) / recentSessions.length
    : 0.5;

  const last3 = getRecentSessions(sessions, 3);
  const strongDistressPenalty = last3.some((s) => s.distressLevel === "strong") ? 1 : 0;

  const patternsByDay = new Map();
  patterns.forEach((p) => {
    const key = toDayKey(p.date);
    patternsByDay.set(key, (patternsByDay.get(key) || 0) + 1);
  });

  const walksByDay = new Map();
  walks.forEach((w) => {
    const key = toDayKey(w.date);
    walksByDay.set(key, (walksByDay.get(key) || 0) + 1);
  });

  const dayAdherence = (offset) => {
    const day = new Date(startOfDay(now).getTime() - offset * DAY_MS);
    const key = toDayKey(day);
    const done = patternsByDay.get(key) || 0;
    const walkCount = walksByDay.get(key) || 0;
    const needed = Math.max(PROTOCOL.desensitizationBlocksPerDayRecommendedMin, walkCount);
    return clamp01(done / Math.max(needed, 1));
  };

  const todayAdherence = dayAdherence(0);
  const rolling3Adherence = (dayAdherence(0) + dayAdherence(1) + dayAdherence(2)) / 3;

  const sessionsByDay = new Map();
  const aloneByDay = new Map();
  sessions.forEach((s) => {
    const key = toDayKey(s.date);
    sessionsByDay.set(key, (sessionsByDay.get(key) || 0) + 1);
    aloneByDay.set(key, (aloneByDay.get(key) || 0) + (s.actualDuration || 0));
  });

  const overloadLimitCount = dog?.sessionsPerDayMax || PROTOCOL.sessionsPerDayMax;
  const overloadLimitSec = (dog?.maxDailyAloneMinutes || PROTOCOL.maxDailyAloneMinutes) * 60;
  const todayKey = toDayKey(now);
  const overloadToday =
    (sessionsByDay.get(todayKey) || 0) > overloadLimitCount
    || (aloneByDay.get(todayKey) || 0) > overloadLimitSec;

  const recentOverload = [0, 1, 2].some((offset) => {
    const day = new Date(startOfDay(now).getTime() - offset * DAY_MS);
    const key = toDayKey(day);
    return (sessionsByDay.get(key) || 0) > overloadLimitCount
      || (aloneByDay.get(key) || 0) > overloadLimitSec;
  });
  const overloadPenalty = overloadToday ? 1 : recentOverload ? 0.5 : 0;

  const confidence = clamp01(
    calmRatio7d * 0.3
    + completionRatio * 0.25
    + todayAdherence * 0.15
    + rolling3Adherence * 0.15
    + (1 - strongDistressPenalty) * 0.1
    + (1 - overloadPenalty) * 0.05,
  );

  if (confidence >= 0.72) {
    return Math.min(getNextDurationSeconds(lastPlanned), goalSec);
  }

  if (confidence >= 0.45) {
    return Math.min(lastPlanned, goalSec);
  }

  return Math.min(Math.max(getLastStableCalmDuration(sessions), PROTOCOL.startDurationSeconds), goalSec);
}
