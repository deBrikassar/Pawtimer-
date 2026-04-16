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
      title: `Recovery mode on · target is now ${formattedNext}`,
      body: `${name} showed stress signs, so we switched to short reset sessions to rebuild calm confidence.`,
    };
  }

  if (recommendationType === "recovery_mode_resume") {
    return {
      tone: "positive",
      title: `Recovery complete · target is now ${formattedNext}`,
      body: `Recent calm reset sessions went well, so we are gently stepping back up again.`,
    };
  }

  if (dropped) {
    return {
      tone: "caution",
      title: `Target eased to ${formattedNext}`,
      body: distressLevel === "none"
        ? `We lowered the next session slightly to keep training comfortable and steady.`
        : `${name} showed stress signs, so the next session is shorter to protect confidence.`,
    };
  }

  if (increased) {
    return {
      tone: "positive",
      title: `Target increased to ${formattedNext}`,
      body: `Recent calm sessions were successful, so the next step is a little longer.`,
    };
  }

  return {
    tone: "neutral",
    title: `Target stays at ${formattedNext}`,
    body: `We are holding this duration to keep progress steady and predictable.`,
  };
}
