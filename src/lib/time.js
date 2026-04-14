export const formatDuration = (seconds, options = {}) => {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";

  const { hoursMinutesOnly = false } = options;
  const totalSeconds = Math.max(0, hoursMinutesOnly ? Math.floor(Number(seconds)) : Math.round(Number(seconds)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hoursMinutesOnly) {
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

export const formatClockDuration = (seconds) => {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const totalSeconds = Math.max(0, Math.round(Number(seconds)));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${totalMinutes}:${String(secs).padStart(2, "0")}`;
};

export const parseHumanDurationSeconds = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (!raw.includes(":")) {
    const asSeconds = Number(raw);
    if (!Number.isFinite(asSeconds) || asSeconds < 0) return null;
    return Math.round(asSeconds);
  }

  const parts = raw.split(":");
  // Accept only m:ss, mm:ss, or h:mm:ss. Empty segments (e.g. 1::2) are invalid.
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts.map((part) => Number(part));
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parts.map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
};
