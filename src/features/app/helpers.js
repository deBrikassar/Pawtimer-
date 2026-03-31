import { PROTOCOL } from "../../lib/protocol";
import { formatClockDuration, formatDuration } from "../../lib/time";

export const fmt = formatDuration;
export const fmtClock = formatClockDuration;

export const parseDurationInput = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.includes(":")) {
    const [mm, ss] = raw.split(":").map((part) => Number(part));
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || mm < 0 || ss < 0 || ss >= 60) return null;
    return Math.round(mm * 60 + ss);
  }
  const asSeconds = Number(raw);
  if (!Number.isFinite(asSeconds) || asSeconds < 0) return null;
  return Math.round(asSeconds);
};

export const fmtDate = (iso) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
};

export const toDayKey = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

export function dailyInfo(sessions) {
  const today = sessions.filter((s) => isToday(s.date));
  const usedSec = today.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const count = today.length;
  const capSec = PROTOCOL.maxDailyAloneMinutes * 60;
  const canAdd = true;
  return { count, usedSec, capSec, canAdd, maxCount: PROTOCOL.sessionsPerDayMax };
}

export function patternInfo(patterns, walks, leavesPerDay = 3, protocol = PROTOCOL) {
  const todayPat = patterns.filter((p) => isToday(p.date)).length;
  const todayWalks = walks.filter((w) => isToday(w.date)).length;
  const normalizedLeaves = Math.max(1, Number(leavesPerDay) || 3);
  const leaveDelta = normalizedLeaves - 3;
  const recMinBase = protocol.desensitizationBlocksPerDayRecommendedMin;
  const recMaxBase = protocol.desensitizationBlocksPerDayRecommendedMax;
  const recMin = Math.max(1, recMinBase + Math.floor(leaveDelta / 2));
  const recMax = Math.max(recMin, recMaxBase + Math.ceil(leaveDelta / 2));
  const walkBuffer = leaveDelta > 0 ? Math.ceil(leaveDelta / 3) : 0;
  const needed = Math.max(recMin, todayWalks + walkBuffer);
  const behind = todayPat < needed;
  return { todayPat, todayWalks, recMin, recMax, needed, behind, walkBuffer, normalizedLeaves };
}

export const SEMANTIC_STATUS = {
  outcome: {
    none: { color: "var(--green-dark)", label: "No distress", surfaceState: "today" },
    calm: { color: "var(--green-dark)", label: "No distress", surfaceState: "today" },
    completed: { color: "var(--green-dark)", label: "Completed", surfaceState: "today" },
    subtle: { color: "var(--orange)", label: "Subtle stress", surfaceState: "upcoming" },
    active: { color: "var(--red)", label: "Active distress", surfaceState: "overdue" },
    severe: { color: "var(--red)", label: "Severe distress", surfaceState: "overdue" },
  },
  risk: {
    low: { color: "var(--green-dark)", label: "Low", surfaceState: "today" },
    medium: { color: "var(--orange)", label: "Medium", surfaceState: "upcoming" },
    high: { color: "var(--red)", label: "High", surfaceState: "overdue" },
  },
  informational: {
    improving: { color: "var(--blue-dark)", label: "Improving", surfaceState: "upcoming" },
    stable: { color: "var(--blue-dark)", label: "Stable", surfaceState: "today" },
    neutral: { color: "var(--blue-dark)", label: "Building baseline", surfaceState: "today" },
  },
};

export const getOutcomeTone = (level) => {
  if (level === "completed") return SEMANTIC_STATUS.outcome.completed;
  const normalized = String(level || "").trim().toLowerCase();
  return SEMANTIC_STATUS.outcome[normalized] ?? SEMANTIC_STATUS.informational.neutral;
};

export const getRiskTone = (level) => {
  const normalized = String(level || "").trim().toLowerCase();
  return SEMANTIC_STATUS.risk[normalized] ?? SEMANTIC_STATUS.informational.neutral;
};

export const getInformationalTone = (state) => {
  const normalized = String(state || "").trim().toLowerCase();
  return SEMANTIC_STATUS.informational[normalized] ?? SEMANTIC_STATUS.informational.neutral;
};

export const distressLabel = (l) =>
  l === "none" ? "No distress" : l === "subtle" ? "Subtle stress" : l === "active" ? "Active distress" : l === "severe" ? "Severe distress" : "—";

export const DISTRESS_TYPES = [
  "barking",
  "whining/howling",
  "pacing",
  "scratching at door",
  "panting",
  "lip licking",
  "hypervigilance",
  "unable to settle",
  "escape attempt",
  "other",
];

