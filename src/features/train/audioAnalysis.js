const CONFIRMED_BARK_CONFIDENCE = 0.9;
const REVIEW_CONFIDENCE_FLOOR = 0.55;
const REVIEW_SEGMENT_SECONDS = 6;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const rms = (windowSamples) => {
  if (!windowSamples.length) return 0;
  let sum = 0;
  for (let i = 0; i < windowSamples.length; i += 1) {
    sum += windowSamples[i] * windowSamples[i];
  }
  return Math.sqrt(sum / windowSamples.length);
};

const zcr = (windowSamples) => {
  if (windowSamples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < windowSamples.length; i += 1) {
    if ((windowSamples[i - 1] >= 0 && windowSamples[i] < 0) || (windowSamples[i - 1] < 0 && windowSamples[i] >= 0)) {
      crossings += 1;
    }
  }
  return crossings / windowSamples.length;
};

const toTimestamp = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
};

const mergeBarkEvents = (segments) => {
  if (!segments.length) return [];
  const merged = [segments[0]];
  for (let i = 1; i < segments.length; i += 1) {
    const current = segments[i];
    const prev = merged[merged.length - 1];
    if (current.startSeconds - prev.endSeconds <= 2) {
      prev.endSeconds = current.endSeconds;
      prev.confidence = Math.max(prev.confidence, current.confidence);
      prev.windowCount += 1;
    } else {
      merged.push(current);
    }
  }
  return merged;
};

const classifyStressLevel = ({ confirmedBarkCount, suspiciousDensity }) => {
  if (confirmedBarkCount >= 6 || suspiciousDensity >= 0.35) return "High stress";
  if (confirmedBarkCount >= 3 || suspiciousDensity >= 0.2) return "Moderate stress";
  if (confirmedBarkCount >= 1 || suspiciousDensity >= 0.08) return "Mild stress";
  return "No clear stress detected";
};

export async function analyzeSessionAudio({ audioBlob, durationSeconds }) {
  if (!audioBlob || audioBlob.size === 0) {
    return {
      status: "empty",
      stressLevel: "No clear stress detected",
      confirmedBarkCount: 0,
      confirmedBarks: [],
      reviewSegments: [],
    };
  }

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return {
        status: "unsupported",
        stressLevel: "No clear stress detected",
        confirmedBarkCount: 0,
        confirmedBarks: [],
        reviewSegments: [],
      };
    }

    const audioContext = new AudioContextCtor();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const windowSize = Math.max(1, Math.floor(sampleRate * 0.75));

    const confirmedWindows = [];
    const uncertainWindows = [];

    for (let start = 0; start < channelData.length; start += windowSize) {
      const end = Math.min(start + windowSize, channelData.length);
      const samples = channelData.slice(start, end);
      const energy = rms(samples);
      const crossings = zcr(samples);
      let peak = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const absolute = Math.abs(samples[index]);
        if (absolute > peak) peak = absolute;
      }

      const confidence = clamp((energy * 2.8) + (peak * 0.75) + (crossings * 2.2));
      const startSeconds = start / sampleRate;
      const endSeconds = end / sampleRate;

      if (confidence >= CONFIRMED_BARK_CONFIDENCE) {
        confirmedWindows.push({ startSeconds, endSeconds, confidence, windowCount: 1 });
      } else if (confidence >= REVIEW_CONFIDENCE_FLOOR) {
        uncertainWindows.push({ startSeconds, endSeconds, confidence });
      }
    }

    const mergedBarks = mergeBarkEvents(confirmedWindows).map((segment) => ({
      ...segment,
      label: "confirmed_bark",
      displayRange: `${toTimestamp(segment.startSeconds)}–${toTimestamp(segment.endSeconds)}`,
    }));

    const reviewSegments = uncertainWindows
      .slice(0, 6)
      .map((segment) => {
        const center = (segment.startSeconds + segment.endSeconds) / 2;
        const startSeconds = Math.max(0, center - (REVIEW_SEGMENT_SECONDS / 2));
        const endSeconds = startSeconds + REVIEW_SEGMENT_SECONDS;
        return {
          startSeconds,
          endSeconds,
          confidence: Number(segment.confidence.toFixed(2)),
          reason: "possible_vocal_stress_signal",
          displayRange: `${toTimestamp(startSeconds)}–${toTimestamp(endSeconds)}`,
        };
      });

    const analyzedDuration = durationSeconds || decoded.duration || 0;
    const suspiciousDensity = analyzedDuration > 0
      ? (reviewSegments.length * REVIEW_SEGMENT_SECONDS) / analyzedDuration
      : 0;

    const stressLevel = classifyStressLevel({
      confirmedBarkCount: mergedBarks.length,
      suspiciousDensity,
    });

    await audioContext.close().catch(() => {});

    return {
      status: "ready",
      analyzedDuration,
      stressLevel,
      confirmedBarkCount: mergedBarks.length,
      confirmedBarks: mergedBarks,
      reviewSegments,
      confirmedThreshold: CONFIRMED_BARK_CONFIDENCE,
    };
  } catch {
    return {
      status: "failed",
      stressLevel: "No clear stress detected",
      confirmedBarkCount: 0,
      confirmedBarks: [],
      reviewSegments: [],
    };
  }
}
