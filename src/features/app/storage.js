import { PROTOCOL, inferBelowThreshold, normalizeDistressLevel } from "../../lib/protocol";
import { sortByDateAsc } from "../../lib/activityDateTime";
import { normalizeWalkType } from "./helpers";

// ─── Storage keys ─────────────────────────────────────────────────────────────
export const DOGS_KEY       = "pawtimer_dogs_v3";
export const ACTIVE_DOG_KEY = "pawtimer_active_dog_v3";
const SESS_SCHEMA_VERSION = 5;
export const sessKey    = (id) => `pawtimer_sess_v${SESS_SCHEMA_VERSION}_${id}`;
const legacySessKeyV4 = (id) => `pawtimer_sess_v4_${id}`;
const legacySessKey = (id) => `pawtimer_sess_v3_${id}`;
const legacyWalkKey = (id) => `pawtimer_walk_v3_${id}`;
export const walkKey    = (id) => `pawtimer_walk_v4_${id}`;
export const feedingKey = (id) => `pawtimer_feed_v1_${id}`;
export const patKey     = (id) => `pawtimer_pat_v3_${id}`;
export const tombKey    = (id) => `pawtimer_tomb_v1_${id}`;
export const patLblKey  = (id) => `pawtimer_patlbl_v3_${id}`;  // custom pattern labels
export const photoKey   = (id) => `pawtimer_photo_v3_${id}`;   // dog photo (base64)

export const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
export const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

export const ensureArray = (value) => (Array.isArray(value) ? value : []);
export const ensureObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// ─── Cross-device sync (Supabase REST — no SDK needed) ────────────────────────
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel env vars to enable.
// Without them the app works fine with localStorage only.
export const SB_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL)  ?? "";
export const SB_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ?? "";
export const SYNC_ENABLED = Boolean(SB_URL && SB_KEY);
export const canonicalDogId = (value) => String(value || "").trim().toUpperCase();
const SYNC_DEBUG = (typeof import.meta !== "undefined" && import.meta.env?.DEV)
  || (typeof window !== "undefined" && window.localStorage?.getItem("pawtimer_sync_debug") === "1");

export const logSyncDebug = (...args) => {
  if (!SYNC_DEBUG) return;
  console.info("[pawtimer-sync]", ...args);
};

const createSyncDegradationState = () => ({
  isDegraded: false,
  flags: [],
  messages: [],
  events: [],
});

let syncDegradationState = createSyncDegradationState();

const recordSyncDegradation = ({
  code,
  operation,
  table,
  field = null,
  message,
  severity = "warning",
}) => {
  const normalizedCode = String(code || "").trim();
  const normalizedOperation = String(operation || "").trim();
  const normalizedTable = String(table || "").trim();
  const normalizedField = field ? String(field).trim() : null;
  const normalizedMessage = String(message || "").trim();
  if (!normalizedCode || !normalizedOperation || !normalizedTable || !normalizedMessage) return;

  const eventKey = [normalizedCode, normalizedOperation, normalizedTable, normalizedField || ""].join("|");
  const exists = syncDegradationState.events.some((event) => event.key === eventKey);
  if (exists) return;

  const nextEvent = {
    key: eventKey,
    code: normalizedCode,
    severity,
    operation: normalizedOperation,
    table: normalizedTable,
    field: normalizedField,
    message: normalizedMessage,
    recordedAt: new Date().toISOString(),
  };
  syncDegradationState = {
    isDegraded: true,
    flags: syncDegradationState.flags.includes(normalizedCode)
      ? syncDegradationState.flags
      : [...syncDegradationState.flags, normalizedCode],
    messages: syncDegradationState.messages.includes(normalizedMessage)
      ? syncDegradationState.messages
      : [...syncDegradationState.messages, normalizedMessage],
    events: [...syncDegradationState.events, nextEvent],
  };
};

export const getSyncDegradationState = () => ({
  isDegraded: Boolean(syncDegradationState.isDegraded),
  flags: [...syncDegradationState.flags],
  messages: [...syncDegradationState.messages],
  events: syncDegradationState.events.map((event) => ({ ...event })),
});