const asBool = (value) => value === true || value === 1;
const symptomIntensity = (v) => (Number.isFinite(v) ? v : asBool(v) ? 1 : 0);

export const sessionDetailBadges = (s) => {
  const badges = [];
  if (s.context?.timeOfDay) badges.push(`Time: ${s.context.timeOfDay}`);
  if (s.context?.departureType) badges.push(`Departure: ${s.context.departureType}`);
  if (Array.isArray(s.context?.cuesUsed) && s.context.cuesUsed.length) badges.push(`Cues: ${s.context.cuesUsed.length}`);

  const symptomTotal = ["barking", "pacing", "destructive", "salivation"].reduce((sum, key) => sum + symptomIntensity(s.symptoms?.[key]), 0);
  if (symptomTotal > 0) badges.push(`Symptoms: ${symptomTotal}`);

  if (Number.isFinite(s.recoverySeconds)) badges.push(`Recovery: ${fmt(s.recoverySeconds)}`);
  if (Number.isFinite(s.preSession?.walkDuration)) badges.push(`Pre-walk: ${fmt(s.preSession.walkDuration)}`);
  if (s.preSession?.enrichmentGiven) badges.push("Enrichment");
  if (s.environment?.noiseEvent) badges.push("Noise/event");

  return badges;
};

export const getLeaveProfile = (leavesPerDay = 3) => {
  const normalizedLeaves = Math.max(1, Number(leavesPerDay) || 3);
  if (normalizedLeaves <= 2) return { key: "low", confidenceScale: 0.9, desc: "lower daily departure load" };
  if (normalizedLeaves <= 4) return { key: "moderate", confidenceScale: 1, desc: "moderate daily departure load" };
  if (normalizedLeaves <= 6) return { key: "high", confidenceScale: 1.12, desc: "higher daily departure load" };
  return { key: "veryHigh", confidenceScale: 1.22, desc: "very high daily departure load" };
};

export const PATTERN_TYPES = [
  {
    type: "keys",
    icon: "patternBreak",
    label: "Took keys — stayed home",
    desc: "Pick up your keys, then put them down without going out",
  },
  {
    type: "shoes",
    icon: "patternBreak",
    label: "Put on shoes — stayed home",
    desc: "Put shoes on, then take them off without going out",
  },
  {
    type: "jacket",
    icon: "patternBreak",
    label: "Put on jacket — stayed home",
    desc: "Put jacket on, then take it off without going out",
  },
];

export const WALK_TYPE_OPTIONS = [
  { value: "sniffy_decompression", label: "sniffy decompression" },
  { value: "regular_walk", label: "regular walk" },
  { value: "intense_exercise", label: "intense exercise" },
  { value: "training_walk", label: "training walk" },
  { value: "toilet_break", label: "toilet break" },
];

export const normalizeWalkType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "regular") return "regular_walk";
  return WALK_TYPE_OPTIONS.some((option) => option.value === normalized) ? normalized : "regular_walk";
};

export const walkTypeLabel = (walkType) => (WALK_TYPE_OPTIONS.find((option) => option.value === normalizeWalkType(walkType))?.label ?? "regular walk");

export const LEAVE_OPTIONS = [
  { value: 1, label: "1–2 times", sub: "Work from home / rarely leave" },
  { value: 3, label: "3–4 times", sub: "Short errands, occasional walks" },
  { value: 5, label: "5–6 times", sub: "Regular commute or active lifestyle" },
  { value: 8, label: "7+ times", sub: "Frequent short trips during the day" },
];

export const CALM_DURATIONS = [
  { value: 30, label: "30s", sub: "Just starting out" },
  { value: 120, label: "2 min", sub: "A little bit" },
  { value: 300, label: "5 min", sub: "Getting there" },
  { value: 600, label: "10 min", sub: "Doing okay" },
  { value: 1200, label: "20 min", sub: "Pretty good" },
  { value: 1800, label: "30 min", sub: "Almost there" },
];

export const GOAL_DURATIONS = [
  { value: 1800, label: "30 min", sub: "Short errands" },
  { value: 2400, label: "40 min", sub: "Standard goal" },
  { value: 3600, label: "1 hour", sub: "Longer walks" },
  { value: 7200, label: "2 hours", sub: "Half workday" },
  { value: 14400, label: "4 hours", sub: "Morning/afternoon" },
  { value: 28800, label: "8 hours", sub: "Full workday" },
];
