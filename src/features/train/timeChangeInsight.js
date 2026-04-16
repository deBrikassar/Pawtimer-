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

  if (!dropped && !increased && recommendationType !== "recovery_mode_active" && recommendationType !== "recovery_mode_resume") {
    return null;
  }

  if (recommendationType === "recovery_mode_active") {
    return {
      tone: "caution",
      title: `Recovery mode on · next target is ${formattedNext}`,
      body: `${name} showed stress signs, so we moved to shorter reset reps.`,
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
        ? `We lowered the next rep slightly to keep training steady.`
        : `${name} showed stress signs, so the next rep is shorter.`,
    };
  }

  if (increased) {
    return {
      tone: "positive",
      title: `Target increased to ${formattedNext}`,
      body: `Recent calm reps went well, so the next step is a little longer.`,
    };
  }

  return {
    tone: "neutral",
    title: `Target stays at ${formattedNext}`,
    body: `We're holding this duration to keep progress steady.`,
  };
}