const normalizeSbUrl = (value) => String(value || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
export const SB_BASE_URL = normalizeSbUrl(SB_URL);
const inFlightGetRequests = new Map();
const fetchRateTracker = new Map();

const trackFetchRate = (method, path, trigger = "unknown") => {
  const secondBucket = Math.floor(Date.now() / 1000);
  const key = `${method.toUpperCase()} ${path}`;
  const entry = fetchRateTracker.get(key);
  if (!entry || entry.secondBucket !== secondBucket) {
    const next = { secondBucket, count: 1 };
    fetchRateTracker.set(key, next);
    logSyncDebug("sbReq:rate", { key, trigger, requestsPerSecond: next.count });
    return;
  }
  entry.count += 1;
  fetchRateTracker.set(key, entry);
  logSyncDebug("sbReq:rate", { key, trigger, requestsPerSecond: entry.count });
};

const sbReq = async (path, opts = {}) => {
  if (!SB_BASE_URL || !SB_KEY) {
    return { ok: false, data: null, error: "Supabase env vars are missing", status: 0 };
  }
  const method = (opts.method ?? "GET").toUpperCase();
  const trigger = opts.trigger || "unknown";
  const requestKey = `${method}:${path}`;
  trackFetchRate(method, path, trigger);
  if (method === "GET" && inFlightGetRequests.has(requestKey)) {
    logSyncDebug("sbReq:dedupe-hit", { method, path, trigger });
    return inFlightGetRequests.get(requestKey);
  }
  const requestPromise = (async () => {
  try {
    const headers = {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };
    if (opts.prefer) headers["Prefer"] = opts.prefer;
    const res = await fetch(`${SB_BASE_URL}/rest/v1/${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const detail = text || `${res.status} ${res.statusText}`;
      console.warn("Supabase error:", res.status, detail);
      return { ok: false, data: null, error: detail, status: res.status };
    }
    if (!text) return { ok: true, data: null, error: null, status: res.status };
    try {
      return { ok: true, data: JSON.parse(text), error: null, status: res.status };
    } catch {
      return { ok: false, data: null, error: "Invalid JSON response from Supabase", status: res.status };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("Supabase fetch error:", message);
    return { ok: false, data: null, error: message, status: 0 };
  }
  })();
  if (method === "GET") inFlightGetRequests.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (method === "GET") inFlightGetRequests.delete(requestKey);
  }
};

const toTimestamp = (value) => {
  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRecordRevision = (item = {}) => {
  const revision = item.revision ?? item.rev ?? item.version ?? item.recordVersion ?? item.record_version ?? null;
  return Number.isFinite(revision) ? Number(revision) : null;
};

const getRecordUpdatedAt = (item = {}) => item.updatedAt ?? item.updated_at ?? item.localUpdatedAt ?? item.local_updated_at ?? null;
const getRecordDeletedAt = (item = {}) => item.deletedAt ?? item.deleted_at ?? null;
const isFiniteNumber = (value) => Number.isFinite(Number(value));
const LOCAL_SYNC_STATES = new Set(["local", "syncing", "error"]);

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const rankSyncCausality = (item = {}) => {
  const pendingSyncScore = Boolean(item?.pendingSync) ? 2 : 0;
  const syncStateScore = LOCAL_SYNC_STATES.has(item?.syncState) ? 1 : 0;
  const replicationScore = item?.replicationConfirmed === false && Boolean(item?.pendingSync) ? 1 : 0;
  return pendingSyncScore + syncStateScore + replicationScore;
};

const buildDeterministicConflictFingerprint = (item = {}) => {
  if (!item || typeof item !== "object") return stableStringify(item);
  const clone = { ...item };
  delete clone.updatedAt;
  delete clone.updated_at;
  delete clone.localUpdatedAt;
  delete clone.local_updated_at;
  delete clone.deletedAt;
  delete clone.deleted_at;
  delete clone.date;
  return stableStringify(clone);
};

export const normalizeDogSyncMetadata = (dog = {}) => {
  const id = canonicalDogId(dog?.id);
  const revision = isFiniteNumber(dog?.revision) ? Number(dog.revision) : null;
  const updatedAt = getRecordUpdatedAt(dog);
  return {
    ...(dog && typeof dog === "object" ? dog : {}),
    id,
    revision,
    updatedAt: updatedAt || null,
  };
};

export const stampLocalDogSettings = (nextDog = {}, previousDog = null) => {
  const normalizedNext = normalizeDogSyncMetadata(nextDog);
  const normalizedPrev = normalizeDogSyncMetadata(previousDog || {});
  const previousRevision = Number.isFinite(normalizedPrev.revision)
    ? normalizedPrev.revision
    : Number.isFinite(normalizedNext.revision)
      ? normalizedNext.revision
      : 0;
  return {
    ...normalizedNext,
    revision: previousRevision + 1,
    updatedAt: new Date().toISOString(),
  };
};

export const resolveDogSettingsConflict = (leftDog = {}, rightDog = {}) => {
  const left = normalizeDogSyncMetadata(leftDog);
  const right = normalizeDogSyncMetadata(rightDog);
  if (!left.id && right.id) return right;
  if (!right.id && left.id) return left;

  const winner = resolveSyncConflict(left, right);
  const loser = winner === left ? right : left;
  const winnerRevision = getRecordRevision(winner);
  const loserRevision = getRecordRevision(loser);
  const winnerUpdatedAt = toTimestamp(getRecordUpdatedAt(winner));
  const loserUpdatedAt = toTimestamp(getRecordUpdatedAt(loser));
  if (winnerRevision !== loserRevision || winnerUpdatedAt !== loserUpdatedAt) return winner;

  const leftFingerprint = stableStringify(left);
  const rightFingerprint = stableStringify(right);
  if (leftFingerprint === rightFingerprint) return right;
  return leftFingerprint > rightFingerprint ? left : right;
};

export const resolveSyncConflict = (left = {}, right = {}) => {
  const leftDeletedAt = toTimestamp(getRecordDeletedAt(left));
  const rightDeletedAt = toTimestamp(getRecordDeletedAt(right));
  const leftRevision = getRecordRevision(left);
  const rightRevision = getRecordRevision(right);
  if (leftRevision !== null && rightRevision !== null && leftRevision !== rightRevision) {
    return leftRevision > rightRevision ? left : right;
  }

  const leftCausalRank = rankSyncCausality(left);
  const rightCausalRank = rankSyncCausality(right);
  if (leftCausalRank !== rightCausalRank) return leftCausalRank > rightCausalRank ? left : right;

  if (leftDeletedAt || rightDeletedAt) {
    if (leftDeletedAt !== rightDeletedAt) return leftDeletedAt > rightDeletedAt ? left : right;
    if (leftDeletedAt && rightDeletedAt) {
      const leftConfirmed = left?.replicationConfirmed === true;
      const rightConfirmed = right?.replicationConfirmed === true;
      if (leftConfirmed !== rightConfirmed) return leftConfirmed ? left : right;
      return leftDeletedAt >= rightDeletedAt ? left : right;
    }
    return leftDeletedAt ? left : right;
  }


  const leftUpdatedAt = toTimestamp(getRecordUpdatedAt(left));
  const rightUpdatedAt = toTimestamp(getRecordUpdatedAt(right));
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt > rightUpdatedAt ? left : right;

  const leftDate = toTimestamp(left?.date);
  const rightDate = toTimestamp(right?.date);
  if (leftDate !== rightDate) return leftDate > rightDate ? left : right;

  if (Boolean(left?.pendingSync) !== Boolean(right?.pendingSync)) {
    return left?.pendingSync ? left : right;
  }

  if ((left?.syncState || "synced") !== (right?.syncState || "synced")) {
    return (left?.syncState === "local" || left?.syncState === "syncing") ? left : right;
  }

  const leftFingerprint = buildDeterministicConflictFingerprint(left);
  const rightFingerprint = buildDeterministicConflictFingerprint(right);
  if (leftFingerprint === rightFingerprint) return right;
  return leftFingerprint > rightFingerprint ? left : right;
};

// Merge two arrays by id using sync-aware conflict resolution and preserves chronological order
export const mergeById = (a = [], b = [], pickWinner = resolveSyncConflict) => {
  const merged = new Map();
  [...ensureArray(a), ...ensureArray(b)].forEach((item) => {
    if (!item?.id) return;
    const previous = merged.get(item.id);
    merged.set(item.id, previous ? pickWinner(previous, item) : item);
  });
  return sortByDateAsc(Array.from(merged.values()));
};

export const tombstoneEntityKey = (entry = {}) => {
  const kind = normalizeTombstoneKind(entry?.kind ?? entry?.type);
  const id = String(entry?.id || "");
  if (!kind || !id) return "";
  return `${kind}:${id}`;
};

export const mergeTombstonesByEntityKey = (a = [], b = [], pickWinner = resolveSyncConflict) => {
  const merged = new Map();
  [...ensureArray(a), ...ensureArray(b)].forEach((item) => {
    const key = tombstoneEntityKey(item);
    if (!key) return;
    const previous = merged.get(key);
    merged.set(key, previous ? pickWinner(previous, item) : item);
  });
  return sortByDateAsc(Array.from(merged.values()));
};

export const mergeMutationSafeSyncCollection = ({
  currentItems = [],
  remoteItems = [],
  tombstones = [],
  kind = "",
  mapLocalItem = (item) => item,
  mapRemoteItem = (item) => item,
} = {}) => applyTombstonesToCollection(
  mergeById(
    ensureArray(currentItems).map(mapLocalItem),
    ensureArray(remoteItems).map(mapRemoteItem),
  ),
  tombstones,
  kind,
);

const asBool = (value) => value === true || value === 1;
const hasValue = (value) => value !== null && value !== undefined;

const normalizeSymptom = (value) => {
  if (Number.isFinite(value)) return Math.max(0, Number(value));
  return asBool(value) ? 1 : 0;
};

const pickFinite = (obj = {}, keys = []) => {
  for (const key of keys) {
    const value = Number(obj?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const resolveDurationSeconds = (row = {}, config = {}) => {
  const {
    secondsKeys = [],
    canonicalKeys = [],
    minutesKeys = [],
    ambiguousKeys = [],
  } = config;

  const explicitSeconds = pickFinite(row, secondsKeys);
  if (explicitSeconds != null) return Math.max(0, Math.round(explicitSeconds));

  const canonical = pickFinite(row, canonicalKeys);
  if (canonical != null) return Math.max(0, Math.round(canonical));

  const explicitMinutes = pickFinite(row, minutesKeys);
  if (explicitMinutes != null) return Math.max(0, Math.round(explicitMinutes * 60));

  const ambiguous = pickFinite(row, ambiguousKeys);
  if (ambiguous != null) return Math.max(0, Math.round(ambiguous));

  return null;
};

const EXPLICIT_DISTRESS_RESULT_ALIASES = new Set([
  "distress",
  "subtle",
  "mild",
  "passive",
  "active",
  "strong",
  "severe",
  "panic",
]);

const normalizeRawToken = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

const inferDistressLevelFromRow = (row = {}) => {
  const explicitDistressLevel = normalizeRawToken(row.distressLevel ?? row.distress_level);
  if (explicitDistressLevel) return explicitDistressLevel;

  const normalizedResult = normalizeRawToken(row.result);
  if (normalizedResult === "success") return "none";
  if (normalizedResult && EXPLICIT_DISTRESS_RESULT_ALIASES.has(normalizedResult)) {
    return normalizedResult === "distress" ? "strong" : normalizedResult;
  }
  return null;
};

const resolveCanonicalDistress = (row = {}) => {
  const normalizedDistressType = row.distressType ?? row.distress_type ?? null;
  const normalizedDistressSeverity = row.distressSeverity ?? row.distress_severity ?? null;
  const restoredLegacyDistress = decodeLegacyDistressFields({
    distressLevel: inferDistressLevelFromRow(row),
    distressType: normalizedDistressType,
    distressSeverity: normalizedDistressSeverity,
  });
  const canonicalDistressLevel = normalizeDistressLevel(restoredLegacyDistress.distressLevel);
  return {
    distressLevel: canonicalDistressLevel,
    distressSeverity: canonicalDistressLevel,
    distressType: restoredLegacyDistress.distressType,
  };
};

export const normalizeSession = (row = {}) => {
  const context = row.context ?? {};
  const symptoms = row.symptoms ?? {};
  const preSession = row.preSession ?? row.pre_session ?? {};
  const environment = row.environment ?? {};
  const canonicalDistress = resolveCanonicalDistress(row);
  const actualDuration = resolveDurationSeconds(row, {
    secondsKeys: ["actualDurationSeconds", "actual_duration_seconds", "durationSeconds", "duration_seconds", "completedDurationSeconds", "completed_duration_seconds"],
    canonicalKeys: ["actualDuration", "actual_duration"],
    minutesKeys: ["actualDurationMinutes", "actual_duration_minutes", "durationMinutes", "duration_minutes", "completedDurationMinutes", "completed_duration_minutes"],
    ambiguousKeys: ["duration", "value"],
  });
  const plannedDuration = resolveDurationSeconds(row, {
    secondsKeys: ["plannedDurationSeconds", "planned_duration_seconds", "targetDurationSeconds", "target_duration_seconds"],
    canonicalKeys: ["plannedDuration", "planned_duration", "targetDuration", "target_duration"],
    minutesKeys: ["plannedDurationMinutes", "planned_duration_minutes", "targetDurationMinutes", "target_duration_minutes"],
  });

  const normalized = {
    ...row,
    actualDuration,
    plannedDuration,
    distressLevel: canonicalDistress.distressLevel,
    context: {
      timeOfDay: context.timeOfDay ?? context.time_of_day ?? null,
      departureType: context.departureType ?? context.departure_type ?? "training",
      cuesUsed: Array.isArray(context.cuesUsed ?? context.cues_used) ? (context.cuesUsed ?? context.cues_used) : [],
      location: context.location ?? null,
      barrierUsed: hasValue(context.barrierUsed) ? !!context.barrierUsed : asBool(context.barrier_used),
      enrichmentPresent: hasValue(context.enrichmentPresent) ? !!context.enrichmentPresent : asBool(context.enrichment_present),
      mediaOn: hasValue(context.mediaOn) ? !!context.mediaOn : asBool(context.media_on),
      whoLeft: context.whoLeft ?? null,
      anotherPersonStayed: hasValue(context.anotherPersonStayed) ? !!context.anotherPersonStayed : asBool(context.another_person_stayed),
    },
    symptoms: {
      barking: normalizeSymptom(symptoms.barking),
      pacing: normalizeSymptom(symptoms.pacing),
      destructive: normalizeSymptom(symptoms.destructive),
      salivation: normalizeSymptom(symptoms.salivation),
    },
    latencyToFirstDistress: Number.isFinite(row.latencyToFirstDistress) ? row.latencyToFirstDistress : (Number.isFinite(row.latency_to_first_distress) ? row.latency_to_first_distress : null),
    belowThreshold: inferBelowThreshold({
      ...row,
      distressLevel: canonicalDistress.distressLevel,
      actualDuration,
      plannedDuration,
    }),
    distressType: canonicalDistress.distressType,
    distressSeverity: canonicalDistress.distressSeverity,
    videoReview: {
      recorded: hasValue((row.videoReview || {}).recorded) ? !!row.videoReview.recorded : asBool((row.video_review || {}).recorded),
      firstSubtleDistressTs: (row.videoReview || {}).firstSubtleDistressTs ?? (row.video_review || {}).first_subtle_distress_ts ?? null,
      firstActiveDistressTs: (row.videoReview || {}).firstActiveDistressTs ?? (row.video_review || {}).first_active_distress_ts ?? null,
      eventTags: Array.isArray((row.videoReview || {}).eventTags ?? (row.video_review || {}).event_tags) ? ((row.videoReview || {}).eventTags ?? (row.video_review || {}).event_tags) : [],
      notes: (row.videoReview || {}).notes ?? (row.video_review || {}).notes ?? null,
      ratingConfidence: Number.isFinite((row.videoReview || {}).ratingConfidence) ? row.videoReview.ratingConfidence : (Number.isFinite((row.video_review || {}).rating_confidence) ? row.video_review.rating_confidence : null),
    },
    recoverySeconds: Number.isFinite(row.recoverySeconds) ? row.recoverySeconds : (Number.isFinite(row.recovery_seconds) ? row.recovery_seconds : null),
    preSession: {
      walkDuration: Number.isFinite(preSession.walkDuration) ? preSession.walkDuration : (Number.isFinite(preSession.walk_duration) ? preSession.walk_duration : null),
      enrichmentGiven: hasValue(preSession.enrichmentGiven) ? preSession.enrichmentGiven : (hasValue(preSession.enrichment_given) ? preSession.enrichment_given : null),
    },
    environment: {
      noiseEvent: hasValue(environment.noiseEvent) ? !!environment.noiseEvent : asBool(environment.noise_event),
    },
  };
  return normalized;
};

export const mergeSessionWithDerivedFields = (session = {}, updates = {}) => {
  const merged = normalizeSession({ ...session, ...updates });
  const actualDuration = Number.isFinite(merged.actualDuration)
    ? Math.max(0, Math.round(Number(merged.actualDuration)))
    : 0;
  const plannedDuration = Number.isFinite(merged.plannedDuration)
    ? Math.max(PROTOCOL.minDurationSeconds, Math.round(Number(merged.plannedDuration)))
    : PROTOCOL.startDurationSeconds;
  const inferredDistress = updates.distressLevel
    ?? updates.distressSeverity
    ?? merged.distressLevel
    ?? merged.distressSeverity
    ?? (updates.result === "success" ? "none" : null);
  const distressLevel = normalizeDistressLevel(inferredDistress);
  const existingLatency = Number.isFinite(merged.latencyToFirstDistress)
    ? Math.max(0, Math.round(Number(merged.latencyToFirstDistress)))
    : null;
  const latencyToFirstDistress = distressLevel === "none"
    ? actualDuration
    : existingLatency == null
      ? null
      : Math.min(existingLatency, actualDuration);

  return normalizeSession({
    ...merged,
    actualDuration,
    plannedDuration,
    distressLevel,
    distressSeverity: distressLevel,
    distressType: distressLevel === "none"
      ? "none"
      : merged.distressType || null,
    result: distressLevel === "none" ? "success" : "distress",
    belowThreshold: inferBelowThreshold({ distressLevel, actualDuration, plannedDuration }),
    latencyToFirstDistress,
    recoverySeconds: distressLevel === "none"
      ? 0
      : (Number.isFinite(merged.recoverySeconds) ? merged.recoverySeconds : null),
  });
};

const LEGACY_DISTRESS_LEVEL_MAP = {
  subtle: "mild",
  active: "strong",
  severe: "strong",
};

const mapDistressForLegacySupabase = (level) => LEGACY_DISTRESS_LEVEL_MAP[normalizeDistressLevel(level)] ?? "none";
const LEGACY_SEVERITY_TYPE_PREFIX = "__severity:";

const encodeLegacyDistressType = (distressType, distressLevel) => {
  const type = distressType == null ? null : String(distressType).trim();
  if (normalizeDistressLevel(distressLevel) !== "severe") return type || null;
  const payload = type ? `severe|${type}` : "severe";
  return `${LEGACY_SEVERITY_TYPE_PREFIX}${payload}`;
};

const decodeLegacyDistressFields = ({ distressLevel, distressType, distressSeverity }) => {
  const typeRaw = distressType == null ? "" : String(distressType);
  const decodeTypeFromRaw = () => {
    if (!typeRaw.startsWith(LEGACY_SEVERITY_TYPE_PREFIX)) return distressType;
    const encodedPayload = typeRaw.slice(LEGACY_SEVERITY_TYPE_PREFIX.length);
    const [, ...rest] = encodedPayload.split("|");
    return rest.length ? rest.join("|") : null;
  };
  const explicitSeverity = normalizeDistressLevel(distressSeverity);
  const normalizedLevel = normalizeDistressLevel(distressLevel);
  if (explicitSeverity === "severe") {
    return { distressLevel: "severe", distressType: decodeTypeFromRaw() };
  }
  if (!typeRaw.startsWith(LEGACY_SEVERITY_TYPE_PREFIX)) {
    return { distressLevel: normalizedLevel, distressType };
  }
  const encodedPayload = typeRaw.slice(LEGACY_SEVERITY_TYPE_PREFIX.length);
  const [encodedLevel, ...rest] = encodedPayload.split("|");
  const decodedType = rest.length ? rest.join("|") : null;
  if (normalizeDistressLevel(encodedLevel) === "severe") {
    return { distressLevel: "severe", distressType: decodedType };
  }
  return { distressLevel: normalizedLevel, distressType };
};

export const normalizeSessions = (rows = []) => ensureArray(rows).map(normalizeSession);
const normalizeRevision = (value) => {
  const revision = Number(value);
  return Number.isFinite(revision) ? revision : null;
};

const normalizeUpdatedAt = (row = {}) => row?.updatedAt ?? row?.updated_at ?? null;

export const normalizePatterns = (rows = []) => ensureArray(rows)
  .map((row) => ({
    id: String(row?.id || ""),
    date: row?.date || new Date().toISOString(),
    type: row?.type || "",
    revision: normalizeRevision(row?.revision),
    updatedAt: normalizeUpdatedAt(row),
  }))
  .filter((row) => row.id)
  .sort((a, b) => new Date(a.date) - new Date(b.date));

export const normalizeFeedings = (rows = []) => ensureArray(rows)
  .map((row) => ({
    id: String(row?.id || ""),
    date: row?.date || new Date().toISOString(),
    foodType: row?.foodType ?? row?.food_type ?? "meal",
    amount: row?.amount ?? "small",
    revision: normalizeRevision(row?.revision),
    updatedAt: normalizeUpdatedAt(row),
  }))
  .filter((row) => row.id)
  .sort((a, b) => new Date(a.date) - new Date(b.date));

const normalizeTombstoneKind = (kind) => {
  if (kind === "session" || kind === "walk" || kind === "pattern" || kind === "feeding") return kind;
  return null;
};

export const normalizeTombstones = (rows = []) => ensureArray(rows)
  .map((row) => ({
    id: String(row?.id || ""),
    kind: normalizeTombstoneKind(row?.kind ?? row?.type),
    deletedAt: row?.deletedAt ?? row?.deleted_at ?? row?.updatedAt ?? row?.updated_at ?? null,
    revision: normalizeRevision(row?.revision),
    updatedAt: normalizeUpdatedAt(row),
    replicationConfirmed: Boolean(row?.replicationConfirmed),
    pendingSync: Boolean(row?.pendingSync),
    syncState: row?.syncState,
    syncError: row?.syncError ?? "",
  }))
  .filter((row) => row.id && row.kind && row.deletedAt)
  .sort((a, b) => toTimestamp(a.deletedAt) - toTimestamp(b.deletedAt));

const isEntrySuppressedByTombstone = (entry, tombstone) => {
  if (!entry?.id || !tombstone?.id || entry.id !== tombstone.id) return false;
  const winner = resolveSyncConflict(
    { ...entry, deletedAt: null },
    { ...tombstone, deletedAt: tombstone.deletedAt, date: entry?.date ?? tombstone.deletedAt },
  );
  return winner?.deletedAt != null;
};

export const applyTombstonesToCollection = (items = [], tombstones = [], kind = "") => {
  const activeTombstones = normalizeTombstones(tombstones).filter((row) => row.kind === kind);
  if (!activeTombstones.length) return ensureArray(items);
  const tombstoneByEntity = new Map(activeTombstones.map((row) => [tombstoneEntityKey(row), row]));
  return ensureArray(items).filter((entry) => {
    const tombstone = tombstoneByEntity.get(tombstoneEntityKey({ id: entry?.id, kind }));
    if (!tombstone) return true;
    return !isEntrySuppressedByTombstone(entry, tombstone);
  });
};

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const hasConflictingActiveEntity = (entry, activityByKind = {}) => {
  const activeRows = ensureArray(activityByKind?.[entry?.kind]);
  return activeRows.some((row) => String(row?.id || "") === entry.id);
};

export const pruneTombstonesForRetention = (rows = [], {
  now = Date.now(),
  retentionMs = TOMBSTONE_RETENTION_MS,
  activityByKind = {},
} = {}) => normalizeTombstones(rows).filter((entry) => {
  if (!entry.replicationConfirmed) return true;
  if (entry.pendingSync) return true;
  if (entry.syncState && entry.syncState !== "synced") return true;
  if (hasConflictingActiveEntity(entry, activityByKind)) return true;
  const deletedAtTs = toTimestamp(entry.deletedAt);
  if (!deletedAtTs) return true;
  return (now - deletedAtTs) < retentionMs;
});

export const SESSION_SYNC_FETCH_FIELD_MAP = {
  plannedDuration: "planned_duration",
  actualDuration: "actual_duration",
  distressLevel: "distress_level",
  result: "result",
  latencyToFirstDistress: "latency_to_first_distress",
  distressType: "distress_type",
  distressSeverity: "distress_severity",
  context: "context",
  symptoms: "symptoms",
  recoverySeconds: "recovery_seconds",
  preSession: "pre_session",
  environment: "environment",
  revision: "revision",
  updatedAt: "updated_at",
};

export const SESSION_SYNC_FETCH_SELECT = [
  "id",
  "dog_id",
  "date",
  ...Object.values(SESSION_SYNC_FETCH_FIELD_MAP),
  "deleted_at",
].join(",");

export const WALKS_SYNC_FETCH_SELECT = [
  "id",
  "dog_id",
  "date",
  "duration",
  "walk_type",
  "revision",
  "updated_at",
  "deleted_at",
].join(",");

export const PATTERNS_SYNC_FETCH_SELECT = "id,dog_id,date,type,revision,updated_at,deleted_at";
export const FEEDINGS_SYNC_FETCH_SELECT = "id,dog_id,date,food_type,amount,revision,updated_at,deleted_at";
const OPTIONAL_SYNC_TABLES = ["patterns", "feedings"];

const mapSyncFetchSessionRow = (r) => ({
  id: r.id,
  date: r.date,
  plannedDuration: r[SESSION_SYNC_FETCH_FIELD_MAP.plannedDuration],
  actualDuration: r[SESSION_SYNC_FETCH_FIELD_MAP.actualDuration],
  distressLevel: r[SESSION_SYNC_FETCH_FIELD_MAP.distressLevel],
  result: r[SESSION_SYNC_FETCH_FIELD_MAP.result],
  latencyToFirstDistress: r[SESSION_SYNC_FETCH_FIELD_MAP.latencyToFirstDistress],
  distressType: r[SESSION_SYNC_FETCH_FIELD_MAP.distressType],
  distressSeverity: r[SESSION_SYNC_FETCH_FIELD_MAP.distressSeverity],
  context: r[SESSION_SYNC_FETCH_FIELD_MAP.context],
  symptoms: r[SESSION_SYNC_FETCH_FIELD_MAP.symptoms],
  recoverySeconds: r[SESSION_SYNC_FETCH_FIELD_MAP.recoverySeconds],
  preSession: r[SESSION_SYNC_FETCH_FIELD_MAP.preSession],
  environment: r[SESSION_SYNC_FETCH_FIELD_MAP.environment],
  revision: r[SESSION_SYNC_FETCH_FIELD_MAP.revision],
  updatedAt: r[SESSION_SYNC_FETCH_FIELD_MAP.updatedAt],
  deletedAt: r.deleted_at ?? null,
});

export const syncFetch = async (dogId) => {
  const id = canonicalDogId(dogId);
  const dogFilter = `dog_id=eq.${encodeURIComponent(id)}`;
  const sessionsSelect = SESSION_SYNC_FETCH_SELECT;
  const walksSelect = WALKS_SYNC_FETCH_SELECT;
  const patternsSelect = PATTERNS_SYNC_FETCH_SELECT;
  const feedingsSelect = FEEDINGS_SYNC_FETCH_SELECT;
  const parseMissingColumn = (errorText) => {
    const text = String(errorText || "");
    const match = text.match(/column\s+([a-zA-Z0-9_."]+)\s+does not exist/i);
    return match ? match[1].replace(/^.*\./, "").replace(/"/g, "") : null;
  };
  const extractErrorMessage = (errorText) => {
    const raw = String(errorText || "");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.message === "string") return parsed.message;
    } catch {}
    return raw;
  };
  const isMissingTableError = (errorText) => /relation\s+["']?[a-zA-Z0-9_.]+["']?\s+does not exist/i.test(extractErrorMessage(errorText));
  const fetchTableWithFallback = async ({ table, baseColumns, optional = false }) => {
    let selectedColumns = [...baseColumns];
    let attempt = 0;
    while (attempt < 12) {
      const select = selectedColumns.join(",");
      const res = await sbReq(`${table}?${dogFilter}&select=${select}&order=date.asc`, { trigger: `syncFetch:${table}` });
      if (res.ok) return { table, ok: true, res, select, droppedColumns: [], degraded: false };

      if (optional && isMissingTableError(res.error)) {
        recordSyncDegradation({
          code: "missing_optional_table",
          operation: "fetch",
          table,
          message: `Optional ${table} history could not be fetched because the ${table} table is missing. Sync remains available for other activity.`,
        });
        logSyncDebug("syncFetch:optionalTableMissing", { table, error: res.error });
        return { table, ok: true, res: { ok: true, data: [], error: null, status: res.status }, select, droppedColumns: [], degraded: true };
      }

      const missingColumn = parseMissingColumn(res.error);
      if (!missingColumn) return { table, ok: false, res, select, droppedColumns: [], degraded: false };

      const nextColumns = selectedColumns.filter((column) => column !== missingColumn);
      if (nextColumns.length === selectedColumns.length) {
        return { table, ok: false, res, select, droppedColumns: [], degraded: false };
      }
      recordSyncDegradation({
        code: "missing_fetch_column",
        operation: "fetch",
        table,
        field: missingColumn,
        message: `Sync for ${table} is running in compatibility mode because ${table}.${missingColumn} is unavailable. Some fields may be omitted until the schema is updated.`,
      });
      logSyncDebug("syncFetch:retryWithoutMissingColumn", { table, missingColumn, previousSelect: select });
      selectedColumns = nextColumns;
      attempt += 1;
    }
    return {
      table,
      ok: false,
      res: { ok: false, data: null, error: `Exceeded retry attempts for ${table}`, status: 0 },
      select: selectedColumns.join(","),
      droppedColumns: [],
      degraded: false,
    };
  };
  const tableQueryShapes = {
    dogs: "id,settings",
    sessions: sessionsSelect,
    walks: walksSelect,
    patterns: patternsSelect,
    feedings: feedingsSelect,
  };
  logSyncDebug("syncFetch:start", { enteredDogId: dogId, canonicalDogId: id, dogQueryField: "dogs.id", dogQueryValue: id });
  logSyncDebug("syncFetch:queryShapes", tableQueryShapes);
  const [dogRes, sessionsFetch, walksFetch, patternsFetch, feedingsFetch] = await Promise.all([
    sbReq(`dogs?id=eq.${encodeURIComponent(id)}&select=id,settings&limit=1`, { trigger: "syncFetch:dogs" }),
    fetchTableWithFallback({
      table: "sessions",
      baseColumns: sessionsSelect.split(","),
      optional: false,
    }),
    fetchTableWithFallback({
      table: "walks",
      baseColumns: walksSelect.split(","),
      optional: false,
    }),
    fetchTableWithFallback({
      table: "patterns",
      baseColumns: patternsSelect.split(","),
      optional: true,
    }),
    fetchTableWithFallback({
      table: "feedings",
      baseColumns: feedingsSelect.split(","),
      optional: true,
    }),
  ]);

  const sessRes = sessionsFetch.res;
  const walkRes = walksFetch.res;
  const patRes = patternsFetch.res;
  const feedingRes = feedingsFetch.res;
  const missingOptionalTables = [patternsFetch, feedingsFetch]
    .filter((fetchResult) => OPTIONAL_SYNC_TABLES.includes(fetchResult.table) && fetchResult.degraded)
    .map((fetchResult) => fetchResult.table);

  const syncCapability = {
    mode: missingOptionalTables.length ? "partial" : "full",
    missingOptionalTables,
    tableSupport: {
      sessions: { supported: true, optional: false },
      walks: { supported: true, optional: false },
      patterns: { supported: !missingOptionalTables.includes("patterns"), optional: true },
      feedings: { supported: !missingOptionalTables.includes("feedings"), optional: true },
    },
  };
  if (syncCapability.mode === "partial") {
    const unsupportedTables = missingOptionalTables.join(", ");
    recordSyncDegradation({
      code: "partial_sync_capability",
      operation: "fetch",
      table: "sync",
      message: `Sync is running with partial table support. Unsupported optional tables: ${unsupportedTables}.`,
    });
  }

  const resourceErrors = [
    { table: "sessions", res: sessRes, queryShape: sessionsFetch.select },
    { table: "walks", res: walkRes, queryShape: walksFetch.select },
    { table: "patterns", res: patRes, queryShape: patternsFetch.select, degraded: patternsFetch.degraded },
    { table: "feedings", res: feedingRes, queryShape: feedingsFetch.select, degraded: feedingsFetch.degraded },
  ];
  resourceErrors.forEach(({ table, res, queryShape, degraded = false }) => {
    if (degraded) {
      logSyncDebug("syncFetch:tableFetchDegraded", { table, queryShape });
      return;
    }
    if (res.ok) return;
    const missingColumn = parseMissingColumn(res.error);
    logSyncDebug("syncFetch:tableFetchFailed", { table, queryShape, status: res.status, missingColumn, error: res.error });
  });

  if (!dogRes.ok) {
    logSyncDebug("syncFetch:dogLookupFailed", { dogId: id, error: dogRes.error });
    return { result: null, error: `Dog lookup failed: ${dogRes.error}` };
  }

  const dogRows = Array.isArray(dogRes.data) ? dogRes.data : [];
  const matchedDog = dogRows.find((d) => canonicalDogId(d?.id) === id) ?? null;
  logSyncDebug("syncFetch:dogLookupResult", {
    dogId: id,
    dogFound: Boolean(matchedDog),
    dogRowsReturned: dogRows.length,
    usedLocalFallback: false,
  });

  const relatedErrors = [
    !sessRes.ok ? `sessions: ${sessRes.error}` : null,
    !walkRes.ok ? `walks: ${walkRes.error}` : null,
    !patRes.ok ? `patterns: ${patRes.error}` : null,
    !feedingRes.ok ? `feedings: ${feedingRes.error}` : null,
  ].filter(Boolean);

  const sessRows = Array.isArray(sessRes.data) ? sessRes.data : [];
  const walkRows = Array.isArray(walkRes.data) ? walkRes.data : [];
  const patRows = Array.isArray(patRes.data) ? patRes.data : [];
  const feedingRows = Array.isArray(feedingRes.data) ? feedingRes.data : [];
  const tombstones = normalizeTombstones([
    ...sessRows.filter((row) => row?.deleted_at).map((row) => ({ id: row.id, kind: "session", deleted_at: row.deleted_at, revision: row.revision, updated_at: row.updated_at })),
    ...walkRows.filter((row) => row?.deleted_at).map((row) => ({ id: row.id, kind: "walk", deleted_at: row.deleted_at, revision: row.revision, updated_at: row.updated_at })),
    ...patRows.filter((row) => row?.deleted_at).map((row) => ({ id: row.id, kind: "pattern", deleted_at: row.deleted_at, revision: row.revision, updated_at: row.updated_at })),
    ...feedingRows.filter((row) => row?.deleted_at).map((row) => ({ id: row.id, kind: "feeding", deleted_at: row.deleted_at, revision: row.revision, updated_at: row.updated_at })),
  ]);

  return {
    error: relatedErrors.length ? `Related data fetch failed (${relatedErrors.join(" | ")})` : null,
    degradation: getSyncDegradationState(),
    result: {
      syncCapability,
      dog: matchedDog
        ? {
            ...(matchedDog.settings && typeof matchedDog.settings === "object" ? matchedDog.settings : {}),
            id: canonicalDogId(matchedDog.id),
          }
        : null,
      tombstones,
      sessions: normalizeSessions(sessRows.filter((row) => !row?.deleted_at).map(mapSyncFetchSessionRow)),
      walks: walkRows.filter((row) => !row?.deleted_at).map((r) => ({
        id: r.id,
        date: r.date,
        duration: r.duration,
        type: normalizeWalkType(r.walk_type),
        revision: r.revision,
        updatedAt: r.updated_at,
      })),
      patterns: normalizePatterns(patRows.filter((row) => !row?.deleted_at).map((r) => ({
        id: r.id,
        date: r.date,
        type: r.type,
        revision: r.revision,
        updatedAt: r.updated_at,
      }))),
      feedings: normalizeFeedings(feedingRows.filter((row) => !row?.deleted_at).map((r) => ({
        id: r.id,
        date: r.date,
        food_type: r.food_type,
        amount: r.amount,
        revision: r.revision,
        updatedAt: r.updated_at,
      }))),
    },
  };
};



export const syncUpsertDog = async (dog) => {
  const localDog = normalizeDogSyncMetadata(dog);
  const id = canonicalDogId(localDog?.id);
  if (!id) return { ok: false, error: "Dog ID missing" };
  const remoteLookup = await sbReq(`dogs?id=eq.${encodeURIComponent(id)}&select=id,settings&limit=1`, { trigger: "syncUpsertDog:lookup" });
  if (!remoteLookup.ok) return { ok: false, error: `Dog lookup failed before upsert: ${remoteLookup.error}` };
  const remoteRow = Array.isArray(remoteLookup.data) ? remoteLookup.data[0] : null;
  const remoteDog = remoteRow?.settings && typeof remoteRow.settings === "object"
    ? normalizeDogSyncMetadata({ ...remoteRow.settings, id: canonicalDogId(remoteRow.id) })
    : { id };
  const mergedDog = resolveDogSettingsConflict(localDog, remoteDog);
  const res = await sbReq("dogs", {
    method: "POST",
    body: JSON.stringify({ id, settings: { ...mergedDog, id } }),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  return res.ok ? { ok: true, error: null } : { ok: false, error: `Dog upsert failed: ${res.error}` };
};

export const syncPush = async (dogId, kind, data, dogSettings = null) => {
  const id = canonicalDogId(dogId);
  const dogReady = await syncUpsertDog(dogSettings && typeof dogSettings === "object" ? { ...dogSettings, id } : { id });
  if (!dogReady.ok) return { ok: false, error: dogReady.error };

  const table = kind === "session" ? "sessions" : kind === "walk" ? "walks" : kind === "pattern" ? "patterns" : "feedings";
  const row = kind === "session"
    ? {
        id: String(data.id),
        dog_id: id,
        date: data.date,
        planned_duration: data.plannedDuration,
        actual_duration: data.actualDuration,
        distress_level: data.distressLevel,
        result: data.result,
        latency_to_first_distress: data.latencyToFirstDistress ?? null,
        distress_type: data.distressType ?? null,
        distress_severity: normalizeDistressLevel(data.distressSeverity ?? data.distressLevel ?? null),
        context: data.context ?? null,
        symptoms: data.symptoms ?? null,
        recovery_seconds: data.recoverySeconds ?? null,
        pre_session: data.preSession ?? null,
        environment: data.environment ?? null,
        revision: data.revision ?? null,
        updated_at: data.updatedAt ?? null,
      }
    : kind === "walk"
      ? {
          id: data.id,
          dog_id: id,
          date: data.date,
          duration: data.duration,
          walk_type: normalizeWalkType(data.type),
          revision: data.revision ?? null,
          updated_at: data.updatedAt ?? null,
        }
      : kind === "pattern"
      ? {
          id: String(data.id),
          dog_id: id,
          date: data.date,
          type: data.type,
          revision: data.revision ?? null,
          updated_at: data.updatedAt ?? null,
        }
      : {
          id: String(data.id),
          dog_id: id,
          date: data.date,
          food_type: data.foodType,
          amount: data.amount,
          revision: data.revision ?? null,
          updated_at: data.updatedAt ?? null,
        };

  const postRow = (payload) => sbReq(table, {
    method: "POST",
    body: JSON.stringify(payload),
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  let sessionPayload = { ...row };
  let res = await postRow(sessionPayload);

  if (!res.ok && kind === "session") {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts && !res.ok; attempt += 1) {
      const errorText = String(res.error || "");
      const missingColumn = errorText.match(/Could not find the '([^']+)' column/i)?.[1];
      if (missingColumn && missingColumn in sessionPayload) {
        recordSyncDegradation({
          code: "missing_push_column",
          operation: "push",
          table: "sessions",
          field: missingColumn,
          message: `Session sync used compatibility mode and skipped ${missingColumn} because that column is missing on the server.`,
        });
        delete sessionPayload[missingColumn];
        res = await postRow(sessionPayload);
        continue;
      }

      if (/(latency_to_first_distress|distress_type)/i.test(errorText)) {
        recordSyncDegradation({
          code: "missing_push_column",
          operation: "push",
          table: "sessions",
          field: "latency_to_first_distress,distress_type",
          message: "Session sync used compatibility mode and skipped latency/distress-type fields because the server schema is behind.",
        });
        delete sessionPayload.latency_to_first_distress;
        delete sessionPayload.distress_type;
        res = await postRow(sessionPayload);
        continue;
      }

      if (/distress_severity/i.test(errorText)) {
        recordSyncDegradation({
          code: "missing_push_column",
          operation: "push",
          table: "sessions",
          field: "distress_severity",
          message: "Session sync used compatibility mode and skipped distress severity because the server schema is behind.",
        });
        delete sessionPayload.distress_severity;
        res = await postRow(sessionPayload);
        continue;
      }

      if (/(distress_level|sessions_distress_level_check|check constraint)/i.test(errorText)) {
        const mappedDistressLevel = mapDistressForLegacySupabase(data.distressLevel);
        const encodedLegacyType = encodeLegacyDistressType(data.distressType, data.distressLevel);
        if (sessionPayload.distress_level !== mappedDistressLevel) {
          sessionPayload.distress_level = mappedDistressLevel;
        }
        if (sessionPayload.distress_type !== encodedLegacyType) {
          sessionPayload.distress_type = encodedLegacyType;
        }
        res = await postRow(sessionPayload);
        continue;
      }

      break;
    }
  }

  if (res.ok) return { ok: true, error: null };

  if (kind === "walk" && /walk_type/i.test(String(res.error || ""))) {
    return {
      ok: false,
      error: "walk push failed: Supabase is missing walks.walk_type. Run supabase_sync_schema_migration.sql (or add walks.walk_type text not null default 'regular_walk').",
    };
  }

  return { ok: false, error: `${kind} push failed: ${res.error}` };
};

export const syncDelete = async (kind, id) => {
  const table = kind === "session" ? "sessions" : kind === "walk" ? "walks" : kind === "pattern" ? "patterns" : "feedings";
  const res = await sbReq(`${table}?id=eq.${String(id)}`, { method: "DELETE" });
  return res.ok;
};

const buildSchemaCompatibleTombstonePayload = (kind, dogId, tombstone) => {
  const deletedAt = tombstone.deletedAt;
  const updatedAt = tombstone.updatedAt ?? deletedAt;
  const revision = Number.isFinite(tombstone.revision) ? tombstone.revision : 0;
  const base = {
    id: String(tombstone.id),
    dog_id: dogId,
    deleted_at: deletedAt,
    revision,
    updated_at: updatedAt,
  };
  if (kind === "session") {
    return {
      ...base,
      date: deletedAt,
      planned_duration: 0,
      actual_duration: 0,
      distress_level: "none",
      result: "success",
    };
  }
  if (kind === "walk") {
    return {
      ...base,
      date: deletedAt,
      duration: 0,
      walk_type: "regular_walk",
    };
  }
  if (kind === "pattern") {
    return {
      ...base,
      date: deletedAt,
      type: "keys",
    };
  }
  return {
    ...base,
    date: deletedAt,
    food_type: "tombstone",
    amount: "0",
  };
};

const isStrictSchemaNotNullError = (errorText = "") => /null value in column .* violates not-null constraint/i.test(errorText);

export const syncPushTombstone = async (dogId, tombstone, dogSettings = null) => {
  const id = canonicalDogId(dogId);
  const dogReady = await syncUpsertDog(dogSettings && typeof dogSettings === "object" ? { ...dogSettings, id } : { id });
  if (!dogReady.ok) return { ok: false, error: dogReady.error };
  const kind = normalizeTombstoneKind(tombstone?.kind);
  if (!kind || !tombstone?.id || !tombstone?.deletedAt) return { ok: false, error: "Invalid tombstone payload" };
  const table = kind === "session" ? "sessions" : kind === "walk" ? "walks" : kind === "pattern" ? "patterns" : "feedings";
  const metadataOnlyPayload = {
    id: String(tombstone.id),
    dog_id: id,
    deleted_at: tombstone.deletedAt,
    revision: Number.isFinite(tombstone.revision) ? tombstone.revision : 0,
    updated_at: tombstone.updatedAt ?? tombstone.deletedAt,
  };

  const pushPayload = (payload) => sbReq(table, {
    method: "POST",
    body: JSON.stringify(payload),
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  let res = await pushPayload(metadataOnlyPayload);
  if (!res.ok && isStrictSchemaNotNullError(String(res.error || ""))) {
    const strictPayload = buildSchemaCompatibleTombstonePayload(kind, id, tombstone);
    res = await pushPayload(strictPayload);
  }

  return res.ok ? { ok: true, error: null } : { ok: false, error: `${kind} tombstone push failed: ${res.error}` };
};

export const makeEntryId = (kind, dogId) => `${kind}-${canonicalDogId(dogId)}-${Date.now()}`;

export const hydrateDogFromLocal = (dogId) => {
  const id = canonicalDogId(dogId);
  const v4 = load(sessKey(id), null);
  const v4Sessions = load(legacySessKeyV4(id), null);
  const rawSessions = Array.isArray(v4)
    ? v4
    : Array.isArray(v4Sessions)
      ? v4Sessions
      : ensureArray(load(legacySessKey(id), []));
  const localSessions = normalizeSessions(rawSessions);
  if (!Array.isArray(v4)) save(sessKey(id), localSessions);
  return {
    sessions: localSessions,
    walks: ensureArray(load(walkKey(id), load(legacyWalkKey(id), []))).map((w) => ({ ...w, type: normalizeWalkType(w?.type) })),
    patterns: normalizePatterns(load(patKey(id), [])),
    feedings: normalizeFeedings(load(feedingKey(id), [])),
    tombstones: normalizeTombstones(load(tombKey(id), [])),
    patLabels: ensureObject(load(patLblKey(id), {})),
    photo: load(photoKey(id), null),
  };
};

export const toDateTimeLocalValue = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Dog ID: up to 6-letter prefix + 4-digit number (e.g. LUNA-4829) ─────────
export const generateId = (name) => {
  const prefix = (name || "DOG").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6).padEnd(3, "X");
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${n}`;
};
