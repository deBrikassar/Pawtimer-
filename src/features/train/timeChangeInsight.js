import { fmtClock } from "../app/helpers";

function isNumber(value) {
  return Number.isFinite(Number(value));
}

export function buildTrainTimeChangeInsight({
  previousDuration,
  recommendedDuration,
  recommendationType,
  distressLevel,
  dogName,
}) {
  if (!isNumber(previousDuration) || !isNumber(recommendedDuration)) return null;

  const previous = Number(previousDuration);
  const next = Number(recommendedDuration);
  const formattedNext = fmtClock(next);
  const name = dogName || "your dog";
  const dropped = next < previous;
  const increased = next > previous;
  const recommendationReason = (() => {
    if (recommendationType === "decrease_duration") return `${name} showed stress signs in the last rep, so we stepped down.`;
    if (recommendationType === "increase_duration") return `Recent calm reps looked stable, so we added a small amount of time.`;
    if (recommendationType === "maintain_duration") return `Recent results were mixed, so we held steady.`;
    if (recommendationType === "cap_by_daily_limit") return `Today's daily limit is near, so we kept this target conservative.`;
    if (recommendationType === "floor_at_start_duration") return `We kept the minimum starter duration to protect confidence.`;
    return "";
  })();

  if (!dropped && !increased && recommendationType !== "recovery_mode_active" && recommendationType !== "recovery_mode_resume" && !recommendationReason) {
    return null;
  }

  if (recommendationType === "recovery_mode_active") {
    return {
      tone: "caution",
      title: `Recovery mode on · next target is ${formattedNext}`,
      body: `${name} showed stress signs, so we moved to shorter reset reps. We'll step back up after calm sessions.`,
    };
  }

  if (recommendationType === "recovery_mode_resume") {
    return {
      tone: "positive",
      title: `Recovery complete · next target is ${formattedNext}`,
      body: `Recent reset reps went well, so we're gently stepping up again.`,
    };
  }

  if (dropped) {
    return {
      tone: "caution",
      title: `Target eased to ${formattedNext}`,
      body: distressLevel === "none"
        ? `We lowered the next rep slightly to keep training steady. ${recommendationReason}`.trim()
        : `${name} showed stress signs, so the next rep is shorter. ${recommendationReason}`.trim(),
    };
  }

  if (increased) {
    return {
      tone: "positive",
      title: `Target increased to ${formattedNext}`,
      body: recommendationReason || `Recent calm reps went well, so the next step is a little longer.`,
    };
  }

  return {
    tone: "neutral",
    title: `Target stays at ${formattedNext}`,
    body: recommendationReason || `We're holding this duration to keep progress steady.`,
  };
}
