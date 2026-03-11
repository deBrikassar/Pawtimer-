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
