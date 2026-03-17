export const formatDuration = (seconds) => {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";

  const totalSeconds = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};
