import { PROTOCOL, normalizeDistressLevel } from "../../lib/protocol";
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

const normalizeSbUrl = (value) => String(value || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
export const SB_BASE_URL = normalizeSbUrl(SB_URL);

const sbReq = async (path, opts = {}) => {
  if (!SB_BASE_URL || !SB_KEY) {
    return { ok: false, data: null, error: "Supabase env vars are missing", status: 0 };
  }
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

export const resolveSyncConflict = (left = {}, right = {}) => {
  const leftRevision = getRecordRevision(left);
  const rightRevision = getRecordRevision(right);
  if (leftRevision !== null && rightRevision !== null && leftRevision !== rightRevision) {
    return leftRevision > rightRevision ? left : right;
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

  return right;
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

export const normalizeSession = (row = {}) => {
  const context = row.context ?? {};
  const symptoms = row.symptoms ?? {};
  const preSession = row.preSession ?? row.pre_session ?? {};
  const environment = row.environment ?? {};
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
    distressLevel: normalizeDistressLevel(row.distressLevel ?? row.distress_level ?? (row.result === "success" ? "none" : "strong")),
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
    belowThreshold: hasValue(row.belowThreshold)
      ? !!row.belowThreshold
      : hasValue(row.below_threshold)
        ? asBool(row.below_threshold)
        : undefined,
    distressType: row.distressType ?? row.distress_type ?? null,
    distressSeverity: row.distressSeverity ?? row.distress_severity ?? null,
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
    belowThreshold: distressLevel === "none" && actualDuration >= plannedDuration,
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

export const normalizeSessions = (rows = []) => ensureArray(rows).map(normalizeSession);
export const normalizeFeedings = (rows = []) => ensureArray(rows)
  .map((row) => ({
    id: String(row?.id || ""),
    date: row?.date || new Date().toISOString(),
    foodType: row?.foodType ?? row?.food_type ?? "meal",
    amount: row?.amount ?? "small",
    revision: Number.isFinite(row?.revision) ? Number(row.revision) : null,
    updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
  }))
  .filter((row) => row.id)
  .sort((a, b) => new Date(a.date) - new Date(b.date));

export const SESSION_SYNC_FETCH_FIELD_MAP = {
  plannedDuration: "planned_duration",
  actualDuration: "actual_duration",
  distressLevel: "distress_level",
  result: "result",
  latencyToFirstDistress: "latency_to_first_distress",
  distressType: "distress_type",
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
].join(",");

const mapSyncFetchSessionRow = (r) => ({
  id: r.id,
  date: r.date,
  plannedDuration: r[SESSION_SYNC_FETCH_FIELD_MAP.plannedDuration],
  actualDuration: r[SESSION_SYNC_FETCH_FIELD_MAP.actualDuration],
  distressLevel: r[SESSION_SYNC_FETCH_FIELD_MAP.distressLevel],
  result: r[SESSION_SYNC_FETCH_FIELD_MAP.result],
  latencyToFirstDistress: r[SESSION_SYNC_FETCH_FIELD_MAP.latencyToFirstDistress],
  distressType: r[SESSION_SYNC_FETCH_FIELD_MAP.distressType],
  context: r[SESSION_SYNC_FETCH_FIELD_MAP.context],
  symptoms: r[SESSION_SYNC_FETCH_FIELD_MAP.symptoms],
  recoverySeconds: r[SESSION_SYNC_FETCH_FIELD_MAP.recoverySeconds],
  preSession: r[SESSION_SYNC_FETCH_FIELD_MAP.preSession],
  environment: r[SESSION_SYNC_FETCH_FIELD_MAP.environment],
  revision: r[SESSION_SYNC_FETCH_FIELD_MAP.revision],
  updatedAt: r[SESSION_SYNC_FETCH_FIELD_MAP.updatedAt],
});

export const syncFetch = async (dogId) => {
  const id = canonicalDogId(dogId);
  const dogFilter = `dog_id=eq.${encodeURIComponent(id)}`;
  const sessionsSelect = SESSION_SYNC_FETCH_SELECT;
  const walksSelect = "id,dog_id,date,duration,walk_type,revision,updated_at";
  const patternsSelect = "id,dog_id,date,type,revision,updated_at";
  const feedingsSelect = "id,dog_id,date,food_type,amount,revision,updated_at";
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
      const res = await sbReq(`${table}?${dogFilter}&select=${select}&order=date.asc`);
      if (res.ok) return { table, ok: true, res, select, droppedColumns: [], degraded: false };

      if (optional && isMissingTableError(res.error)) {
        logSyncDebug("syncFetch:optionalTableMissing", { table, error: res.error });
        return { table, ok: true, res: { ok: true, data: [], error: null, status: res.status }, select, droppedColumns: [], degraded: true };
      }

      const missingColumn = parseMissingColumn(res.error);
      if (!missingColumn) return { table, ok: false, res, select, droppedColumns: [], degraded: false };

      const nextColumns = selectedColumns.filter((column) => column !== missingColumn);
      if (nextColumns.length === selectedColumns.length) {
        return { table, ok: false, res, select, droppedColumns: [], degraded: false };
      }
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
    sbReq(`dogs?id=eq.${encodeURIComponent(id)}&select=id,settings&limit=1`),
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

  return {
    error: relatedErrors.length ? `Related data fetch failed (${relatedErrors.join(" | ")})` : null,
    result: {
      dog: matchedDog
        ? {
            ...(matchedDog.settings && typeof matchedDog.settings === "object" ? matchedDog.settings : {}),
            id: canonicalDogId(matchedDog.id),
          }
        : null,
      sessions: normalizeSessions(sessRows.map(mapSyncFetchSessionRow)),
      walks: walkRows.map((r) => ({
        id: r.id,
        date: r.date,
        duration: r.duration,
        type: normalizeWalkType(r.walk_type),
        revision: r.revision,
        updatedAt: r.updated_at,
      })),
      patterns: patRows.map((r) => ({ id: r.id, date: r.date, type: r.type, revision: r.revision, updatedAt: r.updated_at })),
      feedings: normalizeFeedings(feedingRows.map((r) => ({
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
  const id = canonicalDogId(dog?.id);
  if (!id) return { ok: false, error: "Dog ID missing" };
  const res = await sbReq("dogs", {
    method: "POST",
    body: JSON.stringify({ id, settings: { ...(dog || {}), id } }),
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
        delete sessionPayload[missingColumn];
        res = await postRow(sessionPayload);
        continue;
      }

      if (/(latency_to_first_distress|distress_type)/i.test(errorText)) {
        delete sessionPayload.latency_to_first_distress;
        delete sessionPayload.distress_type;
        res = await postRow(sessionPayload);
        continue;
      }

      if (/(distress_level|sessions_distress_level_check|check constraint)/i.test(errorText)) {
        const mappedDistressLevel = mapDistressForLegacySupabase(data.distressLevel);
        if (sessionPayload.distress_level !== mappedDistressLevel) {
          sessionPayload.distress_level = mappedDistressLevel;
          res = await postRow(sessionPayload);
          continue;
        }
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

export const syncDeleteSessionsForDog = async (dogId) => {
  const res = await sbReq(`sessions?dog_id=eq.${encodeURIComponent(canonicalDogId(dogId))}`, { method: "DELETE" });
  return res.ok;
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
    patterns: ensureArray(load(patKey(id), [])),
    feedings: normalizeFeedings(load(feedingKey(id), [])),
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
