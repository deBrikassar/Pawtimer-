import { useState, useEffect, useRef, useCallback } from "react";
import { PROTOCOL, getNextDurationSeconds, normalizeDistressLevel, suggestNext, suggestNextWithContext } from "./lib/protocol";
import { TYPOGRAPHY_CSS_VARS, CHART_TYPOGRAPHY } from "./typography";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const DOGS_KEY       = "pawtimer_dogs_v3";
const ACTIVE_DOG_KEY = "pawtimer_active_dog_v3";
const SESS_SCHEMA_VERSION = 5;
const sessKey    = (id) => `pawtimer_sess_v${SESS_SCHEMA_VERSION}_${id}`;
const legacySessKeyV4 = (id) => `pawtimer_sess_v4_${id}`;
const legacySessKey = (id) => `pawtimer_sess_v3_${id}`;
const legacyWalkKey = (id) => `pawtimer_walk_v3_${id}`;
const walkKey    = (id) => `pawtimer_walk_v4_${id}`;
const feedingKey = (id) => `pawtimer_feed_v1_${id}`;
const patKey     = (id) => `pawtimer_pat_v3_${id}`;
const patLblKey  = (id) => `pawtimer_patlbl_v3_${id}`;  // custom pattern labels
const photoKey   = (id) => `pawtimer_photo_v3_${id}`;   // dog photo (base64)

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const ensureObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// ─── Cross-device sync (Supabase REST — no SDK needed) ────────────────────────
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel env vars to enable.
// Without them the app works fine with localStorage only.
const SB_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL)  ?? "";
const SB_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ?? "";
const SYNC_ENABLED = Boolean(SB_URL && SB_KEY);
const canonicalDogId = (value) => String(value || "").trim().toUpperCase();
const SYNC_DEBUG = (typeof import.meta !== "undefined" && import.meta.env?.DEV)
  || (typeof window !== "undefined" && window.localStorage?.getItem("pawtimer_sync_debug") === "1");

const logSyncDebug = (...args) => {
  if (!SYNC_DEBUG) return;
  console.info("[pawtimer-sync]", ...args);
};

const normalizeSbUrl = (value) => String(value || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const SB_BASE_URL = normalizeSbUrl(SB_URL);

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

// Merge two arrays by id — newer item wins, preserves chronological order
const mergeById = (a = [], b = []) => {
  const m = {};
  [...a, ...b].forEach(x => { if (x?.id) m[x.id] = x; });
  return Object.values(m).sort((x, y) => new Date(x.date) - new Date(y.date));
};

const asBool = (value) => value === true || value === 1;
const hasValue = (value) => value !== null && value !== undefined;

const normalizeSymptom = (value) => {
  if (Number.isFinite(value)) return Math.max(0, Number(value));
  return asBool(value) ? 1 : 0;
};

const normalizeSession = (row = {}) => {
  const context = row.context ?? {};
  const symptoms = row.symptoms ?? {};
  const preSession = row.preSession ?? row.pre_session ?? {};
  const environment = row.environment ?? {};

  const normalized = {
    ...row,
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

const normalizeSessions = (rows = []) => ensureArray(rows).map(normalizeSession);
const normalizeFeedings = (rows = []) => ensureArray(rows)
  .map((row) => ({
    id: String(row?.id || ""),
    date: row?.date || new Date().toISOString(),
    foodType: row?.foodType ?? row?.food_type ?? "meal",
    amount: row?.amount ?? "small",
  }))
  .filter((row) => row.id)
  .sort((a, b) => new Date(a.date) - new Date(b.date));

const syncFetch = async (dogId) => {
  const id = canonicalDogId(dogId);
  const dogFilter = `dog_id=eq.${encodeURIComponent(id)}`;
  logSyncDebug("syncFetch:start", { enteredDogId: dogId, canonicalDogId: id, dogQueryField: "dogs.id", dogQueryValue: id });
  const [dogRes, sessPrimaryRes, walkPrimaryRes, patRes, feedingRes] = await Promise.all([
    sbReq(`dogs?id=eq.${encodeURIComponent(id)}&select=id,settings&limit=1`),
    sbReq(`sessions?${dogFilter}&select=id,date,planned_duration,actual_duration,distress_level,result,latency_to_first_distress,distress_type,context,symptoms,recovery_seconds,pre_session,environment&order=date.asc`),
    sbReq(`walks?${dogFilter}&select=id,date,duration,walk_type&order=date.asc`),
    sbReq(`patterns?${dogFilter}&select=id,date,type&order=date.asc`),
    sbReq(`feedings?${dogFilter}&select=id,date,food_type,amount&order=date.asc`),
  ]);

  let sessRes = sessPrimaryRes;
  if (!sessRes.ok && /(latency_to_first_distress|distress_type)/i.test(String(sessRes.error || ""))) {
    sessRes = await sbReq(`sessions?${dogFilter}&select=id,date,planned_duration,actual_duration,distress_level,result,context,symptoms,recovery_seconds,pre_session,environment&order=date.asc`);
  }

  let walkRes = walkPrimaryRes;
  if (!walkRes.ok && /walk_type/i.test(String(walkRes.error || ""))) {
    walkRes = await sbReq(`walks?${dogFilter}&select=id,date,duration&order=date.asc`);
  }

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
      sessions: normalizeSessions(sessRows.map((r) => ({
        id: r.id,
        date: r.date,
        plannedDuration: r.planned_duration,
        actualDuration: r.actual_duration,
        distressLevel: r.distress_level,
        result: r.result,
        latencyToFirstDistress: r.latency_to_first_distress,
        distressType: r.distress_type,
        context: r.context,
        symptoms: r.symptoms,
        recoverySeconds: r.recovery_seconds,
        preSession: r.pre_session,
        environment: r.environment,
      }))),
      walks: walkRows.map((r) => ({ id: r.id, date: r.date, duration: r.duration, type: normalizeWalkType(r.walk_type) })),
      patterns: patRows.map((r) => ({ id: r.id, date: r.date, type: r.type })),
      feedings: normalizeFeedings(feedingRows.map((r) => ({ id: r.id, date: r.date, food_type: r.food_type, amount: r.amount }))),
    },
  };
};



const syncUpsertDog = async (dog) => {
  const id = canonicalDogId(dog?.id);
  if (!id) return { ok: false, error: "Dog ID missing" };
  const res = await sbReq("dogs", {
    method: "POST",
    body: JSON.stringify({ id, settings: { ...(dog || {}), id } }),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  return res.ok ? { ok: true, error: null } : { ok: false, error: `Dog upsert failed: ${res.error}` };
};

const syncPush = async (dogId, kind, data, dogSettings = null) => {
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
      }
    : kind === "walk"
      ? {
          id: data.id,
          dog_id: id,
          date: data.date,
          duration: data.duration,
          walk_type: normalizeWalkType(data.type),
        }
      : kind === "pattern"
      ? {
          id: String(data.id),
          dog_id: id,
          date: data.date,
          type: data.type,
        }
      : {
          id: String(data.id),
          dog_id: id,
          date: data.date,
          food_type: data.foodType,
          amount: data.amount,
        };

  let res = await sbReq(table, {
    method: "POST",
    body: JSON.stringify(row),
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  if (!res.ok && kind === "session" && /(latency_to_first_distress|distress_type)/i.test(String(res.error || ""))) {
    const fallbackRow = { ...row };
    delete fallbackRow.latency_to_first_distress;
    delete fallbackRow.distress_type;
    res = await sbReq(table, {
      method: "POST",
      body: JSON.stringify(fallbackRow),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
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

const syncDelete = async (kind, id) => {
  const table = kind === "session" ? "sessions" : kind === "walk" ? "walks" : kind === "pattern" ? "patterns" : "feedings";
  const res = await sbReq(`${table}?id=eq.${String(id)}`, { method: "DELETE" });
  return res.ok;
};

const syncDeleteSessionsForDog = async (dogId) => {
  const res = await sbReq(`sessions?dog_id=eq.${encodeURIComponent(canonicalDogId(dogId))}`, { method: "DELETE" });
  return res.ok;
};

const makeEntryId = (kind, dogId) => `${kind}-${canonicalDogId(dogId)}-${Date.now()}`;

const hydrateDogFromLocal = (dogId) => {
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

const toDateTimeLocalValue = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Dog ID: up to 6-letter prefix + 4-digit number (e.g. LUNA-4829) ─────────
const generateId = (name) => {
  const prefix = (name || "DOG").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6).padEnd(3, "X");
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${n}`;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) => {
  if (s == null || isNaN(s)) return "—";
  const t = Math.round(s), m = Math.floor(t / 60), sec = t % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};
const parseDurationInput = (value) => {
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
const fmtDate = (iso) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  return `${date} · ${time}`;
};
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Returns daily session info. No hard limits — just advisory warnings.
 */
function dailyInfo(sessions) {
  const today   = sessions.filter(s => isToday(s.date));
  const usedSec = today.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const count   = today.length;
  const capSec  = PROTOCOL.maxDailyAloneMinutes * 60; // advisory only
  const canAdd  = true; // no hard limit
  return { count, usedSec, capSec, canAdd, maxCount: PROTOCOL.sessionsPerDayMax };
}

/**
 * Returns pattern-break (desensitization) status for today.
 * Rule: ≥ number of complete departure rituals (walks) today,
 *       AND at least desensitizationBlocksPerDayRecommendedMin per day.
 */
function patternInfo(patterns, walks, leavesPerDay = 3, protocol = PROTOCOL) {
  const todayPat   = patterns.filter(p => isToday(p.date)).length;
  const todayWalks = walks.filter(w => isToday(w.date)).length;
  const normalizedLeaves = Math.max(1, Number(leavesPerDay) || 3);
  const leaveDelta = normalizedLeaves - 3;
  const recMinBase = protocol.desensitizationBlocksPerDayRecommendedMin;
  const recMaxBase = protocol.desensitizationBlocksPerDayRecommendedMax;
  const recMin = Math.max(1, recMinBase + Math.floor(leaveDelta / 2));
  const recMax = Math.max(recMin, recMaxBase + Math.ceil(leaveDelta / 2));
  const walkBuffer = leaveDelta > 0 ? Math.ceil(leaveDelta / 3) : 0;
  // must be ≥ walks AND ≥ recMin
  const needed = Math.max(recMin, todayWalks + walkBuffer);
  const behind = todayPat < needed;
  return { todayPat, todayWalks, recMin, recMax, needed, behind, walkBuffer, normalizedLeaves };
}

const distressLabel = (l) =>
  l === "none" ? "No distress" : l === "subtle" ? "Subtle stress" : l === "active" ? "Active distress" : l === "severe" ? "Severe distress" : "—";

const DISTRESS_TYPES = [
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

const symptomIntensity = (v) => (Number.isFinite(v) ? v : asBool(v) ? 1 : 0);

const sessionDetailBadges = (s) => {
  const badges = [];
  if (s.context?.timeOfDay) badges.push(`🕒 ${s.context.timeOfDay}`);
  if (s.context?.departureType) badges.push(`🚪 ${s.context.departureType}`);
  if (Array.isArray(s.context?.cuesUsed) && s.context.cuesUsed.length) badges.push(`🧩 ${s.context.cuesUsed.length} cue${s.context.cuesUsed.length === 1 ? "" : "s"}`);

  const symptomTotal = ["barking", "pacing", "destructive", "salivation"].reduce((sum, key) => sum + symptomIntensity(s.symptoms?.[key]), 0);
  if (symptomTotal > 0) badges.push(`💬 symptoms ${symptomTotal}`);

  if (Number.isFinite(s.recoverySeconds)) badges.push(`❤️ recovery ${fmt(s.recoverySeconds)}`);
  if (Number.isFinite(s.preSession?.walkDuration)) badges.push(`🚶 walk ${fmt(s.preSession.walkDuration)}`);
  if (s.preSession?.enrichmentGiven) badges.push("🦴 enrichment");
  if (s.environment?.noiseEvent) badges.push("🔊 noise/event");

  return badges;
};

const getLeaveProfile = (leavesPerDay = 3) => {
  const normalizedLeaves = Math.max(1, Number(leavesPerDay) || 3);
  if (normalizedLeaves <= 2) return { key: "low", confidenceScale: 0.9, desc: "lower daily departure load" };
  if (normalizedLeaves <= 4) return { key: "moderate", confidenceScale: 1, desc: "moderate daily departure load" };
  if (normalizedLeaves <= 6) return { key: "high", confidenceScale: 1.12, desc: "higher daily departure load" };
  return { key: "veryHigh", confidenceScale: 1.22, desc: "very high daily departure load" };
};

// ─── Embedded icon data URIs (base64, 64×64px, rounded corners) ─────────────
const ICONS = {
  paw: "data:image/png;base64,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",
  result_calm: "data:image/png;base64,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",
  result_mild: "data:image/png;base64,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",
  result_strong: "data:image/png;base64,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",
  walk: "data:image/png;base64,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",
  streak: "data:image/png;base64,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",
  pattern_keys: "data:image/png;base64,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",
  pattern_shoes: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAYfElEQVR42q2bebBlV3Xef2ufc+7wXne/93puDS0kQRuDIoOxpRjHKMagIhg7LpBsCtshTpXLTuJKqhI0IDupSpWJWhgo4nJAku0qMC6DNTVDQEmQUgJKZWKQJYGk1tAtqdWTenytfsMdztl75Y89nH1et2yw011d/e59d9h77TV861vfFv4ef264+1YVAYwQ/zp1qDoEQSW8UEEQQAAHIoiAKCiKcwoiGMJj2t8L4ITw6SAoquBUETGoalpP/P6P/fIt8sPuRX7YjQNI2JPEHyBtHgGNz7ZrRMOz4dW4tAG/adQbNG4IBRX/HoN6oyl+48FKqhpeB9HqAnz0+g/L/1cD3HT3bnVhBQaDGFB/1uFTJJ2IiPGnhV+UoDhcsEp7mg6DogiKCc86CXvDgCo2fItRRUUQdagDNcFiqsRtK9E7wmNV/uAHMMTf+oKb7rlNRdVvJ/pmOBOJJyXeGDjnTwVB1IeBiR+vmk5ODe1zgIH0eov6x0jyEsF7mohBncNpCKXoZxrX4L9DRTAqMf4QhN3X3fSq+zSv9osP3XNr2HqIy3SiaVutmwdXxIm3kWqwlbZGE0GSAcN7Q7hoeN5k7o8DE3KBQZBgDIPpLjp+phpETNg8IOHTVPjwXR/VH8oAN9wbYj3Fp4DTsJ8Yxd7lNItlv5s20snWoqJYfAwrAmIQNfEt3ighkSrqQ1qkNUj2NSIGY4qUg6IRjZrgO/ENSvg0brrrNv2BQuDD99ymltbVDYKqxalDjGljNDtg8SHrjSOZa6RNKDZkftGQJ8Shrs2YIoJT698mwUBh8aICLluxCWETKolKN8WmzBhD0sUqpOxekxc6D268e7fGhCaS52wwoqkgSet56fdWswfxlyqoONp9Gh8KIUQciqrzQVUIDhDnwrcaVPz7TfQsbT2rEDBifIIN3hhDTXVtCTLptETg1vfdnPZd5gZwwW0kJrZo8FSPvcsWCFaVibMYMcz2StZVPQrxm4gnncqfSMfmPqw0ZW0J1cMndhcWa8CEw6Abfo1zjFzD8rShsZZ+YTDpuwNmkOCVgAQPCbn3/CHwobtuDd/iHbwQgwY3EtGwQIOoMm4sc/0+V2zexI/Mb2DrcMC6qqLIrC+qYfuaTtSRrSpsTIJxVAyCwzlvfGNad5aACWI+sDhGjePoaMLexTM8cfI0Z6djBqVJBhdpN6toRFXhgIVb3+crQ9kxhcbyJAmAKH7zRjzamljHVTu28XMXX8imqgRnsc5hXYNHCS5FQUKEod4LhY9F1eBRmlChqCOlEAVxraeAYjQkO5QCmC+FhblZ3rCwnn+6YzsPHjrCd04cp1cWiGpKrG045MhRux5wwz23+jIdKrMIFCF9h5yDC4Xgly69jKu3bUHrKVNn/WYkFBQRJGzQZ3sTanELglzmdt2kFfBGwlYmeEeLIdok4/9z4aAqI5iq4q8PHWfPvuepZitsU6dvsjGsUjkGVWH3dTeLiYFhRBBT+NPG+M3HxSNYq1x/+eu4eutmxuMRjXMUIhRhYz5JamZfSdghYYUEdDTuOQEYD/HaHCSy5pRiPMe/4nOTEaFWGI1HXLVzG/98y3ZWj5+l7PdxzkF4TSpPYlAxYPzW5cZ7b4tnFbC2N3YhBlHBiLJaW955yU7edfGFTCYjjImAJ1SbkDSdxmbGJQ9oz72FzZ2zFEGcb4XSl/tVZ5ArfFeG7khAOn6ewzrHYP0cf3HX13nYjtjy2h1MVkYhFMPxGBDxBw0S+rkEdKL1xZcoUSZWuXjDet5+4Q7qeuqxAKnKoSI4igCBgwWR5LLaybV5bREPWwEJCc9kC0sbJovhVAnyT42QWSjE0IxWeO+7fwb38Pc4c/g01cwQDaW1kLBXjRDJYTQ0KS0AkRAGgogvd2/dvoNeSIImQ75t+Co412Z88Xg91M+E542YbDOKuID81Jc93+RItrl2sxoNJXk9iz4Qncdgpw2Djev4hbe/le//t7/AvrJKNRiAbZFtzAHOBS/zUDIDOWHBzsH8oMeu+fU0ts5gZjRUyMzq0vs06w884HGZu3NOj9DW5QAncRgTklXgALzBQ1kGnNMODDcSU41iigJ3dpmf/tmr2FiWPPmHn8edHVEMK+8JSsg3FhNCv+2cNLhI2NxUlR2zM8xVJdbFTBEQWoy/EDIaPEYyR4+13se382gtdUHSAaIea0gHNGkARm2FCiRKjvKQVA0igrV1zdz8Onb92OtZOXiU/X+yh+bsKqZXos51wsc7XViMmhAOzoHzMHXzYBgrdqd+BiAbkJ201V78v3Yj0S+cT46xhY6vMQbplEYPmFynXxOfuSOjJAYxReaxmlzMob5lLoXt2zZDv8f05VPsu/M+7NII0yvBKqIeeRrRkBxE2qSTla1BWbZxjHcfDQRHjM4AIrI6LhkPFFCkFAErmIQ1yIMu1WqXWlQXNtxpLlNt9lSKU0lwV2L3GLxlZmaIbSzFzIDp0ZPsu/M+3NKEsleh1ucp41CsBquFk2nb1ZDZI8AR9YvStURHcKdYz53rgO6UsyVPXqECqKLOhiZGvR1QcIpJHaAkY7a1xAXnV1zGCyk5TRcAlrWUwwGTIyfY9yd7sCsTyn6FWIdxanGxAY68WmQlU0nSzCE1JneMauLrQkFqM7OuaTk0x+aB1BS/+Wp2hqk1VMMZqmEPZ13IB9oJD8260ZRzAgBzgE2YwCRkamJeco5ydsjk8HH2/fF96MqEqtcjh3uBWYmEhH/e0Z5mxs9msd82yamGi2krvrTvyPGBiGAbR7Uwz9989xk+8IEPccO/282hI2fobVgPLoYOOXJIBjShBXY5a5TzO1JgjGmTLqDWUc4MGB96mef+dA92eYIRU2bsSptfDV3Wl5y5wVtehW7vnWEJNQKm9MbQbj9gUGzT0J+bY//el7jpxtuYXHs1jy8M+a1/cRNPPLaPcraPczbl+TaQNCHN3qBHryzxNKFkBtKMk8gBFbjGUQyHrB44yjN3/GVCxCFvOJ/d86Z5TSxr+6n+lGISDF6jOZYIMWmM8fDZeOM4a+nNDDl9eokP/+4nKH/5Wjb95D/iondfg1x7NZ/YfSfqpOP6ef9QFIayP+D5fUc4tbhCNewHtKc+L8irc71KyAmDHpOXT2I0q8+qgWIKpcSq64DRvHNLbrm24kl3EoAY4tJwiq0byn6fuujxn//Df+XosVP0D57gzP3fxC2t0N+wjn5VpNNHW0NIYHQmznDLjR/ntz94E//qVz/EI488TTk7xLnGB4NmCbrTdZKBN8X0Kk+ipgyc6MSMukpZOEtooSar8TVf2tSGycg7ScSIYJ3DGEP/kgt55JGn+ZVrfo19h4/xo+/4STb2DTPHTnHi03dx/M++wm/+21+j3LgBaxusa/yhKEwnNeXCHF/e8wAPfe0bXHrRVqarIz7zqc9BPUZMlZXTrHxK1oFIC9hQpYy0R5tlsyyurnvaoUp3udyQEDOUJ7SNlaofbwzmNnDs8Am+8cW/5Ktf/T/YizbTe2WVwSUXsPFNr0Ndw8rB4xz40jf5009/nqZpuOqaN/tkNGlAodqymRMvHeMLn93Dzp3bmdYNWzbN8/z+Qxx87NvsvOInqKWH2sm5DUuC6W1Xiipl/qRI27u7sPBQQ7IqoR0ePwJ8Tc1r2zFY66iqCqXgyJFTfPL3P8399/1P3vTrv8hP//Z7ef6L3+DEY3uZ23Ux9WhCb+sCb/g31/HStx7l9z7yad742Qt4+zt/istft5OyLHn2uYP82R2fpx6N2Lh1gXpa0x/2mJ5SvvfES+y8dCu2vABTDbOMlQXvGkJQFEpV2w47Qmfnq4ckd+kWdU08XVtiWg5OQ+wVhdDbsIFGCz56yyf43196gNf+6rt5z6f+E4/+0ed58YGL2H7tVWwdTbDjCZSCm0wZT8Zc/LYf44KrruDQXz3G7V97ELMy8cltfpbhlZdhv/UYq0vLVL2K0dkV6uUVvv/0Id7z8z+OO/kcbLocivlwlnIOEZqD+TJtJJSRQiIdbcLJZmcd+MLI2DeN8z29+ExfVQUMB9Af4JZGfPz37+CJp/Yx2jLHtre8nuWDx7jwXVfzxn//fqQsqJdWcI0LidIG+FIwWRojBnb+7E9w6TuuphlPUXWUvRIxBYcv2s6xB/4KJg29bZvYtOsSXjx0kulqQ2EUe2o/bJzHFL3ELGnu5eGxiFAScoDp8HO+x1Si9VI28XyAc5jCUM3NQdEDa7GjMSdOnuGlF5/hsUf38n+/+z1ePH6CZnnET/3WewHLgfsfZnr6FYbbNqHqcNb6Zkg9xx/IiVibqZdXmQYeQEISBGHHW69k84/vohmN6c/PYaeWZz/2GU4tnmXLpjnq8QRO7Ueny6EHWVPKFSIzUaYmyIVhhaj/QukAtzSScc7Sm5llNG741p6H2PvUfo6+fJKTZ86wuDpiXBX0LtjM9ne8hbdduYvv/9FdHPzmd3nNL/wTLrv+57CjGjepw3dI4A1ank8lnk7o+LKZoHdEoVkZI4VQzg6xozFF2aOpKhYXl9m6bcG37baGySthbNWNYImzCg20uKeJLC6EQqyT0qmhgnO+qXj+xaP87g1/wOJMyYZdO5n5kR3Mbv5RLts8z3DDDFIUNJMpK2deYdcHfx5bW+zyGOdcy+oE7kFSW03i7hKmc1nGzmt58E6xnsUuehWuLFlaGmNMEdw9dJ0R56UQ6OaBkjBwUPEzQDTM/51D4gJCFRApkLLPxz9yO+7Nr+VnrnsHk/EEsQ5X11hnqZfHfk5mBDEG1zik8IUz/R9DK5RZRf3cQiWEQWSo2qGIxbVdh+aTC48MFbCNzWylnbmfMQbnPMo10oKl0g8lYxIs2p7LSCBF/JKdKoPZIc89uY/nDhziyvdew+jUWcygh5iCohLEWlQsalzYYIBWts0pZNMhNX6cbYzfBEXbkxB4ydQGq8OhiANj2+bGNQ310ioyqVnYuMHPGsWAKXI8mozQYZsESlGDYPPpc8K3TtaMjYqCz37mPupTZ9j78c9RzK9juH0Lw+2bGG5eoD+/nmr9DNXMAKl6mLLEFEUKq8gHaPSYZko9rrHjKc1ojBtPseMJzXiCHU2wkyl2UmPrBjet0bpGG4trLK5uoGnQaY3UNUvHzvDwI/t5/Rt25nP0tTg+g8Pe80uv7BBMwv0mUccSVx0TVm05deI0mzdtYN3skPHSMvXJRRYfbTihijMG6VWYfg/p+X+mV1KUReLssBZb+027aY02DVrXYD1hGVjHxO6IATEmdaciQhkYZzF+ZFdVBbJ+yF//zXP8xvvf5mkutaieXwQQ84GqUjptUhE0adwQ53Ntt28d0KtYt24dL62O2bJlHlMYWE/A6oo6xbkG1yhuMsGNxm0cR50Q0IuLNwUy6MOw76uCkcQBSKf3CJ2layk4jSyyOgpTYIqGXlmg2qQJVT7ifzWFUOmri7Z0tpDN8yLh6BsMZ2ve/+u/yM3feZx9z7/M+nVDZoY9ytL4kDMGoxVUpEQmWWPUWr5loj1Sy/oJta3qI8Cu2K23uLOd9xsx9KrCYwoEU5RYbdYQia/+p0znnk1UvWIrMkJ+KYUR7PIKb7nqjdz+mY9w/1338tQzRzh6dJGVlZF/TVFQlSVlVVAWhqIwaZIksb5HKiFk5MjqrF2rvoqQRbKxc4zjerrMycUVfuNfvhNTdDnB88HgxBUilL5vdh20p2HjNgsixVPYk+VlLt91Gb9zy7+mPrKP4yeXOXjkFAcPHufwkUVOnHyFxaVVVlamTCY1dWMDl5+wB8YEAqsMBiuEoiho1W9x7qcpZbusnVVtJ4JlZdiycT3Xvv1NXPPWXUxXJ0FboOdmvzWcQOgG1U9KXRgxaBqIZ92TBlrKx+14dRWVHmbdBWzjMBdeMM8/vnqX921rsXXDpG6YTB2NtTQ2TnA8l2CMd2JTGsqyojDadqKhTYlUGtn4U4NELh+hG6P0Bz1wjtHqGDEm4JlWs7iWEyJr9EoXQIFHZBJ+1oxWyvkAb4TCAFrDzEYaFerTzwc6zIRwgcIIs8MSMb3ss+IEpwVASd/nXNfj1abZMi149GO4INREHOqU1eVR6ECLbGTmk3Irtj1/KJT+pNvs7wLhWawZziemiIwlshOK2Q2ovAZdPJCMoOEzcX5omuIuWN1AR8wma2Qqco6OYy001xbJAMZIK6ONO1HpCguyDlCy4GjHPtqyBBIoLwQap7Ey4wjKkTQgBbE1zCz4ZxcPoFlBlaQOiyLJMOIuWrGzIT/dvGWVxOrEmV82cgyD0rWEhw1yHi+wquum7WskH9OZ9L6STAkaFxq3UCIsTqapkJk10DLFkq2RmXn/29MveYlndPU4u8kW4KzLgFo+zdGOt8QGqROMafPnqxXS5hqFE6fOZrI5yTVkKSxLEzR0Jig8NZOTFEY4srLMpGkoJU5+ZE2bERKTrTEzG30ILB4I3LyJUu4uzKYVNJuogezANo89En0XyXsJstqQLqLcPjl1kPWYAlaWRxw4cJx+r0wsVZcWC8ZSbUtPTCCqXtlZFgUnx1NeXF5NCaYVJWg3SsWAqzEzC5iNrwnKcsWIJi1PR9cRwtg60qhcU0nWDneZRFTaUnWd5JxNf6xVqkGfp545zMFDJ+n1Sq8VWgsI1OGcw8SJrEpLdgakksQNDx895ktlVhY1DEEj5xa1+2KnmOE8xaZLw4lnSsHOPYO1QF2ySVQ7PY7x7qXKeamUTEnWLSBiCr58/3dQaztqVz+NXzsBExfmiJIJGNusOahKnlw8zbf3HaI3uw5rbWtEyY4yL7PNBDOcRza+JgVuezPgPHgvzScDchTpDELahbsUxSbIZXMvtI1jZuMGHvrWXr797adZt26Azcpr61XtGszHrrtZEvpyNosX/2pnleFwyL1PPsWzTx2gv7BAE7JrqgRZIYkqb5oJZrAes3BJcO+WMe7IYpJGkKQA859RoGoyHlrj1Bzr/ATLxUqrStNY1i2s44Xnj/Pf7/gqw0EV4Lx09IE5Gvzy3heCTjDFXys9j8Glorh6SrVzM3/4vx7k8Ye/x2D7VgxgrTeY6wibIkgRaKbIcI5i4ZIsw8fRdlB8GNNxbQ3iZi/TjcKKUJeScMOkWyrWerH1+i0LPP3sy/zef/kcqysjyqpK80VZI7vJH6ef/uPdt6YUYEwUF7ZTo7IosCgHvvB13n3FFVz/wffQnx3AeIKra5+RIwPUARaAqXDjJfTMgTQvjHL2zkBRbXbBIEuYaTThMggsVKXnH8ajmv/x9cf43J8/SFPXDPoVNqHA8/cDX3xy/3m0woGldc7XyUI8FaaiWNtgyorLP/AuvvDJL/DA1x7in13/Lt785tez44ItzAwGPk7l3BhXhWJuGwxn0MWXgsxGOh2rRoaYTCypkaQNrHWMdWA0nvLi0VM89vgLPPjQ99m//zCzMz36/cqvf+1IV/W8U2PpXpMJtyqCht+EGHWhlKFCWfWoioLHP/nnHH/0GeZ3bGZhYZ65+fWUVdlJcrr2B2PQZgK2TqUrqbpVOy/Nr8a1RLJfT900LJ9d5fTpJVZWJvR7JYNBlXWd0t4hyK/XhTyw54n9578vgIaZAEU7D4zi4kAyu8mUpl9x5e/8Cs/euYczz7zAaXea40ePdWZuyrmR0NEYrtUNtbO1JKFtZzTtGhQPNIvCUFQFG+ZmICTFeMoJ7Kiew3Pq33Vl5oZ7blUT6CaDCXJYl24yFkH6W/QrqC3P3nEfK88folw3TMOVOJOL/UBsbVzYaJGdSNvetmgtyS6lFVTlm4mbcKppdtAd4ORun98iaWP/b702d/O9uzUqwaJmWDQwhwF8qPMCAyYNz95+D8svHqY3OxMkswkk+GoRdAKatX4GaSFulFdpqzaX1HlmcZzLYDQb452f9Vib2s7Z/KveGtv9vptF042rKPZue4DYrNjJFPoFr/vNX2Jm5w7qlRFSFJluL5fOkiQysdarOjRQY15uLEFhp4Q7ZufIW1w24DvnblAug4mtcQjl823+76QMb7ynvT4Xr4GIGH8LK1LHVr0EdXXCM7ffx/jIMarZGWzTrInJMPXJK0VqiaWlwFL+CLpDMV2dUrxem2KecxmFIOyOcOZLe1+Qf9DV2Zvv2a2i7QUoI62cXQGso+j3sUsjnr3zHiZHT1IM+2FUlRkgyFx9RxdSYuT/VdO1nnjlRrIhRkKrQupLxLX64sgoRXLEoXzlqRf+YVdnX80Q7eVlHyRGCz8y71W4pVWe++M9jI6epOz3Ql+laRxm0vA1r83auT/ImnvJqUS6Nfgh6X2klfOI8OUfYON/LwPEP7fc/VFVwiUnkfY6vHVUwwF2cYmnP3U3zeISlEW4Wn+uQIGMtEyzAVkLXbXznnamkMNcb4SvPLX/h97P/wPsjXgo8YP3FgAAAABJRU5ErkJggg==",
  pattern_jacket: "data:image/png;base64,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",
};

// ─── Custom image icon helper ─────────────────────────────────────────────────
const Img = ({ src, size = 24, alt = "" }) => {
  const key = src.replace(".png", "").replace(/-/g, "_");
  const uri = ICONS[key] || "";
  return <img src={uri} width={size} height={size} alt={alt}
    style={{ display:"inline-block", flexShrink:0, objectFit:"contain" }}/>;
};

// ─── Pattern-break cue types ──────────────────────────────────────────────────
const PATTERN_TYPES = [
  {
    type:  "keys",
    icon:  "pattern-keys.png",
    label: "Took keys — stayed home",
    desc:  "Pick up your keys, then put them down without going out",
  },
  {
    type:  "shoes",
    icon:  "pattern-shoes.png",
    label: "Put on shoes — stayed home",
    desc:  "Put shoes on, then take them off without going out",
  },
  {
    type:  "jacket",
    icon:  "pattern-jacket.png",
    label: "Put on jacket — stayed home",
    desc:  "Put jacket on, then take it off without going out",
  },
];

const WALK_TYPE_OPTIONS = [
  { value: "sniffy_decompression", label: "sniffy decompression" },
  { value: "regular_walk", label: "regular walk" },
  { value: "intense_exercise", label: "intense exercise" },
  { value: "training_walk", label: "training walk" },
  { value: "toilet_break", label: "toilet break" },
];

const normalizeWalkType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "regular") return "regular_walk";
  return WALK_TYPE_OPTIONS.some((option) => option.value === normalized) ? normalized : "regular_walk";
};

const walkTypeLabel = (walkType) => (WALK_TYPE_OPTIONS.find((option) => option.value === normalizeWalkType(walkType))?.label ?? "regular walk");

// ─── CSS ──────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Golos+Text:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --font-ui: 'Manrope', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    --font-prose: 'Golos Text', Georgia, serif;
    --space-1: 8px;
    --space-2: 16px;
    --space-3: 24px;
    --space-4: 32px;
    --space-5: 40px;
    --radius-sm: 12px;
    --radius-md: 16px;
    --radius-lg: 20px;
    --color-bg: #F7F2E7;
    --color-surface: #FFFFFF;
    --color-surface-soft: #EDF5EF;
    --color-border: #C6DDD0;
    --color-text: #4B3C30;
    --color-text-muted: #6B5A4A;
    --color-text-subtle: #7B6757;
    --color-accent-700: #2E815F;
    --color-accent-200: #A8D5BA;
    --bg:          var(--color-bg);
    --surf:        var(--color-surface);
    --surf-soft:   var(--color-surface-soft);
    --border:      var(--color-border);
    --green:       var(--color-accent-200);
    --green-light: #CBE9D7;
    --green-dark:  var(--color-accent-700);
    --brown:       var(--color-text);
    --brown-mid:   var(--color-text-muted);
    --brown-muted: var(--color-text-subtle);
    --amber:       #d4813a;
    --amber-light: #f0a865;
    --red:         #c0392b;
    --orange:      #e67e22;
    --text:        #4B3C30;
    --text-muted:  #6b5a4a;
    --shadow:    0 4px 24px rgba(75,60,48,0.09);
    --shadow-lg: 0 8px 40px rgba(75,60,48,0.14);
    --radius:    var(--radius-lg);

    ${TYPOGRAPHY_CSS_VARS}
  }

  html { overflow-x: hidden; width: 100%; max-width: 100vw; }
  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    font-weight: var(--type-body-weight);
    line-height: calc(var(--type-body-line) / var(--type-body-size));
    letter-spacing: var(--type-body-track);
    min-height: 100vh; min-height: 100dvh;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior-y: none;
    overflow-x: hidden;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid rgba(46,129,95,0.55);
    outline-offset: 2px;
  }

  .app {
    max-width: 480px; margin: 0 auto;
    min-height: 100vh; display: flex; flex-direction: column;
    padding-bottom: 80px; overflow-x: hidden;
  }

  /* ── Dog Select ── */
  .dog-select { max-width:480px; margin:0 auto; min-height:100vh; display:flex; flex-direction:column; background:var(--bg); overflow-x:hidden; }
  .ds-hero { background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 60%); padding:60px 28px 32px; position:relative; overflow:hidden; text-align:center; }
  .ds-hero::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; background:radial-gradient(circle,rgba(168,213,186,0.35) 0%,transparent 70%); border-radius:50%; }
  .ds-logo { margin-bottom:14px; position:relative; z-index:1; display:flex; justify-content:center; }
  .ds-title { font-size:var(--type-page-title-size); font-weight:var(--type-page-title-weight); color:var(--brown); line-height:var(--type-page-title-line); letter-spacing:var(--type-page-title-track); position:relative; z-index:1; }
  .ds-sub { font-size:var(--type-body-size); font-weight:var(--type-body-weight); color:var(--text-muted); margin-top:8px; position:relative; z-index:1; line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .ds-body { padding:var(--space-3); flex:1; overflow-x:hidden; }
  .ds-section-label { font-size:var(--type-secondary-size); letter-spacing:var(--type-secondary-track); color:var(--text-muted); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); margin-bottom:10px; }
  .ds-dog-card { display:flex; align-items:center; gap:14px; background:var(--surf); border-radius:var(--radius-sm); padding:14px 16px; margin-bottom:10px; box-shadow:var(--shadow); cursor:pointer; border:2px solid transparent; transition:border-color 0.2s,transform 0.15s; }
  .ds-dog-card:hover { border-color:var(--green-dark); transform:translateY(-1px); }
  .ds-dog-name { font-size:var(--type-card-title-size); color:var(--brown); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); }
  .ds-dog-id { font-size:var(--type-overline-size); color:var(--text-muted); font-family:var(--font-ui); font-weight:var(--type-overline-weight); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); margin-top:2px; text-transform:uppercase; }
  .ds-dog-arrow { margin-left:auto; color:var(--border); font-size:20px; }
  .ds-divider { display:flex; align-items:center; gap:12px; margin:20px 0; }
  .ds-divider-line { flex:1; height:1px; background:var(--border); }
  .ds-divider-text { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); color:var(--text-muted); font-weight:var(--type-secondary-weight); }
  .ds-btn { width:100%; padding:17px; border:none; border-radius:var(--radius); font-size:var(--type-button-lg-size); font-weight:var(--type-button-lg-weight); line-height:var(--type-button-lg-line); letter-spacing:var(--type-button-lg-track); cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; margin-bottom:12px; display:flex; align-items:center; justify-content:center; gap:10px; }
  .ds-btn-primary { background:var(--brown); color:white; box-shadow:0 4px 20px rgba(75,60,48,0.25); }
  .ds-btn-primary:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(75,60,48,0.30); }
  .ds-note { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); letter-spacing:var(--type-secondary-track); color:var(--green-dark); background:rgba(168,213,186,0.2); border-left:3px solid var(--green); border-radius:0 var(--radius-sm) var(--radius-sm) 0; padding:8px 12px; margin-bottom:12px; }
  .ds-join-row { display:flex; gap:10px; margin-top:4px; }
  .ds-join-input { flex:1; padding:14px 16px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); font-size:var(--type-body-lg-size); color:var(--brown); outline:none; transition:border-color 0.2s; font-weight:var(--type-body-lg-weight); line-height:var(--type-body-lg-line); letter-spacing:var(--type-overline-track); text-transform:uppercase; font-variant-numeric:tabular-nums; }
  .ds-join-input:focus { border-color:var(--green-dark); }
  .ds-join-input::placeholder { color:var(--brown-muted); text-transform:none; letter-spacing:0; font-weight:300; font-size:14px; }
  .ds-join-btn { padding:14px 18px; background:var(--green); color:var(--brown); border:none; border-radius:var(--radius-sm); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; white-space:nowrap; transition:transform 0.15s; }
  .ds-join-btn:hover { transform:translateY(-1px); }
  .ds-join-hint { font-size:var(--type-secondary-size); color:var(--text-muted); margin-top:8px; line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); }
  .ds-join-error { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--red); margin-top:6px; }

  /* ── Onboarding ── */
  .onboarding { max-width:480px; margin:0 auto; min-height:100vh; padding-bottom:40px; display:flex; flex-direction:column; background:var(--bg); overflow-x:hidden; }
  .ob-hero { background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 60%); padding:44px 24px 22px; position:relative; overflow:hidden; }
  .ob-hero::before { content:''; position:absolute; top:-60px; right:-60px; width:240px; height:240px; background:radial-gradient(circle,rgba(168,213,186,0.35) 0%,transparent 70%); border-radius:50%; }
  .ob-hero-icon { position:relative; z-index:1; margin-bottom:12px; }
  .ob-title { font-size:var(--type-page-title-size); font-weight:var(--type-page-title-weight); color:var(--brown); line-height:var(--type-page-title-line); letter-spacing:var(--type-page-title-track); position:relative; z-index:1; }
  .ob-subtitle { font-size:var(--type-body-size); color:var(--text-muted); margin-top:10px; line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); position:relative; z-index:1; }
  .ob-step-indicator { display:flex; gap:6px; margin-top:20px; position:relative; z-index:1; }
  .ob-step-dot { width:24px; height:4px; border-radius:99px; background:var(--border); transition:background 0.3s; }
  .ob-step-dot.active { background:var(--brown); }
  .ob-step-dot.done   { background:var(--green-dark); }
  .ob-body { padding:28px; flex:1; }
  .ob-question { font-size:var(--type-section-title-size); font-weight:var(--type-section-title-weight); color:var(--brown); margin-bottom:10px; line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); }
  .ob-hint { font-size:var(--type-body-size); color:var(--text-muted); margin-bottom:16px; line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); }
  .ob-note { font-size:var(--type-overline-size); color:var(--green-dark); background:rgba(168,213,186,0.2); border-left:3px solid var(--green); border-radius:0 var(--radius-sm) var(--radius-sm) 0; padding:8px 12px; margin-bottom:12px; line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); font-weight:var(--type-overline-weight); text-transform:uppercase; }
  .ob-input { width:100%; padding:16px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); font-size:var(--type-section-title-size); color:var(--brown); outline:none; transition:border-color 0.2s; font-weight:var(--type-section-title-weight); line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); }
  .ob-input:focus { border-color:var(--green-dark); }
  .ob-input::placeholder { color:var(--brown-muted); font-weight:300; font-size:15px; text-transform:none; letter-spacing:0; }
  .ob-options { display:flex; flex-direction:column; gap:10px; }
  .ob-option { display:flex; align-items:center; gap:14px; padding:14px 18px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; transition:border-color 0.2s,background 0.2s; text-align:left; }
  .ob-option:hover { border-color:var(--green); }
  .ob-option.selected { border-color:var(--green-dark); background:rgba(168,213,186,0.1); }
  .ob-option-emoji { font-size:22px; flex-shrink:0; }
  .ob-option-label { font-size:var(--type-body-size); color:var(--brown); font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .ob-option-sub { font-size:var(--type-secondary-size); color:var(--text-muted); margin-top:2px; line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); }
  .ob-duration-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ob-dur-btn { padding:14px 12px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; transition:border-color 0.2s,background 0.2s; text-align:center; }
  .ob-dur-btn:hover { border-color:var(--green); }
  .ob-dur-btn.selected { border-color:var(--green-dark); background:rgba(168,213,186,0.1); }
  .ob-dur-val { font-size:var(--type-section-title-size); color:var(--brown); font-weight:var(--type-section-title-weight); line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); font-variant-numeric:tabular-nums; }
  .ob-dur-lbl { font-size:var(--type-secondary-size); color:var(--text-muted); margin-top:2px; line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); }
  .ob-footer { padding:0 28px; }
  .ob-btn-next { width:100%; padding:18px; background:var(--brown); color:white; border:none; border-radius:var(--radius); font-size:var(--type-button-lg-size); font-weight:var(--type-button-lg-weight); line-height:var(--type-button-lg-line); letter-spacing:var(--type-button-lg-track); cursor:pointer; transition:transform 0.15s,box-shadow 0.15s,opacity 0.2s; box-shadow:0 4px 20px rgba(75,60,48,0.25); }
  .ob-btn-next:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 28px rgba(75,60,48,0.30); }
  .ob-btn-next:disabled { opacity:0.4; cursor:default; }
  .ob-back-btn { background:none; border:none; color:var(--text-muted); font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); cursor:pointer; margin-top:14px; display:block; width:100%; text-align:center; padding:8px; }

  /* ── Header ── */
  .header { padding:var(--space-4) var(--space-3) var(--space-2); background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 100%); position:relative; overflow:hidden; }
  .header::before { content:''; position:absolute; top:-60px; right:-60px; width:240px; height:240px; background:radial-gradient(circle,rgba(168,213,186,0.35) 0%,transparent 70%); border-radius:50%; }
  .header-top { display:flex; align-items:center; justify-content:space-between; position:relative; z-index:1; gap:16px; }
  .app-title { font-size:var(--type-page-title-size); font-weight:var(--type-page-title-weight); color:var(--brown); line-height:var(--type-page-title-line); letter-spacing:var(--type-page-title-track); }
  .app-subtitle { font-size:var(--type-body-size); color:var(--text-muted); margin-top:4px; font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .header-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .dog-id-badge { display:flex; align-items:center; gap:6px; background:var(--surf); border-radius:99px; padding:4px 10px 4px 8px; box-shadow:var(--shadow); cursor:pointer; border:1.5px solid var(--border); transition:border-color 0.2s; }
  .dog-id-badge:hover { border-color:var(--green-dark); }
  .dog-id-text { font-size:var(--type-overline-size); font-family:var(--font-ui); font-weight:var(--type-overline-weight); color:var(--brown); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); text-transform:uppercase; }

  /* ── Dog photo ── */
  .dog-photo-btn { position:relative; display:inline-block; cursor:pointer; flex-shrink:0; }
  .dog-photo-img { width:64px; height:64px; border-radius:50%; object-fit:cover; border:2.5px solid var(--green); display:block; box-shadow:0 3px 12px rgba(61,140,96,0.20); }
  .dog-photo-placeholder { width:64px; height:64px; border-radius:50%; background:var(--surf-soft); border:2px dashed var(--border); display:flex; align-items:center; justify-content:center; }
  .dog-photo-overlay { position:absolute; bottom:2px; right:2px; background:var(--brown); color:white; border-radius:50%; width:20px; height:20px; font-size:11px; display:flex; align-items:center; justify-content:center; pointer-events:none; border:2px solid var(--bg); }

  /* ── Progress section ── */
  .prog-section { padding:0 var(--space-3); margin-top:var(--space-2); }
  .train-main { width:min(100%, 460px); margin:0 auto; }
  .prog-track { height:8px; background:var(--border); border-radius:99px; position:relative; overflow:visible; }
  .prog-fill  { height:100%; background:linear-gradient(90deg,var(--green-dark),var(--green)); border-radius:99px; transition:width 0.8s cubic-bezier(0.34,1.56,0.64,1); }
  .prog-thumb { position:absolute; top:50%; transform:translate(-50%,-50%); width:18px; height:18px; border-radius:50%; background:white; border:2.5px solid var(--green-dark); box-shadow:0 2px 8px rgba(61,140,96,0.35); transition:left 0.8s cubic-bezier(0.34,1.56,0.64,1); pointer-events:none; }
  .prog-meta  { display:flex; justify-content:space-between; margin-top:8px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); color:var(--text-muted); font-weight:var(--type-secondary-weight); }

  /* ── Session control — single morphing button/timer ── */
  .session-control-wrap { margin-top:24px; display:flex; justify-content:center; }
  .session-control {
    position:relative; width:clamp(180px, 55vw, 212px); aspect-ratio:1/1;
    border:none; border-radius:50%; cursor:pointer;
    background:radial-gradient(circle at 38% 30%, #8fd8ab 0%, #63b082 48%, #3f8f63 100%);
    box-shadow:0 14px 34px rgba(61,140,96,0.34), inset 0 1px 0 rgba(255,255,255,0.34);
    display:flex; align-items:center; justify-content:center;
    transition:transform 130ms ease, box-shadow 320ms ease, filter 320ms ease;
    touch-action:manipulation;
  }
  .session-control::before {
    content:""; position:absolute; inset:-10px; border-radius:50%; pointer-events:none;
    border:10px solid rgba(168,213,186,0.28);
  }
  .session-control.is-running {
    background:var(--surf);
    box-shadow:0 16px 36px rgba(61,140,96,0.28), inset 0 1px 0 rgba(255,255,255,0.30);
    filter:saturate(1.08);
  }
  .session-control.is-pressing { transform:scale(0.96); }
  .session-control:focus-visible { outline:3px solid rgba(61,140,96,0.45); outline-offset:4px; }
  .sc-ring-svg { position:absolute; inset:-10px; width:calc(100% + 20px); height:calc(100% + 20px); transform:rotate(-90deg); }
  .sc-track { fill:none; stroke:rgba(96,142,111,0.2); stroke-width:10; }
  .sc-progress { fill:none; stroke:var(--green-dark); stroke-width:10; stroke-linecap:round; transition:stroke-dashoffset 1000ms linear, opacity 320ms ease; }
  .sc-content { position:relative; z-index:1; display:grid; place-items:center; text-align:center; width:100%; height:100%; padding:20px; }
  .sc-content::before {
    content:"";
    position:absolute;
    inset:18%;
    border-radius:50%;
    background:radial-gradient(circle, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.14) 45%, rgba(0,0,0,0) 72%);
    pointer-events:none;
    z-index:0;
  }
  .sc-idle { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; transition:opacity 260ms ease, transform 300ms ease; }
  .sc-idle-label { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; text-transform:uppercase; font-size:var(--type-button-lg-size); font-weight:var(--type-button-lg-weight); letter-spacing:0.01em; line-height:var(--type-button-lg-line); color:rgba(255,255,255,0.99); text-shadow:0 0 6px rgba(255,255,255,0.24), 0 0 16px rgba(196,247,220,0.20); }
  .sc-idle-label span { display:block; }
  .sc-time { position:absolute; opacity:0; transform:scale(0.95); transition:opacity 300ms ease-in-out, transform 300ms ease-in-out; }
  .sc-time-value { font-size:var(--type-metric-xl-size); line-height:var(--type-metric-xl-line); font-weight:var(--type-metric-xl-weight); color:var(--green-dark); letter-spacing:var(--type-metric-xl-track); font-variant-numeric:tabular-nums; }
  .session-control.is-running .sc-idle { opacity:0; transform:translateY(-4px); }
  .session-control.is-running .sc-time,
  .session-control.is-complete .sc-time { opacity:1; transform:scale(1); }
  .session-actions { margin-top:12px; display:flex; flex-direction:column; gap:0; align-items:center; }
  .session-end-btn, .session-cancel-btn { width:min(100%, 260px); padding:12px 14px; border-radius:12px; border:1.5px solid var(--border); background:var(--surf); color:var(--brown); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; }
  .session-cancel-btn { background:var(--surf-soft); }
  .session-end-btn:hover, .session-cancel-btn:hover { border-color:var(--green-dark); }

  .readiness-hint { margin:12px auto 0; width:min(100%, 320px); padding:8px 12px; border-radius:12px; border:1px solid var(--border); background:var(--surf-soft); display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .readiness-label { font-size:var(--type-secondary-size); color:var(--text-muted); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); }
  .readiness-value { font-size:var(--type-overline-size); line-height:var(--type-overline-line); font-weight:var(--type-overline-weight); letter-spacing:var(--type-overline-track); text-transform:uppercase; }

  .session-feedback { width:min(100%, 420px); margin:0; }

  /* ── Status message ── */
  .status-msg { margin:18px auto 0; max-width:340px; font-size:var(--type-body-size); font-weight:var(--type-body-weight); color:var(--text-muted); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); text-align:center; }
  .ring-sub-btn { margin-top:5px; background:transparent; border:none; padding:0; font-size:var(--type-secondary-size); color:var(--text-muted); font-weight:var(--type-card-title-weight); text-align:center; line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); cursor:pointer; }
  .ring-sub-btn:hover, .ring-sub-btn:focus-visible { color:var(--green-dark); outline:none; }
  .recommendation-pop { position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); width:min(360px, 88vw); background:var(--surf); color:var(--text-muted); border:1.5px solid var(--border); border-radius:12px; box-shadow:var(--shadow-lg); padding:12px 14px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); font-weight:var(--type-secondary-weight); text-align:left; z-index:20; }
  .recommendation-pop p { margin:0; }
  .recommendation-pop p + p { margin-top:10px; }
  .recommendation-pop strong { color:var(--brown); }

  /* ── Stats rings card ── */
  .stats-rings-card { margin:24px 0 0; background:var(--surf); border-radius:var(--radius); padding:8px 6px 8px; box-shadow:0 2px 12px rgba(75,60,48,0.07); display:flex; position:relative; }
  .ring-col { flex:1; display:flex; flex-direction:column; align-items:center; }
  .ring-col-sep { width:1px; background:var(--border); align-self:stretch; margin:8px 0; }
  .ring-wrap { position:relative; width:88px; height:88px; }
  .ring-svg { overflow:visible; }
  .ring-bg   { fill:none; stroke:var(--border); stroke-width:8; }
  .ring-fill-1 { fill:none; stroke:var(--green-dark); stroke-width:8; stroke-linecap:round; transition:stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1); transform:rotate(-90deg); transform-origin:44px 44px; }
  .ring-fill-2 { fill:none; stroke:var(--green); stroke-width:8; stroke-linecap:round; transition:stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1); transform:rotate(-90deg); transform-origin:44px 44px; }
  .ring-inner { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; }
  .ring-val { font-size:var(--type-metric-lg-size); font-weight:var(--type-metric-lg-weight); color:var(--brown); line-height:var(--type-metric-lg-line); letter-spacing:var(--type-metric-lg-track); font-variant-numeric:tabular-nums; }
  
  /* ── Tool section title ── */
  .tool-section-title { margin:8px 24px 8px; font-size:var(--type-overline-size); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); color:var(--text-muted); font-weight:var(--type-overline-weight); text-transform:uppercase; }

  /* ── Grouped tool card ── */
  .tool-group-card { margin:0 20px; background:var(--surf); border-radius:var(--radius-sm); box-shadow:0 2px 12px rgba(75,60,48,0.07); overflow:hidden; }
  .tool-row { display:flex; align-items:center; justify-content:space-between; padding:11px 16px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid var(--border); }
  .tool-row:last-child { border-bottom:none; }
  .tool-row:hover { background:var(--surf-soft); }
  .tool-row-left  { display:flex; align-items:center; gap:12px; }
  .tool-row-label { font-size:var(--type-body-size); color:var(--brown); font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); display:flex; align-items:center; gap:6px; }
  .tool-row-right { display:flex; align-items:center; gap:8px; }
  .tool-row-meta  { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); }
  .tool-chevron   { color:var(--border); font-size:15px; font-weight:600; }
  .tool-badge-warn { background:var(--amber); color:white; font-size:10px; font-weight:700; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; }
  .tool-expand { background:var(--surf-soft); padding:12px 14px; border-top:1px solid var(--border); }

  /* ── Walk timer banner ── */
  .walk-timer-banner { margin:0 20px; padding:10px 14px; background:rgba(168,213,186,0.18); border-radius:0 0 var(--radius-sm) var(--radius-sm); border:1.5px solid var(--green); border-top:none; display:flex; align-items:center; justify-content:space-between; }
  .walk-type-panel { margin:0 20px; padding:14px; background:rgba(168,213,186,0.18); border-radius:0 0 var(--radius-sm) var(--radius-sm); border:1.5px solid var(--green); border-top:none; }
  .walk-type-title { font-size:var(--type-card-title-size); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); color:var(--brown); margin-bottom:6px; }
  .walk-type-sub { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); margin-bottom:10px; }
  .walk-type-grid { display:grid; gap:8px; }
  .walk-type-option { width:100%; text-align:left; border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; font-size:var(--type-body-size); line-height:var(--type-body-line); font-weight:var(--type-body-weight); letter-spacing:var(--type-body-track); text-transform:capitalize; color:var(--brown); background:var(--surf); cursor:pointer; }
  .walk-type-option:hover { border-color:var(--green-dark); }
  .walk-type-actions { display:flex; justify-content:flex-end; margin-top:8px; }
  .walk-timer-left .walk-timer-elapsed { font-size:var(--type-metric-lg-size); line-height:var(--type-metric-lg-line); font-weight:var(--type-metric-lg-weight); letter-spacing:var(--type-metric-lg-track); color:var(--green-dark); font-variant-numeric:tabular-nums; }
  .walk-timer-left .walk-timer-lbl { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); margin-top:1px; }
  .walk-timer-btns { display:flex; gap:8px; align-items:center; }
  .walk-end-btn { padding:10px 20px; background:var(--green-dark); color:white; border:none; border-radius:99px; font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; transition:opacity 0.15s; }
  .walk-end-btn:hover { opacity:0.88; }
  .walk-cancel-btn { padding:10px 14px; background:transparent; color:var(--text-muted); border:1.5px solid var(--border); border-radius:99px; font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; }
  .walk-cancel-btn:hover { background:var(--surf); }

  /* ── Daily alone-time card ── */
  .alone-card   { margin:6px 20px 0; background:var(--surf); border-radius:var(--radius-sm); padding:11px 14px; box-shadow:0 2px 12px rgba(75,60,48,0.07); display:flex; align-items:center; gap:16px; }
  .alone-left   { flex:1; }
  .alone-label  { font-size:var(--type-overline-size); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); color:var(--text-muted); font-weight:var(--type-overline-weight); text-transform:uppercase; margin-bottom:2px; }
  .alone-total  { font-size:var(--type-metric-lg-size); line-height:var(--type-metric-lg-line); letter-spacing:var(--type-metric-lg-track); color:var(--brown); font-weight:var(--type-metric-lg-weight); font-variant-numeric:tabular-nums; }
  .alone-right  { flex:1; }
  .alone-track  { height:6px; background:var(--border); border-radius:99px; overflow:hidden; display:flex; }
  .alone-fill   { height:100%; transition:width 0.6s; flex-shrink:0; }
  .alone-fill.ok   { background:linear-gradient(90deg,var(--green-dark),var(--green)); }
  .alone-fill.near { background:linear-gradient(90deg,var(--orange),var(--amber-light)); }
  .alone-fill.active { background:linear-gradient(90deg,#d65f3c,var(--orange)); }
  .alone-fill.full { background:linear-gradient(90deg,var(--red),#d65f3c); }
  .alone-legend { display:flex; gap:0; margin-top:5px; flex-wrap:wrap; align-items:center; }

  /* ── Streak fire ── */
  .streak-fire { font-size:24px; line-height:1; display:inline-flex; align-items:center; margin-right:6px; position:relative; top:-1px; }

  /* ── Notification toggle ── */
  .notif-time-input { border:1.5px solid var(--border); border-radius:8px; padding:5px 8px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--brown); background:var(--surf-soft); outline:none; }
  .notif-toggle { padding:6px 14px; border-radius:99px; border:1.5px solid var(--border); background:var(--surf-soft); color:var(--text-muted); font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); cursor:pointer; transition:all 0.2s; }
  .notif-toggle.on { background:var(--green-dark); color:white; border-color:var(--green-dark); }

  /* ── Protocol warning banner ── */
  .proto-warn-banner { background:rgba(212,129,58,0.12); border:1.5px solid var(--amber); border-radius:var(--radius-sm); padding:12px 16px; margin-bottom:14px; }
  .proto-warn-title { font-size:var(--type-secondary-size); font-weight:600; line-height:var(--type-secondary-line); color:var(--amber); margin-bottom:4px; }
  .proto-warn-body  { font-size:var(--type-body-size); color:var(--brown-mid); line-height:var(--type-body-line); font-weight:var(--type-body-weight); letter-spacing:var(--type-body-track); }
  .proto-field-row  { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); }
  .proto-field-row:last-child { border-bottom:none; }
  .proto-field-label { font-size:var(--type-body-size); color:var(--brown); font-weight:var(--type-body-weight); line-height:var(--type-body-line); }
  .proto-field-input { width:64px; text-align:right; padding:5px 8px; border:1.5px solid var(--border); border-radius:8px; font-size:var(--type-body-size); font-weight:var(--type-card-title-weight); color:var(--brown); background:var(--surf-soft); outline:none; font-variant-numeric:tabular-nums; }
  .proto-field-input:focus { border-color:var(--amber); }

  /* ── Goal card (kept for stats tab) ── */
  .goal-card { margin:0 24px 16px; background:var(--surf); border-radius:var(--radius); padding:16px 20px; box-shadow:var(--shadow); position:relative; overflow:hidden; }
  .goal-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg,var(--green-dark),var(--green)); opacity:0.8; }
  .goal-label { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
  .goal-title { font-size:var(--type-body-size); color:var(--text-muted); font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .goal-pct   { font-size:var(--type-section-title-size); line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); color:var(--green-dark); font-weight:var(--type-section-title-weight); font-variant-numeric:tabular-nums; }
  .progress-track { height:10px; background:var(--surf-soft); border-radius:99px; overflow:hidden; }
  .progress-fill  { height:100%; background:linear-gradient(90deg,var(--green-dark),var(--green)); border-radius:99px; transition:width 0.8s cubic-bezier(0.34,1.56,0.64,1); }
  .goal-meta { margin-top:8px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); display:flex; justify-content:space-between; }

  /* ── Buttons ── */
  .btn-end { display:block; width:calc(100% - 44px); margin:16px 22px 0; padding:16px; background:var(--green); color:var(--brown); border:none; border-radius:var(--radius); font-size:var(--type-button-lg-size); font-weight:var(--type-button-lg-weight); line-height:var(--type-button-lg-line); cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; box-shadow:0 4px 16px rgba(168,213,186,0.50); letter-spacing:var(--type-button-lg-track); }
  .btn-end:hover { transform:translateY(-2px); box-shadow:0 6px 22px rgba(168,213,186,0.60); }
  .btn-end:active { transform:translateY(0); }
  .btn-walk { display:flex; align-items:center; gap:10px; width:calc(100% - 48px); margin:0 24px 14px; padding:14px 18px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; transition:border-color 0.2s,background 0.2s,transform 0.15s; box-shadow:var(--shadow); }
  .btn-walk:hover { border-color:var(--green-dark); background:var(--surf-soft); transform:translateY(-1px); }
  .btn-walk .walk-count { margin-left:auto; background:var(--surf-soft); padding:2px 10px; border-radius:99px; font-size:12px; color:var(--text-muted); font-weight:400; }

  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .btn-cancel { display:block; width:calc(100% - 48px); margin:10px 24px 0; padding:12px; background:transparent; color:var(--text-muted); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; transition:background 0.15s; }
  .btn-cancel:hover { background:var(--surf-soft); }

  /* ── Timer screen (legacy, kept for compatibility) ── */
  @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

  /* ── Rating screen ── */
  .rating-screen { margin:0 24px; background:var(--surf); border-radius:var(--radius); padding:24px 22px; box-shadow:var(--shadow-lg); animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  .rating-title { font-size:var(--type-section-title-size); font-weight:var(--type-section-title-weight); line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); color:var(--brown); text-align:center; margin-bottom:4px; }
  .rating-sub   { font-size:var(--type-body-size); color:var(--text-muted); text-align:center; margin-bottom:16px; line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); }
  .result-grid { display:flex; flex-direction:column; gap:10px; margin-bottom:4px; }
  .btn-result { width:100%; padding:14px 16px; border:none; border-radius:var(--radius-sm); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); cursor:pointer; transition:transform 0.15s; display:flex; align-items:center; gap:14px; text-align:left; letter-spacing:var(--type-button-track); }
  .btn-result .emoji { font-size:22px; flex-shrink:0; }
  .btn-result .result-desc { font-size:13px; opacity:0.82; margin-top:2px; font-weight:400; }
  .btn-none   { background:var(--green);  color:var(--brown); box-shadow:0 4px 16px rgba(168,213,186,0.45); }
  .btn-mild   { background:var(--orange); color:white; box-shadow:0 4px 16px rgba(230,126,34,0.30); }
  .btn-strong { background:#d65f3c; color:white; box-shadow:0 4px 16px rgba(214,95,60,0.28); }
  .btn-severe { background:var(--red); color:white; box-shadow:0 4px 16px rgba(192,57,43,0.30); }
  .btn-result:hover { transform:translateY(-2px); }
  .outcome-details { margin-top:10px; padding:12px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surf-soft); display:flex; flex-direction:column; gap:8px; }
  .field-label { font-size:var(--type-secondary-size); color:var(--brown); font-weight:var(--type-card-title-weight); line-height:var(--type-secondary-line); }
  .text-input { width:100%; border:1.5px solid var(--border); border-radius:10px; padding:10px 12px; font-size:var(--type-body-size); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); color:var(--brown); background:white; }
  .btn-save-outcome { margin-top:4px; border:none; border-radius:10px; padding:11px 12px; font-size:var(--type-button-size); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); font-weight:var(--type-button-weight); background:var(--brown); color:white; cursor:pointer; }

  /* ── Contextual tips ── */
  .ctx { margin:0 20px 12px; padding:11px 14px; background:var(--surf); border-radius:var(--radius-sm); border-left:3px solid var(--green-dark); font-size:var(--type-secondary-size); color:var(--text-muted); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); font-weight:var(--type-secondary-weight); box-shadow:0 2px 8px rgba(75,60,48,0.06); }
  .ctx strong { color:var(--brown); }
  .ctx.amber { border-left-color:var(--amber); }
  .ctx.red   { border-left-color:var(--red); background:rgba(192,57,43,0.04); }
  .ctx.green { border-left-color:var(--green-dark); }

  /* ── Ring timer (legacy small rings) ── */
  .ring-fill { fill:none; stroke:var(--brown); stroke-width:6; stroke-linecap:round; transition:stroke-dashoffset 1s linear; }
  .ring-text { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; }
  .ring-time { font-size:var(--type-card-title-size); line-height:var(--type-card-title-line); font-weight:var(--type-card-title-weight); letter-spacing:var(--type-card-title-track); color:var(--brown); }

  /* ── Pattern Breaking section ── */
  .pat-section { margin:0 24px 16px; }
  .pat-header  { display:flex; align-items:center; gap:0; margin-bottom:6px; }
  .pat-title   { font-size:var(--type-card-title-size); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); font-weight:var(--type-card-title-weight); color:var(--brown); }
  .pat-badge   { font-size:10px; font-weight:600; padding:2px 9px; border-radius:99px; background:rgba(168,213,186,0.3); color:var(--green-dark); letter-spacing:0.01em; }
  .pat-reminder { font-size:15px; color:var(--text-muted); line-height:1.6; padding:10px 14px; background:var(--surf); border-radius:var(--radius-sm); margin-bottom:10px; border-left:3px solid var(--green-dark); box-shadow:0 2px 8px rgba(75,60,48,0.06); }
  .pat-reminder.warn { border-left-color:var(--amber); color:var(--brown-mid); }
  .pat-btns { display:flex; flex-direction:column; gap:0; }
  .btn-pat { display:flex; align-items:center; gap:10px; padding:11px 14px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:14px; font-weight:400; cursor:pointer; transition:border-color 0.2s,transform 0.15s; text-align:left; box-shadow:0 2px 8px rgba(75,60,48,0.05); }
  .btn-pat:hover { border-color:var(--green-dark); transform:translateX(3px); }
  .btn-pat:active { transform:translateX(0); }
  .p-emoji { font-size:18px; flex-shrink:0; }
  .p-text  { flex:1; }
  .p-label { font-size:var(--type-body-size); color:var(--brown); font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .p-desc  { font-size:14px; color:var(--text-muted); margin-top:1px; font-weight:400; }
  .p-count { font-size:var(--type-overline-size); color:var(--text-muted); background:var(--surf-soft); padding:2px 9px; border-radius:99px; flex-shrink:0; white-space:nowrap; line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); font-weight:var(--type-overline-weight); text-transform:uppercase; }

  /* ── Tabs ── */
  .tabs { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; max-width:480px; background:rgba(247,242,231,0.97); backdrop-filter:blur(14px); border-top:1.5px solid var(--border); display:flex; z-index:100; padding-bottom:env(safe-area-inset-bottom,0px); }
  .tab-btn { flex:1; min-height:48px; padding:9px 4px 13px; background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--color-text-subtle); transition:color 0.18s; font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); }
  .tab-btn.active { color:var(--green-dark); font-weight:700; }
  .tab-btn svg { width:24px; height:24px; }
  .tab-btn:focus-visible { outline:2px solid var(--green-dark); outline-offset:-2px; border-radius:10px; }

  /* ── Sections ── */
  .section { padding:var(--space-2) var(--space-3); overflow-x:hidden; }
  .page-title { font-size:var(--type-page-title-size); font-weight:var(--type-page-title-weight); color:var(--brown); line-height:var(--type-page-title-line); letter-spacing:var(--type-page-title-track); margin-bottom:14px; }
  .section-title { font-size:var(--type-section-title-size); font-weight:var(--type-section-title-weight); color:var(--brown); line-height:var(--type-section-title-line); letter-spacing:var(--type-section-title-track); margin-bottom:14px; }
  .empty-state { text-align:center; padding:40px 24px; color:var(--text-muted); }
  .empty-state .big { font-size:48px; margin-bottom:12px; }
  .empty-state p { font-size:15px; line-height:1.6; }



  /* ── Collapsible how-to ── */
  .howto-wrap { margin:0 24px 12px; border-radius:var(--radius-sm); overflow:hidden; box-shadow:0 2px 8px rgba(75,60,48,0.06); }
  .howto-toggle { width:100%; display:flex; justify-content:space-between; align-items:center; padding:11px 16px; background:var(--surf); border:none; font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); color:var(--brown); cursor:pointer; border-left:3px solid var(--green-dark); }
  .howto-arrow { font-size:10px; color:var(--text-muted); }

  /* ── Protocol details ── */
  .proto-section { margin-bottom:12px; }
  .proto-section:last-child { margin-bottom:0; }
  .proto-title { font-size:var(--type-overline-size); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); color:var(--green-dark); font-weight:var(--type-overline-weight); margin-bottom:5px; text-transform:uppercase; }
  .proto-row { font-size:var(--type-body-size); font-weight:var(--type-body-weight); color:var(--text-muted); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }

  /* ── Sync status badge ── */
  .sync-badge { border:none; border-radius:999px; padding:6px 10px; font-size:var(--type-overline-size); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); font-weight:var(--type-overline-weight); display:flex; align-items:center; gap:6px; cursor:pointer; flex-shrink:0; text-transform:uppercase; }
  .sync-dot { width:8px; height:8px; border-radius:50%; }
  .sync-idle    { background:var(--border); }
  .sync-syncing { background:var(--amber); animation:pulse 1s infinite; }
  .sync-ok      { background:var(--green-dark); }
  .sync-err     { background:var(--red); }
  .sync-badge.sync-state-idle { background:var(--surf-soft); color:var(--text-muted); }
  .sync-badge.sync-state-syncing { background:rgba(245,183,80,0.18); color:var(--brown); }
  .sync-badge.sync-state-ok { background:rgba(168,213,186,0.35); color:var(--green-dark); }
  .sync-badge.sync-state-err { background:rgba(192,57,43,0.12); color:var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* ── History delete button ── */
  .h-del { background:none; border:none; color:var(--brown-muted); font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); cursor:pointer; padding:4px 6px; border-radius:6px; flex-shrink:0; opacity:0.5; transition:opacity 0.15s,color 0.15s; }
  .h-del:hover { opacity:1; color:var(--red); }
  .h-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
  .h-edit { background:none; border:none; color:var(--brown-muted); font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); cursor:pointer; padding:4px 6px; border-radius:6px; opacity:0.7; }
  .h-edit:hover { opacity:1; color:var(--green-dark); }

  /* ── Pattern edit row ── */
  .pat-edit-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--surf-soft); }
  .pat-edit-row:last-child { border-bottom:none; }
  .pat-edit-label { flex:1; font-size:var(--type-body-size); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); color:var(--brown); }
  .pat-edit-input { flex:1; padding:7px 10px; border:1.5px solid var(--green-dark); border-radius:var(--radius-sm); font-size:var(--type-body-size); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); color:var(--brown); background:var(--surf-soft); outline:none; }
  .pat-edit-btn { background:none; border:none; font-size:16px; color:var(--brown-muted); cursor:pointer; padding:4px; }
  .pat-edit-btn:hover { color:var(--brown); }
  .pat-edit-reset { background:none; border:none; font-size:14px; color:var(--brown-muted); cursor:pointer; padding:4px; }
  .pat-edit-reset:hover { color:var(--red); }
  .h-item { background:var(--surf); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:6px; box-shadow:0 2px 12px rgba(75,60,48,0.06); display:flex; align-items:center; gap:12px; animation:fadeIn 0.3s ease; }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .h-dot { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .dot-none   { background:rgba(168,213,186,0.3); }
  .dot-subtle { background:rgba(230,126,34,0.12); }
  .dot-active { background:rgba(214,95,60,0.14); }
  .dot-severe { background:rgba(192,57,43,0.10); }
  .dot-walk   { background:rgba(74,158,110,0.15); }
  .dot-feed   { background:rgba(212,129,58,0.16); color:var(--brown); font-size:18px; }
  .dot-pat    { background:rgba(75,60,48,0.09); }
  .h-info { flex:1; min-width:0; }
  .h-main { font-size:var(--type-card-title-size); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); color:var(--brown); }
  .h-date { font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); color:var(--text-muted); margin-top:6px; }
  .h-badge { font-size:var(--type-overline-size); font-weight:var(--type-overline-weight); line-height:var(--type-overline-line); padding:3px 9px; border-radius:99px; letter-spacing:var(--type-overline-track); white-space:nowrap; flex-shrink:0; text-transform:uppercase; }
  .badge-none   { background:rgba(168,213,186,0.3);  color:var(--green-dark); }
  .badge-subtle { background:rgba(230,126,34,0.12); color:var(--orange); }
  .badge-active { background:rgba(214,95,60,0.14); color:#b4492b; }
  .badge-severe { background:rgba(192,57,43,0.10);  color:var(--red); }
  .badge-walk   { background:rgba(74,158,110,0.15);  color:var(--green-dark); }
  .badge-feed   { background:rgba(212,129,58,0.16); color:#8a4c19; }
  .badge-pat    { background:rgba(75,60,48,0.09);    color:var(--brown-mid); }
  .h-extra-badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .h-badge-mini { font-size:var(--type-overline-size); font-weight:var(--type-overline-weight); line-height:var(--type-overline-line); padding:2px 7px; border-radius:99px; background:rgba(75,60,48,0.08); color:var(--brown-mid); letter-spacing:var(--type-overline-track); text-transform:uppercase; }

  /* ── Stats ── */
  .chart-wrap  { background:var(--surf); border-radius:var(--radius); padding:16px 8px 12px; box-shadow:var(--shadow); margin-bottom:12px; }
  .chart-title { font-size:var(--type-body-lg-size); line-height:var(--type-body-lg-line); letter-spacing:var(--type-body-lg-track); font-weight:var(--type-body-lg-weight); color:var(--brown); margin-bottom:14px; padding-left:12px; }
  .streak-card { background:linear-gradient(135deg,var(--green-dark) 0%,var(--green) 100%); border-radius:var(--radius); padding:12px 20px; color:white; text-align:center; box-shadow:0 4px 20px rgba(61,140,96,0.30); margin-bottom:12px; }
  .streak-num  { font-size:var(--type-metric-lg-size); line-height:var(--type-metric-lg-line); letter-spacing:var(--type-metric-lg-track); font-weight:var(--type-metric-lg-weight); font-variant-numeric:tabular-nums; }
  .streak-lbl  { font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); opacity:0.9; margin-top:6px; font-weight:var(--type-secondary-weight); display:flex; align-items:center; justify-content:center; gap:4px; }
  .stats-row   { display:grid; grid-template-columns:1fr 1fr; gap:0; margin-bottom:8px; }
  .stat-card-span2 { grid-column:span 2; }
  .stat-card   { background:var(--surf); border-radius:var(--radius-sm); padding:12px; text-align:center; box-shadow:var(--shadow); }
  .stat-val    { font-size:var(--type-metric-lg-size); color:var(--brown); font-weight:var(--type-metric-lg-weight); line-height:var(--type-metric-lg-line); letter-spacing:var(--type-metric-lg-track); font-variant-numeric:tabular-nums; }
  .stat-lbl    { font-size:var(--type-body-size); color:var(--text-muted); margin-top:6px; font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .stat-wide   { background:var(--surf); border-radius:var(--radius-sm); padding:14px 18px; box-shadow:var(--shadow); grid-column:span 2; display:flex; align-items:center; justify-content:space-between; }
  .stat-wide .stat-val { font-size:var(--type-metric-lg-size); color:var(--brown); font-weight:var(--type-metric-lg-weight); line-height:var(--type-metric-lg-line); letter-spacing:var(--type-metric-lg-track); font-variant-numeric:tabular-nums; }
  .stat-wide .stat-lbl { font-size:var(--type-body-size); color:var(--text-muted); margin-top:6px; font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .stat-icon   { font-size:28px; opacity:1; display:flex; align-items:center; }
  .ratio-card  { background:var(--surf); border-radius:var(--radius-sm); padding:14px; box-shadow:var(--shadow); margin-bottom:10px; }
  .ratio-title { font-size:var(--type-card-title-size); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); color:var(--brown); margin-bottom:12px; }
  .ratio-bar   { height:12px; border-radius:99px; overflow:hidden; display:flex; }
  .ratio-good  { background:var(--green);  transition:width 0.6s; }
  .ratio-mild  { background:var(--orange); transition:width 0.6s; }
  .ratio-active { background:#d65f3c; transition:width 0.6s; }
  .ratio-bad   { background:var(--red);    transition:width 0.6s; }
  .ratio-legend { display:flex; gap:14px; margin-top:6px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); flex-wrap:wrap; }
  .ratio-legend span { display:flex; align-items:center; gap:5px; }
  .dot12 { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .insights-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; margin-bottom:10px; }
  .metric-btn { width:100%; border:none; cursor:pointer; }
  .metric-btn .stat-lbl { margin-top:6px; }

  /* ── Settings tab ── */
  .share-card  { background:var(--surf); border-radius:var(--radius); padding:16px; margin-bottom:12px; box-shadow:var(--shadow); }
  .share-title { font-size:var(--type-card-title-size); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); color:var(--brown); margin-bottom:8px; }
  .share-sub   { font-size:var(--type-body-size); font-weight:var(--type-body-weight); color:var(--text-muted); margin-bottom:12px; line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .share-id-row { display:flex; align-items:center; gap:10px; background:var(--surf-soft); border-radius:var(--radius-sm); padding:12px 16px; margin-bottom:10px; }
  .share-id-val { font-family:var(--font-ui); font-size:var(--type-section-title-size); line-height:var(--type-section-title-line); font-weight:var(--type-page-title-weight); color:var(--brown); letter-spacing:var(--type-overline-track); text-transform:uppercase; flex:1; font-variant-numeric:tabular-nums; }
  .copy-btn { background:var(--brown); color:white; border:none; border-radius:8px; padding:8px 14px; font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; transition:opacity 0.15s; }
  .copy-btn:hover { opacity:0.85; }
  .share-steps { font-size:var(--type-body-size); color:var(--text-muted); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); padding-left:18px; font-family:var(--font-prose); }
  .share-steps li { margin-bottom:2px; }
  .settings-btn { width:100%; padding:13px 16px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; display:flex; align-items:center; gap:10px; margin-bottom:10px; transition:border-color 0.2s,background 0.2s; box-shadow:0 2px 8px rgba(75,60,48,0.05); }
  .settings-btn:hover { border-color:var(--green-dark); background:var(--surf-soft); }
  .settings-btn.danger { color:var(--red); }
  .settings-btn.danger:hover { border-color:var(--red); }


  .diag-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .diag-run-btn { border:1px solid var(--green-dark); background:transparent; color:var(--green-dark); border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer; }
  .diag-run-btn:disabled { opacity:0.6; cursor:not-allowed; }
  .diag-grid { display:grid; gap:6px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); color:var(--text-muted); margin-bottom:10px; }
  .diag-grid code { color:var(--brown); background:var(--surf-soft); padding:2px 6px; border-radius:6px; }
  .diag-summary { font-size:14px; font-weight:700; margin-bottom:8px; }
  .diag-summary.ok { color:var(--green-dark); }
  .diag-summary.err { color:var(--red); }
  .diag-json { font-size:11px; background:#1f1f1f; color:#e7e7e7; border-radius:10px; padding:10px; overflow:auto; max-height:220px; }

  /* ── Toast (bottom center, thumb-reachable) ── */
  .toast { position:fixed; bottom:calc(80px + env(safe-area-inset-bottom,0px)); left:50%; transform:translateX(-50%); background:var(--brown); color:var(--bg); padding:13px 24px; border-radius:99px; font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); z-index:999; animation:toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1),toastOut 0.3s ease 2.7s forwards; box-shadow:0 8px 32px rgba(0,0,0,0.22); max-width:88vw; text-align:center; white-space:nowrap; }
  @keyframes toastIn  { from{opacity:0;transform:translateX(-50%) translateY(14px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes toastOut { to{opacity:0;transform:translateX(-50%) translateY(14px)} }

  /* ── Tab content transition ── */
  .tab-content { animation:tabFade 0.2s ease; }
  @keyframes tabFade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  /* ── Collapsible animation ── */
  .collapsible-body { overflow:hidden; transition:max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease; }
  .collapsible-body.open  { max-height:600px; opacity:1; }
  .collapsible-body.closed { max-height:0; opacity:0; }

  /* ── Improved empty states ── */
  .empty-state { text-align:center; padding:44px 28px; }
  .empty-state .es-icon { font-size:52px; margin-bottom:14px; }
  .empty-state .es-title { font-size:var(--type-card-title-size); color:var(--brown); font-weight:var(--type-card-title-weight); margin-bottom:8px; line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); }
  .empty-state .es-body  { font-size:var(--type-body-size); color:var(--text-muted); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); font-weight:var(--type-body-weight); margin-bottom:18px; }
  .empty-state .es-cta   { display:inline-block; padding:13px 28px; background:var(--green); color:var(--brown); border:none; border-radius:99px; font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; box-shadow:0 4px 16px rgba(92,170,127,0.35); transition:transform 0.15s,box-shadow 0.15s; }
  .empty-state .es-cta:hover { transform:translateY(-2px); box-shadow:0 7px 22px rgba(92,170,127,0.45); }

  /* ── Coach mark (first launch) ── */
  .coach-overlay { position:fixed; inset:0; z-index:200; pointer-events:none; }
  .coach-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.45); pointer-events:all; }
  .coach-tip { position:absolute; left:24px; right:24px; background:var(--surf); border-radius:var(--radius); padding:24px; box-shadow:var(--shadow-lg); pointer-events:all; animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  .coach-tip-arrow { width:14px; height:10px; background:var(--surf); clip-path:polygon(50% 0%,0% 100%,100% 100%); position:absolute; top:-9px; left:50%; transform:translateX(-50%); }
  .coach-title { font-size:var(--type-card-title-size); color:var(--brown); font-weight:var(--type-card-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); margin-bottom:6px; }
  .coach-body  { font-size:var(--type-secondary-size); color:var(--text-muted); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); font-weight:var(--type-secondary-weight); margin-bottom:16px; }
  .coach-btn   { width:100%; padding:14px; background:var(--brown); color:var(--bg); border:none; border-radius:var(--radius-sm); font-size:var(--type-button-lg-size); font-weight:var(--type-button-lg-weight); line-height:var(--type-button-lg-line); letter-spacing:var(--type-button-lg-track); cursor:pointer; transition:opacity 0.15s; }
  .coach-btn:hover { opacity:0.88; }

  .metric-help-overlay { position:fixed; inset:0; z-index:240; background:rgba(0,0,0,0.42); display:flex; align-items:flex-end; justify-content:center; padding:18px; }
  .metric-help-card { width:min(100%, 420px); background:var(--surf); border-radius:var(--radius); padding:18px 16px; box-shadow:var(--shadow-lg); }
  .metric-help-title { font-size:var(--type-card-title-size); color:var(--brown); font-weight:var(--type-page-title-weight); line-height:var(--type-card-title-line); letter-spacing:var(--type-card-title-track); margin-bottom:8px; }
  .metric-help-body { font-size:var(--type-body-size); color:var(--text-muted); line-height:var(--type-body-line); font-weight:var(--type-body-weight); letter-spacing:var(--type-body-track); }
  .metric-help-detail { margin-top:10px; font-size:var(--type-secondary-size); line-height:var(--type-secondary-line); color:var(--text-muted); font-weight:var(--type-secondary-weight); }
  .metric-help-close { margin-top:14px; width:100%; border:none; border-radius:10px; background:var(--brown); color:var(--bg); padding:11px; font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); cursor:pointer; }

  .feeding-overlay { position:fixed; inset:0; background:rgba(75,60,48,0.3); display:flex; align-items:center; justify-content:center; padding:16px; z-index:220; }
  .feeding-card { width:min(100%, 360px); background:var(--surf); border:1.5px solid var(--border); border-radius:var(--radius-md); box-shadow:var(--shadow-lg); padding:14px; display:flex; flex-direction:column; gap:10px; }
  .feeding-field { display:flex; flex-direction:column; gap:6px; }
  .feeding-field input, .feeding-field select { width:100%; border:1.5px solid var(--border); border-radius:10px; padding:10px 11px; background:var(--surf-soft); color:var(--brown); font-size:var(--type-body-size); line-height:var(--type-body-line); font-weight:var(--type-body-weight); letter-spacing:var(--type-body-track); }
  .feeding-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }

  .train-coverage { text-align:center; }

  /* ── Welcome-back banner ── */
  .welcome-back { margin:0 24px 16px; background:var(--surf); border-radius:var(--radius-sm); padding:16px; border-left:3px solid var(--green-dark); box-shadow:0 1px 4px rgba(75,60,48,0.06); display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .welcome-back-text { font-size:var(--type-secondary-size); color:var(--text-muted); line-height:var(--type-secondary-line); font-weight:var(--type-secondary-weight); }
  .welcome-back-dismiss { background:none; border:none; color:var(--border); font-size:16px; cursor:pointer; padding:2px 4px; flex-shrink:0; }

  /* ── Pattern break tap ripple ── */
  @keyframes patRipple { from{transform:scale(0.96);opacity:0.6} to{transform:scale(1);opacity:1} }
  .btn-pat:active { animation:patRipple 0.15s ease; }

  /* ── Focus ring pulse when target reached ── */
  @keyframes ringPulse { 0%,100%{filter:drop-shadow(0 0 0px rgba(255,255,255,0))} 50%{filter:drop-shadow(0 0 14px rgba(255,255,255,0.55))} }
  .session-control.is-complete { animation:ringPulse 0.9s ease-in-out 2; }

  /* ── Settings section headers ── */
  .settings-section-label { font-size:var(--type-secondary-size); color:var(--text-muted); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); margin:20px 0 10px; }
  .protocol-summary { line-height:1.6; margin-bottom:14px; }
  .proto-edit-btn { margin-top:10px; padding:8px 16px; min-height:44px; border-radius:99px; border:1.5px solid var(--amber); background:transparent; color:var(--amber); cursor:pointer; }
  .proto-advanced-note { color:var(--amber); font-weight:var(--type-overline-weight); margin-bottom:10px; font-size:var(--type-overline-size); line-height:var(--type-overline-line); letter-spacing:var(--type-overline-track); text-transform:uppercase; }
  .plain-btn-link { margin-top:12px; background:none; border:none; cursor:pointer; text-decoration:underline; }

  .settings-danger-sep { height:1px; background:var(--border); margin:8px 0 16px; opacity:0.5; }

  /* ── Notif toggle height fix (44px min) ── */
  .notif-toggle { min-height:44px; padding:0 18px; border-radius:99px; border:1.5px solid var(--border); background:var(--surf-soft); color:var(--text-muted); font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); cursor:pointer; transition:all 0.2s; display:flex; align-items:center; }
  .notif-toggle.on { background:var(--green-dark); color:white; border-color:var(--green-dark); }


  .t-body { font-size:var(--type-body-size); font-weight:var(--type-body-weight); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); color:var(--text-muted); }
  .t-helper { font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); color:var(--text-muted); }
  .t-btn { font-size:var(--type-button-size); font-weight:var(--type-button-weight); line-height:var(--type-button-line); letter-spacing:var(--type-button-track); }
  .num-stable { font-variant-numeric:tabular-nums; }
  .prose { font-family:var(--font-prose); line-height:1.7; letter-spacing:0; }

  /* ── Typography overrides ── */
  .proto-row { font-size:var(--type-body-size); font-weight:var(--type-body-weight); color:var(--text-muted); line-height:var(--type-body-line); letter-spacing:var(--type-body-track); }
  .p-desc { font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); color:var(--text-muted); margin-top:4px; }
  .h-date { font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); color:var(--text-muted); margin-top:6px; }

  .clear-btn { background:none; border:none; color:var(--text-muted); font-size:var(--type-secondary-size); font-weight:var(--type-secondary-weight); line-height:var(--type-secondary-line); letter-spacing:var(--type-secondary-track); cursor:pointer; text-decoration:underline; padding:4px; }
  .clear-btn:hover { color:var(--red); }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-thumb { background:var(--border); border-radius:99px; }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const PawIcon = ({ size = 36 }) => (
  <img src={ICONS.paw} width={size} height={size} alt="PawTimer"
    style={{ display:"inline-block", objectFit:"contain" }}/>
);
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>
);
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
  </svg>
);
const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);


function SessionControl({
  phase,
  elapsed,
  target,
  onStart,
  onEnd,
  onCancel,
  completed,
}) {
  const [pressing, setPressing] = useState(false);
  const remaining = Math.max(target - elapsed, 0);
  const remainingSeconds = Math.max(Math.ceil(remaining), 0);
  const radius = 103;
  const circumference = 2 * Math.PI * radius;
  const frac = Math.min(elapsed / Math.max(target, 1), 1);
  const isRunning = phase === "running";
  const isIdle = phase === "idle";

  const startWithFeedback = () => {
    if (!onStart) return;
    setPressing(true);
    setTimeout(() => {
      setPressing(false);
      onStart();
    }, 120);
  };

  return (
    <>
      {phase !== "rating" && (<div className="session-control-wrap">
        <button
          className={`session-control ${isRunning ? "is-running" : ""} ${pressing ? "is-pressing" : ""} ${completed ? "is-complete" : ""}`}
          onClick={isIdle ? startWithFeedback : undefined}
          aria-label={isRunning
            ? `${remainingSeconds}s remaining in current session`
            : `Start ${fmt(target)} session`}
          aria-live={isRunning ? "polite" : undefined}
        >
          <svg className="sc-ring-svg" viewBox="0 0 226 226" aria-hidden="true">
            <circle className="sc-track" cx="113" cy="113" r={radius} />
            <circle
              className="sc-progress"
              cx="113"
              cy="113"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - frac)}
              style={{ opacity: isRunning || completed ? 1 : 0.18 }}
            />
          </svg>

          <div className="sc-content">
            <div className="sc-idle" aria-hidden={isRunning}>
              <div className="sc-idle-label">
                <span>Start</span>
                <span>Session</span>
              </div>
            </div>

            <div className="sc-time">
              <div className="sc-time-value">{remainingSeconds}s</div>
            </div>
          </div>
        </button>
      </div>)}

      {isRunning && (
        <div className="session-actions">
          <button className="session-end-btn" onClick={onEnd}>End Session</button>
          <button className="session-cancel-btn" onClick={onCancel}>Cancel (don't save)</button>
        </div>
      )}
    </>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
const LEAVE_OPTIONS = [
  { value: 1, label: "1–2 times",  sub: "Work from home / rarely leave",       emoji: "🏠" },
  { value: 3, label: "3–4 times",  sub: "Short errands, occasional walks",      emoji: "🚶" },
  { value: 5, label: "5–6 times",  sub: "Regular commute or active lifestyle",  emoji: "🚗" },
  { value: 8, label: "7+ times",   sub: "Frequent short trips during the day",  emoji: "🏃" },
];
const CALM_DURATIONS = [
  { value: 30,   label: "30s",    sub: "Just starting out" },
  { value: 120,  label: "2 min",  sub: "A little bit" },
  { value: 300,  label: "5 min",  sub: "Getting there" },
  { value: 600,  label: "10 min", sub: "Doing okay" },
  { value: 1200, label: "20 min", sub: "Pretty good" },
  { value: 1800, label: "30 min", sub: "Almost there" },
];
const GOAL_DURATIONS = [
  { value: 1800,  label: "30 min",  sub: "Short errands" },
  { value: 2400,  label: "40 min",  sub: "Standard goal" },
  { value: 3600,  label: "1 hour",  sub: "Longer walks" },
  { value: 7200,  label: "2 hours", sub: "Half workday" },
  { value: 14400, label: "4 hours", sub: "Morning/afternoon" },
  { value: 28800, label: "8 hours", sub: "Full workday" },
];

function Onboarding({ onComplete, onBack }) {
  const [step,   setStep]   = useState(0);
  const [name,   setName]   = useState("");
  const [leaves, setLeaves] = useState(null);
  const [calm,   setCalm]   = useState(null);
  const [goal,   setGoal]   = useState(null);

  const cleanName = name.replace(/\s+/g, " ").trim();
  const canNext = [cleanName.length >= 1, leaves !== null, calm !== null, goal !== null][step];
  const displayName = cleanName || "your dog";

  const handleNext = () => {
    if (step < 3) setStep(s => s + 1);
    else onComplete({ dogName: cleanName, leavesPerDay: leaves, currentMaxCalm: calm, goalSeconds: goal });
  };

  return (
    <div className="onboarding">
      <div className="ob-hero">
        <div className="ob-hero-icon"><PawIcon size={48}/></div>
        <div className="ob-title">PawTimer</div>
        <div className="ob-subtitle">Set up {displayName}'s training plan in 4 steps.</div>
        <div className="ob-step-indicator">
          {[0,1,2,3].map(i => <div key={i} className={`ob-step-dot ${i < step ? "done" : i === step ? "active" : ""}`}/>)}
        </div>
      </div>
      <div className="ob-body">
        {step === 0 && (<>
          <div className="ob-question">What's your dog's name?</div>
          <div className="ob-note prose">Names are case-insensitive, and we'll keep your dog's natural spelling.</div>
          <div className="ob-hint">Used to personalise messages throughout the app.</div>
          <input className="ob-input" placeholder="e.g. Luna, Maximilian…"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && canNext && handleNext()} autoFocus/>
        </>)}
        {step === 1 && (<>
          <div className="ob-question">How often do you leave the house per day?</div>
          <div className="ob-hint">Determines how many pattern-break exercises to recommend each day.</div>
          <div className="ob-options">
            {LEAVE_OPTIONS.map(o => (
              <button key={o.value} className={`ob-option ${leaves === o.value ? "selected" : ""}`} onClick={() => setLeaves(o.value)}>
                <span className="ob-option-emoji">{o.emoji}</span>
                <div><div className="ob-option-label">{o.label}</div><div className="ob-option-sub">{o.sub}</div></div>
              </button>
            ))}
          </div>
        </>)}
        {step === 2 && (<>
          <div className="ob-question">How long can {displayName} stay calm alone now?</div>
          <div className="ob-hint">Sessions start just below this — easy and confidence-building.</div>
          <div className="ob-duration-grid">
            {CALM_DURATIONS.map(d => (
              <button key={d.value} className={`ob-dur-btn ${calm === d.value ? "selected" : ""}`} onClick={() => setCalm(d.value)}>
                <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
              </button>
            ))}
          </div>
        </>)}
        {step === 3 && (<>
          <div className="ob-question">What's the goal for {displayName}?</div>
          <div className="ob-hint">Training is gradual. You can change this any time.</div>
          <div className="ob-duration-grid">
            {GOAL_DURATIONS.map(d => (
              <button key={d.value} className={`ob-dur-btn ${goal === d.value ? "selected" : ""}`} onClick={() => setGoal(d.value)}>
                <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
              </button>
            ))}
          </div>
        </>)}
      </div>
      <div className="ob-footer">
        <button className="ob-btn-next" onClick={handleNext} disabled={!canNext}>
          {step < 3 ? "Continue →" : `Start training with ${displayName} 🐾`}
        </button>
        <button className="ob-back-btn" onClick={() => step === 0 ? onBack?.() : setStep(s => s - 1)}>
          ← {step === 0 ? "Back to dogs" : "Back"}
        </button>
      </div>
    </div>
  );
}

// ─── Dog Select screen ────────────────────────────────────────────────────────
function DogSelect({ dogs, onSelect, onCreateNew }) {
  const [joinId,    setJoinId]    = useState("");
  const [joinError, setJoinError] = useState("");

  const handleJoin = () => {
    const id = joinId.trim().toUpperCase();
    if (id.length < 3 || !id.includes("-")) {
      setJoinError("Enter a valid dog ID — e.g. LUNA-4829"); return;
    }
    setJoinError("");
    onSelect(id, true);
  };

  return (
    <div className="dog-select">
      <div className="ds-hero">
        <div className="ds-logo"><PawIcon size={68}/></div>
        <div className="ds-title">PawTimer</div>
        <div className="ds-sub">Separation anxiety training tracker</div>
      </div>
      <div className="ds-body">
        {dogs.length > 0 && (<>
          <div className="ds-section-label">Your dogs</div>
          {dogs.map(d => (
            <div key={d.id} className="ds-dog-card" onClick={() => onSelect(d.id)}>
              <PawIcon size={30}/>
              <div>
                <div className="ds-dog-name">{d.dogName || "Your dog"}</div>
                <div className="ds-dog-id">ID: {d.id}</div>
              </div>
              <div className="ds-dog-arrow">›</div>
            </div>
          ))}
          <div className="ds-divider">
            <div className="ds-divider-line"/><div className="ds-divider-text">or</div><div className="ds-divider-line"/>
          </div>
        </>)}

        <button className="ds-btn ds-btn-primary" onClick={onCreateNew}>
          <PawIcon size={20} color="rgba(255,255,255,0.85)"/> Add a new dog
        </button>

        <div className="ds-section-label" style={{ marginTop: 22 }}>Join with a dog ID</div>
        <div className="ds-note">Dog IDs are case-insensitive — matched automatically regardless of case.</div>
        <div className="t-helper" style={{ marginBottom:10 }}>
          Use the same ID from your partner's phone to track the same dog together.
        </div>
        <div className="ds-join-row">
          <input className="ds-join-input" placeholder="e.g. LUNA-4829"
            value={joinId}
            onChange={e => { setJoinId(e.target.value); setJoinError(""); }}
            onKeyDown={e => e.key === "Enter" && joinId.trim() && handleJoin()}
            maxLength={14}/>
          <button className="ds-join-btn" onClick={handleJoin}>Join →</button>
        </div>
        {joinError && <div className="ds-join-error">{joinError}</div>}
        <div className="ds-join-hint">Find the ID in PawTimer → Settings tab.</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PawTimer() {
  const [dogs,        setDogs]        = useState(() => ensureArray(load(DOGS_KEY, [])));
  const [activeDogId, setActiveDogId] = useState(() => canonicalDogId(load(ACTIVE_DOG_KEY, null)));
  const [screen,      setScreen]      = useState("select");
  const [sessions,    setSessions]    = useState([]);
  const [walks,       setWalks]       = useState([]);
  const [patterns,    setPatterns]    = useState([]);
  const [feedings,    setFeedings]    = useState([]);
  const [tab,          setTab]          = useState("home");
  const [phase,        setPhase]        = useState("idle"); // idle | running | rating
  const [elapsed,      setElapsed]      = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionOutcome, setSessionOutcome] = useState(null);
  const [latencyDraft, setLatencyDraft] = useState("");
  const [distressTypeDraft, setDistressTypeDraft] = useState("");
  const [target,       setTarget]       = useState(PROTOCOL.startDurationSeconds);
  const [toast,        setToast]        = useState(null);
  const [patOpen,      setPatOpen]      = useState(false);  // collapsible pattern breaking
  const [patLabels,    setPatLabels]    = useState({});     // custom pattern labels
  const [editingPat,   setEditingPat]   = useState(null);   // type being renamed
  const [dogPhoto,     setDogPhoto]     = useState(null);   // base64 dog photo
  const [syncStatus,   setSyncStatus]   = useState("idle"); // idle|syncing|ok|err
  const [syncError,    setSyncError]    = useState("");
  const [syncDiagRunning, setSyncDiagRunning] = useState(false);
  const [syncDiagResult,  setSyncDiagResult]  = useState(null);
  const [notifTime,    setNotifTime]    = useState(() => load("pawtimer_notif_time", "09:00"));
  const [notifEnabled, setNotifEnabled] = useState(() => load("pawtimer_notif_on", false));
  const [protoWarnAck, setProtoWarnAck] = useState(false);
  const [protoOverride,setProtoOverride]= useState(() => ensureObject(load("pawtimer_proto_override", {})));
  const [showCoach,    setShowCoach]    = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [openTip,      setOpenTip]      = useState(null);
  const [metricHelp,   setMetricHelp]   = useState(null);
  const [walkPhase,    setWalkPhase]    = useState("idle"); // idle | timing | classify
  const [walkElapsed,  setWalkElapsed]  = useState(0);
  const [walkPendingDuration, setWalkPendingDuration] = useState(0);
  const [feedingOpen, setFeedingOpen] = useState(false);
  const [feedingDraft, setFeedingDraft] = useState(() => ({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" }));
  const walkTimerRef = useRef(null);
  const walkStartRef = useRef(null);

  const timerRef = useRef(null);
  const startRef = useRef(null);

  // ── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => { save(DOGS_KEY, dogs); }, [dogs]);
  useEffect(() => { save(ACTIVE_DOG_KEY, canonicalDogId(activeDogId)); }, [activeDogId]);

  useEffect(() => {
    if (!activeDogId) { setScreen("select"); return; }
    const normalizedId = canonicalDogId(activeDogId);
    const dog = dogs.find((d) => canonicalDogId(d.id) === normalizedId)
      ?? ensureArray(load(DOGS_KEY, [])).find((d) => canonicalDogId(d.id) === normalizedId);
    if (!dog) {
      logSyncDebug("hydrateDog:missingLocalDog", { dogId: normalizedId, syncEnabled: SYNC_ENABLED });
      setScreen("select");
      return;
    }

    const local = hydrateDogFromLocal(normalizedId);
    logSyncDebug("hydrateDog:localCacheLoaded", {
      dogId: normalizedId,
      sessions: local.sessions.length,
      walks: local.walks.length,
      patterns: local.patterns.length,
    });
    setSessions(local.sessions);
    setWalks(local.walks);
    setPatterns(local.patterns);
    setFeedings(normalizeFeedings(local.feedings));
    setPatLabels(local.patLabels);
    setDogPhoto(local.photo);
    setTarget(suggestNext(local.sessions, dog));
    setScreen("app");
  }, [activeDogId, dogs]);

  useEffect(() => { if (activeDogId) save(sessKey(activeDogId), sessions); }, [sessions, activeDogId]);
  useEffect(() => { if (activeDogId) save(walkKey(activeDogId), walks);    }, [walks,    activeDogId]);
  useEffect(() => { if (activeDogId) save(patKey(activeDogId),  patterns); }, [patterns, activeDogId]);
  useEffect(() => { if (activeDogId) save(feedingKey(activeDogId), feedings); }, [feedings, activeDogId]);
  useEffect(() => { if (activeDogId) save(patLblKey(activeDogId), patLabels); }, [patLabels, activeDogId]);
  useEffect(() => { if (activeDogId) save(photoKey(activeDogId), dogPhoto); }, [dogPhoto, activeDogId]);
  useEffect(() => { save("pawtimer_notif_time", notifTime); }, [notifTime]);
  useEffect(() => { save("pawtimer_notif_on", notifEnabled); }, [notifEnabled]);
  useEffect(() => { save("pawtimer_proto_override", protoOverride); }, [protoOverride]);

  // ── Notification scheduling ──────────────────────────────────────────────
  const scheduleNotif = useCallback(async (time, dogName) => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    if (Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return false;
    }
    const [h, m] = time.split(":").map(Number);
    // Tell the service worker to schedule the alarm
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "SCHEDULE_NOTIF", hour: h, minute: m, dogName });
    return true;
  }, []);

  const cancelNotif = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    reg?.active?.postMessage({ type: "CANCEL_NOTIF" });
  }, []);

  const handleToggleNotif = async () => {
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogName = dog?.dogName ?? "your dog";
    if (!notifEnabled) {
      const ok = await scheduleNotif(notifTime, dogName);
      if (ok) { setNotifEnabled(true); showToast("🔔 Reminder set!"); }
      else showToast("⚠️ Notifications blocked — check browser settings");
    } else {
      cancelNotif();
      setNotifEnabled(false);
      showToast("🔕 Reminder turned off");
    }
  };

  // ── Cross-device sync: fetch remote on mount + poll every 15 s ────────────
  useEffect(() => {
    if (!activeDogId || !SYNC_ENABLED) { setSyncStatus("idle"); setSyncError(""); return; }
    let live = true;
    const sync = async () => {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(canonicalDogId(activeDogId));
      if (!live) return;
      if (!remote) {
        setSyncStatus("err");
        setSyncError(error || "Unknown sync fetch error");
        return;
      }
      if (remote.dog) {
        setDogs((prev) => {
          const mergedDog = { ...remote.dog, id: canonicalDogId(remote.dog.id || activeDogId) };
          const next = [...prev.filter((d) => canonicalDogId(d.id) !== mergedDog.id), mergedDog];
          save(DOGS_KEY, next);
          return next;
        });
      }
      const remoteSessions = normalizeSessions(remote.sessions);
      const remoteWalks = ensureArray(remote.walks);
      const remotePatterns = ensureArray(remote.patterns);
      let remoteFeedings = normalizeFeedings(remote.feedings);

      const localFeedings = normalizeFeedings(load(feedingKey(activeDogId), feedings));
      const missingRemoteFeedings = localFeedings.filter((localEntry) => !remoteFeedings.some((remoteEntry) => remoteEntry.id === localEntry.id));
      if (missingRemoteFeedings.length > 0) {
        const currentDog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
        const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
        for (const entry of missingRemoteFeedings) {
          await syncPush(canonicalDogId(activeDogId), "feeding", entry, dogSettings);
        }
        const feedingRefresh = await sbReq(`feedings?dog_id=eq.${encodeURIComponent(canonicalDogId(activeDogId))}&select=id,date,food_type,amount&order=date.asc`);
        if (feedingRefresh.ok) {
          remoteFeedings = normalizeFeedings(feedingRefresh.data);
        }
      }

      logSyncDebug("syncPoll:remoteLoaded", {
        dogId: canonicalDogId(activeDogId),
        dogFound: Boolean(remote.dog),
        sessions: remoteSessions.length,
        walks: remoteWalks.length,
        patterns: remotePatterns.length,
        feedings: remoteFeedings.length,
      });
      setSessions(remoteSessions);
      setWalks(remoteWalks);
      setPatterns(remotePatterns);
      setFeedings(remoteFeedings);
      save(sessKey(activeDogId), remoteSessions);
      save(walkKey(activeDogId), remoteWalks);
      save(patKey(activeDogId), remotePatterns);
      save(feedingKey(activeDogId), remoteFeedings);
      setSyncError("");
      setSyncStatus("ok");
    };
    sync();
    const timer = setInterval(sync, 15_000);
    return () => { live = false; clearInterval(timer); };
  }, [activeDogId]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDogPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Boot: restore last active dog
  useEffect(() => {
    const savedId   = load(ACTIVE_DOG_KEY, null);
    const savedDogs = ensureArray(load(DOGS_KEY, []));
    if (savedId && (SYNC_ENABLED || savedDogs.find(d => canonicalDogId(d.id) === canonicalDogId(savedId)))) {
      setActiveDogId(canonicalDogId(savedId));
    }
    else setScreen("select");
  }, []);

  useEffect(() => {
    if (!SYNC_ENABLED || !activeDogId) return;
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    if (!dog) return;
    syncUpsertDog(dog).then(({ ok, error }) => {
      if (!ok) {
        setSyncStatus("err");
        setSyncError(error || "Unable to sync dog settings");
      }
    });
  }, [activeDogId, dogs]);

  // Coach mark: show on first ever app open (no sessions yet)
  useEffect(() => {
    if (screen === "app" && sessions.length === 0) {
      const seen = load("pawtimer_coach_seen", false);
      if (!seen) { setTimeout(() => setShowCoach(true), 600); }
    }
  }, [screen, sessions.length]);

  // Welcome-back: show if last session was > 5 days ago
  useEffect(() => {
    if (screen === "app" && sessions.length > 0) {
      const last = sessions[sessions.length - 1];
      const daysSince = (Date.now() - new Date(last.date)) / 86400000;
      if (daysSince >= 5) setShowWelcomeBack(true);
    }
  }, [screen]);

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") {
      setSessionCompleted(false);
      return;
    }
    if (elapsed >= target) setSessionCompleted(true);
  }, [phase, elapsed, target]);

  useEffect(() => {
    if (phase === "running") {
      startRef.current = Date.now() - elapsed * 1000;
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 500);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openDog = (dog) => {
    logSyncDebug("openDog", { dogId: canonicalDogId(dog?.id), hasLocalDogRecord: Boolean(dog) });
    setActiveDogId(canonicalDogId(dog.id));
    setScreen("app");
  };

  const handleDogSelect = async (id, isJoin = false) => {
    const normalizedId = canonicalDogId(id);
    logSyncDebug("handleDogSelect:start", { enteredDogId: id, canonicalDogId: normalizedId, isJoin, syncEnabled: SYNC_ENABLED });

    if (isJoin && SYNC_ENABLED) {
      setSyncStatus("syncing");
      const { result: remote, error } = await syncFetch(normalizedId);
      if (!remote?.dog) {
        setSyncStatus("err");
        setSyncError(error || `No shared dog account found for ${normalizedId}`);
        logSyncDebug("handleDogSelect:joinFailed", {
          dogId: normalizedId,
          reason: error || "No shared dog account found",
          localPlaceholderCreated: false,
        });
        showToast(`⚠️ No shared profile found for ${normalizedId} yet.`);
        return;
      }

      const sharedDog = { ...remote.dog, id: normalizedId };
      setDogs((prev) => [...prev.filter((d) => canonicalDogId(d.id) !== normalizedId), sharedDog]);
      setSessions(normalizeSessions(remote.sessions));
      setWalks(ensureArray(remote.walks));
      setPatterns(ensureArray(remote.patterns));
      setFeedings(normalizeFeedings(remote.feedings));

      if (error) {
        setSyncStatus("err");
        setSyncError(error);
        showToast(`⚠️ Joined ${normalizedId}, but related history failed to load.`);
      } else {
        setSyncError("");
        setSyncStatus("ok");
        showToast(`✅ Joined shared profile ${normalizedId}.`);
      }

      openDog(sharedDog);
      return;
    }

    const existing = dogs.find(d => canonicalDogId(d.id) === normalizedId)
                  ?? ensureArray(load(DOGS_KEY, [])).find(d => canonicalDogId(d.id) === normalizedId);
    if (existing) {
      logSyncDebug("handleDogSelect:existingLocalDog", { dogId: normalizedId, isJoin, source: "localStorage/in-memory" });
      openDog(existing);
      return;
    }
    if (isJoin) {
      setSyncStatus("err");
      setSyncError(`No shared dog account found for ${normalizedId}`);
      logSyncDebug("handleDogSelect:noRemoteDogNoFallback", {
        dogId: normalizedId,
        localPlaceholderCreated: false,
        blockedByLocalState: false,
      });
      showToast(`⚠️ No shared profile found for ${normalizedId}. Check the ID and try again.`);
    } else {
      setActiveDogId(normalizedId); setScreen("onboard");
    }
  };

  const handleOnboardComplete = (data) => {
    const id     = canonicalDogId(activeDogId || generateId(data.dogName));
    const newDog = { ...data, id, dogName: data.dogName, createdAt: new Date().toISOString() };
    setDogs(prev => [...prev.filter(d => d.id !== id), newDog]);
    setActiveDogId(id);
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const startSession = () => {
    setElapsed(0);
    setSessionCompleted(false);
    setSessionOutcome(null);
    setLatencyDraft("");
    setDistressTypeDraft("");
    setPhase("running");
  };

  const endSession = () => {
    // Freeze the elapsed time, move to rating
    clearInterval(timerRef.current);
    setFinalElapsed(elapsed);
    setPhase("rating");
  };

  const pushWithSyncStatus = async (kind, data) => {
    if (!SYNC_ENABLED || !activeDogId) return false;
    const currentDog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const dogSettings = currentDog ? { ...currentDog, id: canonicalDogId(currentDog.id) } : null;
    setSyncStatus("syncing");
    const { ok, error } = await syncPush(canonicalDogId(activeDogId), kind, data, dogSettings);
    if (ok) {
      setSyncError("");
      setSyncStatus("ok");
    } else {
      setSyncError(error || "Push failed");
      setSyncStatus("err");
    }
    return ok;
  };

  const runSyncDiagnostics = async () => {
    setSyncDiagRunning(true);
    try {
      const report = {
        checkedAt: new Date().toISOString(),
        env: {
          syncEnabled: SYNC_ENABLED,
          hasUrl: Boolean(SB_URL),
          hasAnonKey: Boolean(SB_KEY),
          normalizedUrl: SB_BASE_URL || "(missing)",
          urlLooksValid: /^https:\/\/[^\s]+\.supabase\.co$/i.test(SB_BASE_URL || ""),
        },
        checks: {},
      };

      if (!SB_BASE_URL || !SB_KEY) {
        report.checks.summary = { ok: false, message: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY" };
        setSyncDiagResult(report);
        return;
      }

      const readDogs = await sbReq("dogs?select=id&limit=1");
      const readSessions = await sbReq("sessions?select=id&limit=1");
      const readWalks = await sbReq("walks?select=id&limit=1");
      const readPatterns = await sbReq("patterns?select=id&limit=1");
      const readFeedings = await sbReq("feedings?select=id&limit=1");
      const diagId = `DIAG-${Date.now()}`;
      const writeProbe = await sbReq("dogs", {
        method: "POST",
        body: JSON.stringify({ id: diagId, settings: { id: diagId, diag: true } }),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      const deleteProbe = await sbReq(`dogs?id=eq.${diagId}`, { method: "DELETE" });

      report.checks = {
        dogsRead: readDogs,
        sessionsRead: readSessions,
        walksRead: readWalks,
        patternsRead: readPatterns,
        feedingsRead: readFeedings,
        dogsWriteProbe: writeProbe,
        dogsDeleteProbe: deleteProbe,
      };

      const failed = Object.values(report.checks).find((c) => c && c.ok === false);
      report.checks.summary = failed
        ? { ok: false, message: "One or more checks failed" }
        : { ok: true, message: "All checks passed" };

      setSyncDiagResult(report);
    } finally {
      setSyncDiagRunning(false);
    }
  };

  const recordResult = (distressLevelInput, options = {}) => {
    const distressLevel = normalizeDistressLevel(distressLevelInput);
    const dog = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const latencyInput = Number(options.latencyToFirstDistress);
    const latencyToFirstDistress = Number.isFinite(latencyInput) && latencyInput >= 0
      ? Math.round(latencyInput)
      : distressLevel === "none"
        ? finalElapsed
        : null;
    const distressType = options.distressType || (distressLevel === "none" ? "none" : null);
    const session = normalizeSession({
      id: makeEntryId("sess", activeDogId), date: now.toISOString(),
      plannedDuration: target, actualDuration: finalElapsed,
      distressLevel, result: distressLevel === "none" ? "success" : "distress",
      belowThreshold: distressLevel === "none" && finalElapsed >= target,
      latencyToFirstDistress,
      distressType,
      distressSeverity: distressLevel,
      context: { timeOfDay, departureType: "training", cuesUsed: [], location: null, barrierUsed: null, enrichmentPresent: null, mediaOn: null, whoLeft: null, anotherPersonStayed: null },
      symptoms: {
        barking: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0,
        pacing: ["active", "severe"].includes(distressLevel) ? 2 : distressLevel === "subtle" ? 1 : 0,
        destructive: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0,
        salivation: distressLevel === "severe" ? 2 : distressLevel === "active" ? 1 : 0,
      },
      videoReview: { recorded: false, firstSubtleDistressTs: null, firstActiveDistressTs: null, eventTags: [], notes: null, ratingConfidence: null },
      recoverySeconds: distressLevel === "none" ? 0 : null,
      preSession: { walkDuration: null, enrichmentGiven: null },
      environment: { noiseEvent: false },
    });
    const updated = [...sessions, session];
    setSessions(updated);
    pushWithSyncStatus("session", session).then(ok => {
      if (!ok) showToast("⚠️ Sync failed — check console");
    });
    const next = suggestNextWithContext(updated, walks, patterns, dog) ?? suggestNext(updated, dog);
    setTarget(next);
    setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionCompleted(false);
    setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft("");
    const n = dog?.dogName ?? "your dog";
    if (distressLevel === "none")       showToast(`✅ ${n} was calm! Next: ${fmt(next)}`);
    else if (distressLevel === "subtle")  showToast(`⚠️ Subtle stress signs — holding at ${fmt(next)}`);
    else                                showToast(`❤️ Rolled back to ${fmt(next)}`);
  };

  const cancelSession = () => {
    setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionCompleted(false);
    setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft("");
    clearInterval(timerRef.current);
  };

  // ── Walk timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (walkPhase === "timing") {
      walkStartRef.current = Date.now() - walkElapsed * 1000;
      walkTimerRef.current = setInterval(() => {
        setWalkElapsed(Math.floor((Date.now() - walkStartRef.current) / 1000));
      }, 500);
    } else {
      clearInterval(walkTimerRef.current);
    }
    return () => clearInterval(walkTimerRef.current);
  }, [walkPhase]);

  const startWalk = () => { setWalkElapsed(0); setWalkPhase("timing"); };

  const endWalk = () => {
    clearInterval(walkTimerRef.current);
    setWalkPendingDuration(walkElapsed);
    setWalkPhase("classify");
  };

  const saveWalkWithType = (walkType) => {
    const duration = walkPendingDuration;
    const entry = { id: makeEntryId("walk", activeDogId), date: new Date().toISOString(), duration, type: normalizeWalkType(walkType) };
    setWalks((prev) => [...prev, entry]);
    pushWithSyncStatus("walk", entry).then((ok) => {
      if (!ok) showToast("⚠️ Sync failed — check console");
    });
    const n = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId))?.dogName ?? "your dog";
    showToast(`🚶 ${walkTypeLabel(normalizeWalkType(walkType))} with ${n} logged — ${fmt(duration)}!`);
    setWalkPhase("idle");
    setWalkElapsed(0);
    setWalkPendingDuration(0);
  };

  const cancelWalk = () => {
    clearInterval(walkTimerRef.current);
    setWalkPhase("idle");
    setWalkElapsed(0);
    setWalkPendingDuration(0);
  };

  const editWalkDuration = (walkId) => {
    const currentWalk = walks.find((w) => w.id === walkId);
    if (!currentWalk) return;
    const input = window.prompt(
      "Edit walk duration (seconds or mm:ss)",
      Number.isFinite(currentWalk.duration) ? String(currentWalk.duration) : ""
    );
    if (input === null) return;
    const parsedDuration = parseDurationInput(input);
    if (!Number.isFinite(parsedDuration)) {
      showToast("⚠️ Invalid duration. Use seconds or mm:ss");
      return;
    }
    const updatedWalk = { ...currentWalk, duration: parsedDuration };
    setWalks((prev) => prev.map((w) => (w.id === walkId ? updatedWalk : w)));
    pushWithSyncStatus("walk", updatedWalk).then((ok) => {
      if (!ok) showToast("⚠️ Sync failed — check console");
    });
    showToast(`🚶 Walk updated to ${fmt(parsedDuration)}`);
  };

  const logWalk = () => startWalk();

  const logPattern = (type) => {
    const entry = { id: makeEntryId("pat", activeDogId), date: new Date().toISOString(), type };
    setPatterns(prev => [...prev, entry]);
    pushWithSyncStatus("pattern", entry).then(ok => {
      if (!ok) showToast("⚠️ Sync failed — check console");
    });
    showToast(`✓ Pattern break logged!`);
  };

  const openFeedingForm = () => {
    setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" });
    setFeedingOpen(true);
  };

  const cancelFeedingForm = () => {
    setFeedingOpen(false);
    setFeedingDraft({ time: toDateTimeLocalValue(new Date()), foodType: "meal", amount: "small" });
  };

  const saveFeeding = () => {
    const when = feedingDraft.time ? new Date(feedingDraft.time) : new Date();
    if (Number.isNaN(when.getTime())) {
      showToast("⚠️ Please enter a valid feeding time");
      return;
    }
    const entry = {
      id: makeEntryId("feed", activeDogId),
      date: when.toISOString(),
      foodType: feedingDraft.foodType,
      amount: feedingDraft.amount,
    };
    setFeedings((prev) => normalizeFeedings([...prev, entry]));
    pushWithSyncStatus("feeding", entry).then((ok) => {
      if (!ok) showToast("⚠️ Sync failed — check console");
    });
    setFeedingOpen(false);
    showToast("🍽️ Feeding logged");
  };

  const copyDogId = () => {
    navigator.clipboard?.writeText(activeDogId).catch(() => {});
    showToast(`📋 ID copied: ${activeDogId}`);
  };

  // ── Screen routing ────────────────────────────────────────────────────────
  if (screen === "select") return (
    <><style>{styles}</style>
    {toast && <div className="toast">{toast}</div>}
    <DogSelect dogs={dogs} onSelect={handleDogSelect}
      onCreateNew={() => { setScreen("onboard"); }}/>
    </>
  );
  if (screen === "onboard") return (
    <><style>{styles}</style>
    <Onboarding onComplete={handleOnboardComplete} onBack={() => setScreen("select")}/>
    </>
  );

  // ── Computed values ───────────────────────────────────────────────────────
  const dog      = dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId));
  const name     = dog?.dogName ?? "your dog";
  const goalSec  = dog?.goalSeconds ?? 2400;
  const goalPct  = Math.min((target / goalSec) * 100, 100);

  // Merge user overrides on top of PROTOCOL constants (for display + advisory warnings)
  const activeProto = { ...PROTOCOL, ...protoOverride };

  // Protocol: daily session allowance
  const { count: countToday, usedSec, capSec, canAdd } = dailyInfo(sessions);
  const capPct  = Math.min((usedSec / capSec) * 100, 100);
  const capNear = capPct >= 60 && capPct < 90;
  const capFull = capPct >= 90;

  // Protocol: pattern-break status
  const leaveProfile = getLeaveProfile(dog?.leavesPerDay);
  const { todayPat, todayWalks, recMin, recMax, needed, behind, walkBuffer, normalizedLeaves } = patternInfo(patterns, walks, dog?.leavesPerDay, activeProto);

  // Pattern reminder text
  // IMPORTANT: Pattern breaks must be done SEPARATELY from walks —
  // the goal is to break the departure→anxiety association, so
  // sometimes putting on shoes/jacket does NOT lead to going out.
  const patReminderText = (() => {
    if (todayPat === 0)
      return `Do ${recMin}–${recMax} pattern breaks today (based on ~${normalizedLeaves} daily leave${normalizedLeaves === 1 ? "" : "s"}) — spread throughout the day, NOT linked to actual walks. Put on shoes (or jacket, or pick up keys), then take them off and sit back down. This teaches ${name} that these actions don't always mean you're leaving.`;
    if (behind) {
      const deficit = needed - todayPat;
      return `⚠️ You've logged ${todayWalks} walk${todayWalks !== 1 ? "s" : ""} but only ${todayPat} pattern break${todayPat !== 1 ? "s" : ""}. Do ${deficit} more — with ~${normalizedLeaves} daily departures we add a ${walkBuffer} extra-cue safety buffer so pattern breaks clearly outnumber full departures.`;
    }
    if (todayPat >= recMax) return `✅ ${todayPat} pattern breaks done today — great work! Cues are losing their power.`;
    return `${todayPat} of ${recMin}–${recMax} pattern breaks done for a ${leaveProfile.desc}. Do a few more at random times — not before walks, just scattered through the day.`;
  })();

  // Stats
  const noneCount   = sessions.filter(s => s.distressLevel === "none").length;
  const subtleCount = sessions.filter(s => s.distressLevel === "subtle").length;
  const activeCount = sessions.filter(s => s.distressLevel === "active").length;
  const severeCount = sessions.filter(s => s.distressLevel === "severe").length;
  const totalCount  = sessions.length;
  const totalAlone  = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const bestCalm    = sessions.filter(s => s.distressLevel === "none")
    .reduce((m, s) => Math.max(m, s.actualDuration), 0);
  const streak = (() => {
    let n = 0;
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].distressLevel === "none") n++; else break;
    } return n;
  })();
  const lastSess = sessions[sessions.length - 1];

  const recommendationCoverageCount = sessions.filter(s =>
    (hasValue(s.context?.timeOfDay) || hasValue(s.context?.departureType) || (Array.isArray(s.context?.cuesUsed) && s.context.cuesUsed.length > 0))
    && ["barking","pacing","destructive","salivation"].some(k => hasValue(s.symptoms?.[k]))
    && hasValue(s.recoverySeconds)
    && (hasValue(s.preSession?.walkDuration) || hasValue(s.preSession?.enrichmentGiven))
    && hasValue(s.environment?.noiseEvent)
  ).length;
  const recommendationCoveragePct = totalCount ? Math.round((recommendationCoverageCount / totalCount) * 100) : 0;
  const toDayKey = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const calcWindowCalmRate = (days) => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const windowSessions = sessions.filter((s) => {
      const d = new Date(s.date);
      return !isNaN(d) && d >= cutoff;
    });
    if (!windowSessions.length) return null;
    const calm = windowSessions.filter((s) => s.distressLevel === "none").length;
    return Math.round((calm / windowSessions.length) * 100);
  };
  const calmRate7 = calcWindowCalmRate(7);
  const calmRate14 = calcWindowCalmRate(14);

  const doseMultiplier = leaveProfile.confidenceScale;
  const adjustedTarget = Math.max(
    activeProto.startDurationSeconds,
    Math.round(target * doseMultiplier)
  );
  const recommendationConfidence = (() => {
    if (!sessions.length) return "building";

    const recent = sessions.slice(-8);
    const calmRecent = recent.filter((s) => s.distressLevel === "none").length;
    const subtleRecent = recent.filter((s) => s.distressLevel === "subtle").length;
    const activeRecent = recent.filter((s) => s.distressLevel === "active").length;
    const severeRecent = recent.filter((s) => s.distressLevel === "severe").length;

    const sessionVolumeScore = Math.min(1, sessions.length / 12);
    const qualityScore = Math.max(0, Math.min(1, (calmRecent + (subtleRecent * 0.45) - (activeRecent * 0.7) - (severeRecent * 0.9)) / Math.max(1, recent.length)));
    const streakScore = Math.min(1, streak / 5);

    const weighted = (sessionVolumeScore * 0.3) + (qualityScore * 0.5) + (streakScore * 0.2);

    if (weighted >= 0.72) return "strong";
    if (weighted >= 0.42) return "stable";
    return "building";
  })();

  const calmDurations = sessions
    .filter((s) => s.distressLevel === "none" && Number.isFinite(s.actualDuration))
    .map((s) => s.actualDuration)
    .slice(-11);
  const calmMedian = (() => {
    if (!calmDurations.length) return null;
    const sorted = [...calmDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  })();
  const durationVariability = (() => {
    const durations = sessions.map((s) => s.actualDuration).filter((n) => Number.isFinite(n));
    if (durations.length < 2) return null;
    const mean = durations.reduce((sum, n) => sum + n, 0) / durations.length;
    const variance = durations.reduce((sum, n) => sum + ((n - mean) ** 2), 0) / durations.length;
    return Math.round(Math.sqrt(variance));
  })();

  const relapseWindow = 6;
  const recentSessions = sessions.slice(-relapseWindow);
  const recentSevereCount = recentSessions.filter((s) => s.distressLevel === "severe").length;
  const recentHighDistressCount = recentSessions.filter((s) => ["active", "severe"].includes(s.distressLevel)).length;
  const relapseRisk = recentHighDistressCount >= 2;

  const trainingReadiness = (() => {
    const now = Date.now();
    const lastWalk = walks.length ? walks[walks.length - 1] : null;
    const lastWalkTs = lastWalk ? new Date(lastWalk.date).getTime() : NaN;
    const walkToday = walks.some((w) => isToday(w.date));
    const walkWithinTwoHours = Number.isFinite(lastWalkTs) && ((now - lastWalkTs) <= (2 * 60 * 60 * 1000));

    const lastSession = sessions.length ? sessions[sessions.length - 1] : null;
    const lastSessionLevel = normalizeDistressLevel(lastSession?.distressLevel);
    const lastSessionTs = lastSession ? new Date(lastSession.date).getTime() : NaN;
    const minutesSinceLastSession = Number.isFinite(lastSessionTs) ? ((now - lastSessionTs) / 60000) : null;

    if (!walkToday || ["active", "severe"].includes(lastSessionLevel) || (minutesSinceLastSession != null && minutesSinceLastSession < 5)) {
      return { level: "LOW", color: "var(--red)" };
    }

    if (walkWithinTwoHours && lastSessionLevel === "none" && (minutesSinceLastSession == null || minutesSinceLastSession >= 10)) {
      return { level: "HIGH", color: "var(--green-dark)" };
    }

    if (!walkWithinTwoHours || lastSessionLevel === "subtle" || (minutesSinceLastSession != null && minutesSinceLastSession >= 5 && minutesSinceLastSession < 10)) {
      return { level: "MEDIUM", color: "var(--orange)" };
    }

    return { level: "MEDIUM", color: "var(--orange)" };
  })();

  const adherenceByDay = (() => {
    const dayMap = new Map();
    walks.forEach((w) => {
      const key = toDayKey(w.date);
      if (!key) return;
      if (!dayMap.has(key)) dayMap.set(key, { walks: 0, pats: 0 });
      dayMap.get(key).walks += 1;
    });
    patterns.forEach((p) => {
      const key = toDayKey(p.date);
      if (!key) return;
      if (!dayMap.has(key)) dayMap.set(key, { walks: 0, pats: 0 });
      dayMap.get(key).pats += 1;
    });
    const days = [...dayMap.values()];
    if (!days.length) return null;
    const score = days.reduce((sum, day) => {
      if (day.walks === 0 && day.pats > 0) return sum + 1;
      if (day.walks === 0) return sum;
      return sum + Math.min(day.pats / day.walks, 1);
    }, 0) / days.length;
    return Math.round(score * 100);
  })();

  const statusTone = (value, { good, warn, invert = false }) => {
    if (value == null) return { color: "var(--brown-muted)", label: "Building baseline" };
    if (!invert) {
      if (value >= good) return { color: "var(--green-dark)", label: "Strong" };
      if (value >= warn) return { color: "var(--orange)", label: "Mixed" };
      return { color: "var(--red)", label: "Watch closely" };
    }
    if (value <= good) return { color: "var(--green-dark)", label: "Stable" };
    if (value <= warn) return { color: "var(--orange)", label: "Variable" };
    return { color: "var(--red)", label: "Unsteady" };
  };
  const momentumTone = statusTone(calmRate7, { good: 75, warn: 55 });
  const stabilityTone = statusTone(durationVariability, { good: 120, warn: 240, invert: true });
  const adherenceTone = statusTone(adherenceByDay, { good: 85, warn: 65 });
  const relapseTone = relapseRisk
    ? { color: "var(--red)", label: "Elevated" }
    : recentSessions.length < relapseWindow
      ? { color: "var(--brown-muted)", label: "Gathering data" }
      : { color: "var(--green-dark)", label: "Low" };

  const metricExplainers = {
    stability: {
      title: "Stability",
      body: "How consistent calm-session durations are. Higher stability means your calm sessions are predictable; big swings suggest your dog may still need more repetition at easier levels.",
      detail: `Median calm · SD ${durationVariability != null ? fmt(durationVariability) : "—"} · ${stabilityTone.label}`,
    },
    momentum: {
      title: "Momentum",
      body: "Your short-term trend. It compares calm-session rate over the last 7 days against the last 14 days to show whether progress is improving, holding, or slipping.",
      detail: `7d calm · 14d ${calmRate14 != null ? `${calmRate14}%` : "—"} · ${momentumTone.label}`,
    },
    relapseRisk: {
      title: "Relapse risk",
      body: "A quick warning signal based on high-distress sessions in your most recent attempts. More active/severe distress in the recent window means a higher chance of setbacks and a need to slow down.",
      detail: `${recentHighDistressCount}/${relapseWindow} recent sessions active/severe distress (${recentSevereCount} severe) · ${relapseTone.label}`,
    },
    adherence: {
      title: "Adherence",
      body: "How well daily pattern breaks keep pace with real departures (walks together). Better adherence means cues are practiced enough to support training progress.",
      detail: `Pattern breaks vs walks by day · ${adherenceTone.label}`,
    },
  };

  const openMetricHelp = (metricKey) => {
    if (!metricExplainers[metricKey]) return;
    setMetricHelp(metricKey);
  };

  const chartData = sessions.slice(-25).map((s, i) => ({
    session: i + 1,
    duration: Math.round(s.actualDuration / 60 * 10) / 10,
    distressLevel: s.distressLevel,
  }));
  const CustomDot = ({ cx, cy, payload }) => {
    const c = payload.distressLevel === "none" ? "var(--green-dark)"
            : payload.distressLevel === "subtle" ? "var(--orange)" : payload.distressLevel === "active" ? "#d65f3c" : "var(--red)";
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2}/>;
  };

  // Unified timeline (sessions + walks + pattern breaks)
  const timeline = [
    ...sessions.map(s => ({ kind:"session", date:s.date, data:s })),
    ...walks.map(w    => ({ kind:"walk",    date:w.date, data:w })),
    ...patterns.map(p => ({ kind:"pat",     date:p.date, data:p })),
    ...feedings.map(f => ({ kind:"feeding", date:f.date, data:f })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {metricHelp && (
        <div className="metric-help-overlay" role="dialog" aria-modal="true" aria-labelledby="metric-help-title" onClick={() => setMetricHelp(null)}>
          <div className="metric-help-card" onClick={(e) => e.stopPropagation()}>
            <div className="metric-help-title" id="metric-help-title">{metricExplainers[metricHelp]?.title}</div>
            <div className="metric-help-body">{metricExplainers[metricHelp]?.body}</div>
            {metricExplainers[metricHelp]?.detail && (
              <div className="metric-help-detail">{metricExplainers[metricHelp]?.detail}</div>
            )}
            <button className="metric-help-close" onClick={() => setMetricHelp(null)} type="button">Got it</button>
          </div>
        </div>
      )}

      {/* Coach mark — first launch */}
      {showCoach && (
        <div className="coach-overlay" role="dialog" aria-modal="true" aria-labelledby="coach-title">
          <div className="coach-backdrop" onClick={() => { setShowCoach(false); save("pawtimer_coach_seen", true); }}/>
          <div className="coach-tip" style={{ bottom:220 }}>
            <div className="coach-tip-arrow"/>
            <div className="coach-title" id="coach-title">This is {name}'s first session 🐾</div>
            <div className="coach-body prose">Tap <strong>Start Session</strong> when you're ready to step out. We'll track the time and check in on how {name} felt when you come back.</div>
            <button className="coach-btn" onClick={() => { setShowCoach(false); save("pawtimer_coach_seen", true); }}>Got it — let's start</button>
          </div>
        </div>
      )}

      <div className="app">

        {/* Header */}
        <div className="header">
          <div className="header-top">
            <label className="dog-photo-btn" title="Tap to change photo">
              <input type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoUpload}/>
              {dogPhoto
                ? <img src={dogPhoto} className="dog-photo-img" alt={name}/>
                : <div className="dog-photo-placeholder"><PawIcon size={28}/></div>
              }
              <div className="dog-photo-overlay">📷</div>
            </label>
            <div style={{ flex:1 }}>
              <div className="app-title">{name}</div>
              <div className="app-subtitle">Separation anxiety training</div>
            </div>
            {SYNC_ENABLED && (
              <button
                className={`sync-badge sync-state-${syncStatus}`}
                type="button"
                title={syncError || (syncStatus === "ok" ? "Synced" : syncStatus === "syncing" ? "Syncing…" : "Not synced")}
                onClick={() => {
                  if (syncError) window.alert(`Sync error:

${syncError}`);
                }}
              >
                <span className={`sync-dot sync-${syncStatus}`} />
                <span>{syncStatus === "ok" ? "Synced" : syncStatus === "syncing" ? "Syncing" : syncStatus === "err" ? "Sync issue" : "Sync off"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ═══ TRAIN ═══ */}
        {tab === "home" && (<div className="tab-content">

          {/* Welcome-back banner */}
          {showWelcomeBack && (() => {
            const last = sessions[sessions.length - 1];
            const days = Math.floor((Date.now() - new Date(last.date)) / 86400000);
            return (
              <div className="welcome-back">
                <div className="welcome-back-text">
                  Welcome back — last session was <strong>{days} day{days !== 1 ? "s" : ""} ago</strong>. {name}'s target is still {fmt(target)}.
                </div>
                <button className="welcome-back-dismiss" onClick={() => setShowWelcomeBack(false)} aria-label="Dismiss">×</button>
              </div>
            );
          })()}

          <div className="train-main">
            {/* 1. Progress bar with thumb */}
            <div className="prog-section">
              <div className="prog-track">
                <div className="prog-fill" style={{ width:`${goalPct}%` }}/>
                <div className="prog-thumb" style={{ left:`${Math.max(Math.min(goalPct,98),2)}%` }}/>
              </div>
              <div className="prog-meta">
                <span>Current threshold: <strong className="num-stable" style={{color:"var(--brown)"}}>{fmt(target)}</strong></span>
                <span>Goal: <strong className="num-stable" style={{color:"var(--brown)"}}>{fmt(goalSec)}</strong></span>
              </div>
            </div>

            <SessionControl
              phase={phase}
              elapsed={elapsed}
              target={target}
              onStart={startSession}
              onEnd={endSession}
              onCancel={cancelSession}
              completed={sessionCompleted}
            />

            <div className="readiness-hint" role="status" aria-live="polite">
              <span className="readiness-label">Training readiness:</span>
              <span className="readiness-value" style={{ color: trainingReadiness.color }}>{trainingReadiness.level}</span>
            </div>

            {phase === "rating" && (
              <div className="rating-screen session-feedback">
                <div className="rating-title">Was there any stress?</div>
                <div className="rating-sub">
                  {fmt(finalElapsed)} session — how did {name} handle it?
                </div>
                <div className="result-grid">
                  <button className="btn-result btn-none" onClick={() => { setSessionOutcome("none"); recordResult("none"); }}>
                    <Img src="result-calm.png" size={36} alt="No distress"/>
                    <div><div>No distress</div><div className="result-desc">{name} was completely calm</div></div>
                  </button>
                  <button className="btn-result btn-mild" onClick={() => setSessionOutcome("subtle")}>
                    <Img src="result-mild.png" size={36} alt="Subtle stress"/>
                    <div><div>Subtle stress</div><div className="result-desc">Mild/passive signs (restless, lip licking, etc.)</div></div>
                  </button>
                  <button className="btn-result btn-strong" onClick={() => setSessionOutcome("active")}>
                    <Img src="result-strong.png" size={36} alt="Active distress"/>
                    <div><div>Active distress</div><div className="result-desc">Barking, pacing, unable to settle</div></div>
                  </button>
                  <button className="btn-result btn-severe" onClick={() => setSessionOutcome("severe")}>
                    <Img src="result-strong.png" size={36} alt="Severe distress"/>
                    <div><div>Severe distress</div><div className="result-desc">Panic, escape attempt, major breakdown</div></div>
                  </button>
                </div>
                {sessionOutcome && sessionOutcome !== "none" && (
                  <div className="outcome-details">
                    <label className="field-label" htmlFor="latency-input">Latency to first stress (seconds)</label>
                    <input
                      id="latency-input"
                      className="text-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Optional"
                      value={latencyDraft}
                      onChange={(e) => setLatencyDraft(e.target.value)}
                    />
                    <label className="field-label" htmlFor="distress-type">Distress type (optional)</label>
                    <select
                      id="distress-type"
                      className="text-input"
                      value={distressTypeDraft}
                      onChange={(e) => setDistressTypeDraft(e.target.value)}
                    >
                      <option value="">Select distress type</option>
                      {DISTRESS_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <button
                      className="btn-save-outcome"
                      onClick={() => recordResult(sessionOutcome, {
                        latencyToFirstDistress: latencyDraft,
                        distressType: distressTypeDraft || null,
                      })}
                    >
                      Save session
                    </button>
                  </div>
                )}
                <button className="btn-cancel" onClick={() => { setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); }}>
                  Discard this session
                </button>
              </div>
            )}

            {phase !== "running" && (
              <p className="status-msg">
                {!sessions.length
                  ? "First session — starting small and positive."
                  : !lastSess || lastSess.distressLevel === "none"
                    ? (lastSess && (lastSess.actualDuration||0) < (lastSess.plannedDuration||0))
                      ? `Session ended early — holding until ${name} completes the full time.`
                      : `${name} completed the last session — stepping up.`
                    : lastSess.distressLevel === "subtle"
                      ? "Mild signs last time — holding until consistently calm."
                      : "Rolled back after higher distress — steady progress matters most."}
              </p>
            )}
            {/* 4. Stats rings card */}
            {phase === "idle" && (() => {
              const R = 36; const C = 2*Math.PI*R;
              const goalFrac = Math.min(goalPct/100, 1);
              const sessFrac = activeProto.sessionsPerDayMax > 0 ? Math.min(countToday/activeProto.sessionsPerDayMax, 1) : 0;
              return (
                <div className="stats-rings-card">
                  <div className="ring-col">
                    <div className="ring-wrap">
                      <svg className="ring-svg" width={88} height={88} viewBox="0 0 88 88">
                        <circle cx={44} cy={44} r={R} className="ring-bg"/>
                        <circle cx={44} cy={44} r={R} className="ring-fill-1"
                          strokeDasharray={C}
                          strokeDashoffset={C * (1 - goalFrac)}/>
                      </svg>
                      <div className="ring-inner">
                        <div className="ring-val">{fmt(target)}</div>
                      </div>
                    </div>
                    <button className="ring-sub-btn" onClick={() => setOpenTip((prev) => (prev === "recommendations" ? null : "recommendations"))}>Next session</button>
                  </div>
                  <div className="ring-col-sep"/>
                  <div className="ring-col">
                    <div className="ring-wrap">
                      <svg className="ring-svg" width={88} height={88} viewBox="0 0 88 88">
                        <circle cx={44} cy={44} r={R} className="ring-bg"/>
                        <circle cx={44} cy={44} r={R} className="ring-fill-2"
                          strokeDasharray={C}
                          strokeDashoffset={C * (1 - sessFrac)}/>
                      </svg>
                      <div className="ring-inner">
                        <div className="ring-val">{countToday}<span className="t-helper num-stable">/{activeProto.sessionsPerDayMax}</span></div>
                      </div>
                    </div>
                    <button className="ring-sub-btn" onClick={() => setOpenTip((prev) => (prev === "recommendations" ? null : "recommendations"))}>Sessions today</button>
                  </div>
                  {openTip === "recommendations" && (
                    <div className="recommendation-pop" role="tooltip">
                      <p>
                        Recommendation confidence: <strong>{recommendationConfidence.toUpperCase()}</strong> · suggested desensitization dose target {fmt(adjustedTarget)}.
                      </p>
                      <p>
                        Leave frequency profile: ~{normalizedLeaves}/day ({leaveProfile.desc}). Higher leave frequency raises today's pattern-break target and requires more calm-session consistency before bigger recommendations.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}


            {/* Advisory warnings */}
            {countToday >= Math.max(1, activeProto.sessionsPerDayMax - (normalizedLeaves >= 7 ? 1 : 0)) && (
              <p className="status-msg" style={{ color:"var(--amber)" }}>
                ⚠️ {countToday} sessions today — for ~{normalizedLeaves} departures/day, keep it around {Math.max(1, activeProto.sessionsPerDayMax - (normalizedLeaves >= 7 ? 1 : 0))} to avoid overloading real departures.
              </p>
            )}

            {/* 5. Daily alone-time card */}
            {(() => {
              const loggedTodaySess = sessions.filter(s => isToday(s.date) && typeof s.actualDuration === "number");
              const totalLogged = loggedTodaySess.reduce((sum,s) => sum+(s.actualDuration||0),0);
              const calmSec   = loggedTodaySess.filter(s=>s.distressLevel==="none").reduce((sum,s)=>sum+(s.actualDuration||0),0);
              const subtleSec = loggedTodaySess.filter(s=>s.distressLevel==="subtle").reduce((sum,s)=>sum+(s.actualDuration||0),0);
              const activeSec = loggedTodaySess.filter(s=>s.distressLevel==="active").reduce((sum,s)=>sum+(s.actualDuration||0),0);
              const severeSec = loggedTodaySess.filter(s=>s.distressLevel==="severe").reduce((sum,s)=>sum+(s.actualDuration||0),0);
              const calmPct   = totalLogged ? (calmSec/totalLogged)*100 : 0;
              const subtlePct = totalLogged ? (subtleSec/totalLogged)*100 : 0;
              const activePct = totalLogged ? (activeSec/totalLogged)*100 : 0;
              const severePct = totalLogged ? (severeSec/totalLogged)*100 : 0;
              return (
                <div className="alone-card">
                  <div className="alone-left">
                    <div className="alone-label">Today's alone time</div>
                    <div className="alone-total">{totalLogged === 0 ? "0 mins" : fmt(totalLogged)}</div>
                  </div>
                  <div className="alone-right">
                    <div className="alone-track">
                      {totalLogged > 0 ? (<>
                        <div className="alone-fill ok"   style={{width:`${calmPct}%`}}/>
                        <div className="alone-fill near" style={{width:`${subtlePct}%`}}/>
                        <div className="alone-fill active" style={{width:`${activePct}%`}}/>
                        <div className="alone-fill full" style={{width:`${severePct}%`}}/>
                      </>) : <div style={{width:"100%",height:"100%",background:"var(--border)",borderRadius:99}}/>}
                    </div>
                    {totalLogged > 0 && (
                      <div className="alone-legend">
                        {calmSec>0   && <span className="t-helper" style={{color:"var(--green-dark)"}}>{fmt(calmSec)} calm</span>}
                        {subtleSec>0 && <span className="t-helper" style={{color:"var(--orange)"}}>{fmt(subtleSec)} subtle</span>}
                        {activeSec>0 && <span className="t-helper" style={{color:"#d65f3c"}}>{fmt(activeSec)} active</span>}
                        {severeSec>0 && <span className="t-helper" style={{color:"var(--red)"}}>{fmt(severeSec)} severe</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 6. Other tools — grouped card */}
            <div className="tool-section-title">Helpful tools</div>
            <div className="tool-group-card">

              {/* Log a walk */}
              <div className="tool-row" onClick={walkPhase === "idle" ? startWalk : undefined}
                style={{borderRadius: walkPhase === "timing" ? "var(--radius-sm) var(--radius-sm) 0 0" : undefined}}>
                <div className="tool-row-left">
                  <Img src="walk.png" size={24} alt="Walk"/>
                  <span className="tool-row-label">Log a walk</span>
                </div>
                <div className="tool-row-right">
                  {walkPhase === "timing"
                    ? <span className="t-helper num-stable" style={{color:"var(--green-dark)",fontWeight:600}}>{fmt(walkElapsed)} ●</span>
                    : <span className="tool-row-meta">Today: {todayWalks}</span>
                  }
                  <span className="tool-chevron">›</span>
                </div>
              </div>
              {walkPhase === "timing" && (
                <div className="walk-timer-banner">
                  <div className="walk-timer-left">
                    <div className="walk-timer-elapsed">{fmt(walkElapsed)}</div>
                    <div className="walk-timer-lbl">Walk in progress…</div>
                  </div>
                  <div className="walk-timer-btns">
                    <button className="walk-cancel-btn" onClick={cancelWalk}>Cancel</button>
                    <button className="walk-end-btn" onClick={endWalk}>End Walk</button>
                  </div>
                </div>
              )}

              {walkPhase === "classify" && (
                <div className="walk-type-panel">
                  <div className="walk-type-title">Classify this walk</div>
                  <div className="walk-type-sub">{fmt(walkPendingDuration)} · select a walk type to save.</div>
                  <div className="walk-type-grid">
                    {WALK_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className="walk-type-option"
                        onClick={() => saveWalkWithType(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="walk-type-actions">
                    <button className="walk-cancel-btn" type="button" onClick={cancelWalk}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Pattern breaking */}
              <div className="tool-row" onClick={() => setPatOpen(o=>!o)}>
                <div className="tool-row-left">
                  <Img src="pattern-keys.png" size={24} alt="Pattern"/>
                  <span className="tool-row-label">
                    Pattern breaking
                    {behind && <span className="tool-badge-warn">!</span>}
                  </span>
                </div>
                <div className="tool-row-right">
                  <span className="tool-row-meta">Today: {todayPat}</span>
                  <span className="tool-chevron">{patOpen ? "∨" : "›"}</span>
                </div>
              </div>
              {patOpen && (
                <div className="tool-expand">
                  <div className={`pat-reminder ${behind ? "warn" : ""}`} style={{marginBottom:10}}>
                    {patReminderText}
                  </div>
                  <div className="pat-btns">
                    {PATTERN_TYPES.map(pt => (
                      <button key={pt.type} className="btn-pat" onClick={e=>{e.stopPropagation();logPattern(pt.type);}}>
                        <Img src={pt.icon} size={28} alt={pt.label}/>
                        <div className="p-text">
                          <div className="p-label">{patLabels[pt.type] || pt.label}</div>
                          <div className="p-desc">{pt.desc}</div>
                        </div>
                        <span className="p-count">Today: {patterns.filter(p=>isToday(p.date)&&p.type===pt.type).length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="tool-row" onClick={openFeedingForm}>
                <div className="tool-row-left">
                  <span aria-hidden="true">🍽️</span>
                  <span className="tool-row-label">Add Feeding</span>
                </div>
                <div className="tool-row-right">
                  <span className="tool-row-meta">Today: {feedings.filter((f) => isToday(f.date)).length}</span>
                  <span className="tool-chevron">›</span>
                </div>
              </div>

            </div>

            {feedingOpen && (
              <div className="feeding-overlay" role="dialog" aria-modal="true" aria-labelledby="feeding-title" onClick={cancelFeedingForm}>
                <div className="feeding-card" onClick={(e) => e.stopPropagation()}>
                  <div className="section-title" id="feeding-title">Log feeding</div>
                  <label className="feeding-field">
                    <span className="t-helper">Feeding time</span>
                    <input
                      type="datetime-local"
                      value={feedingDraft.time}
                      onChange={(e) => setFeedingDraft((prev) => ({ ...prev, time: e.target.value }))}
                    />
                  </label>
                  <label className="feeding-field">
                    <span className="t-helper">Food type</span>
                    <select
                      value={feedingDraft.foodType}
                      onChange={(e) => setFeedingDraft((prev) => ({ ...prev, foodType: e.target.value }))}
                    >
                      <option value="meal">meal</option>
                      <option value="treat">treat</option>
                      <option value="kong">kong</option>
                      <option value="lick mat">lick mat</option>
                      <option value="chew">chew</option>
                    </select>
                  </label>
                  <label className="feeding-field">
                    <span className="t-helper">Amount</span>
                    <select
                      value={feedingDraft.amount}
                      onChange={(e) => setFeedingDraft((prev) => ({ ...prev, amount: e.target.value }))}
                    >
                      <option value="small">small</option>
                      <option value="medium">medium</option>
                      <option value="large">large</option>
                    </select>
                  </label>
                  <div className="feeding-actions">
                    <button className="walk-cancel-btn" type="button" onClick={cancelFeedingForm}>Cancel</button>
                    <button className="walk-end-btn" type="button" onClick={saveFeeding}>Save</button>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>)}

        {/* ═══ HISTORY ═══ */}
        {tab === "history" && (<div className="tab-content">
          <div className="section">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:18 }}>
              <div className="page-title">Activity Log</div>
              {sessions.length > 0 && (
                <button className="clear-btn" onClick={() => {
                  if (window.confirm("Clear all training sessions?")) {
                    setSessions([]);
                    setTarget(suggestNext([], dog));
                    syncDeleteSessionsForDog(activeDogId).then((ok) => {
                      if (ok === null) showToast("⚠️ Sessions cleared locally — remote delete failed");
                      else showToast("Sessions cleared");
                    });
                  }
                }}>Clear sessions</button>
              )}
            </div>

            {timeline.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon">🐾</div>
                <div className="es-title">No activity yet</div>
                <div className="es-body">Start {name}'s first session and your training history will appear here.</div>
                <button className="es-cta" onClick={() => setTab("home")}>Go to Train →</button>
              </div>
            ) : timeline.map(item => {
              if (item.kind === "session") {
                const s = item.data;
                const lv = normalizeDistressLevel(s.distressLevel ?? (s.result === "success" ? "none" : "strong"));
                const icon = lv === "none" ? "result-calm.png" : lv === "subtle" ? "result-mild.png" : lv === "active" ? "result-strong.png" : "result-strong.png";
                const detailBadges = sessionDetailBadges(s);
                return (
                  <div className="h-item" key={`s-${s.id}`}>
                    <div className={`h-dot dot-${lv}`}><Img src={icon} size={22}/></div>
                    <div className="h-info">
                      <div className="h-main">{fmt(s.actualDuration)} <span className="t-helper">of {fmt(s.plannedDuration)}</span></div>
                      <div className="h-date">{fmtDate(s.date)}</div>
                      {detailBadges.length > 0 && (
                        <div className="h-extra-badges">
                          {detailBadges.slice(0, 4).map((badge, idx) => (
                            <span key={`${s.id}-badge-${idx}`} className="h-badge-mini">{badge}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`h-badge badge-${lv}`}>{distressLabel(lv)}</span>
                    <button className="h-del" onClick={() => { setSessions(prev => prev.filter(x => x.id !== s.id)); syncDelete("session", s.id); }} title="Delete">✕</button>
                  </div>
                );
              }
              if (item.kind === "walk") {
                const w = item.data;
                return (
                  <div className="h-item" key={`w-${w.id}`}>
                    <div className="h-dot dot-walk"><Img src="walk.png" size={22}/></div>
                    <div className="h-info">
                      <div className="h-main">{walkTypeLabel(w.type)} with {name}{w.duration ? ` · ${fmt(w.duration)}` : ""}</div>
                      <div className="h-date">{fmtDate(w.date)}</div>
                    </div>
                    <span className="h-badge badge-walk">{walkTypeLabel(w.type)}</span>
                    <div className="h-actions">
                      <button className="h-edit" onClick={() => editWalkDuration(w.id)} title="Edit duration">✎</button>
                      <button className="h-del" onClick={() => { setWalks(prev => prev.filter(x => x.id !== w.id)); syncDelete("walk", w.id); }} title="Delete">✕</button>
                    </div>
                  </div>
                );
              }
              if (item.kind === "pat") {
                const p  = item.data;
                const pt = PATTERN_TYPES.find(x => x.type === p.type) ?? PATTERN_TYPES[0];
                return (
                  <div className="h-item" key={`p-${p.id}`}>
                    <div className="h-dot dot-pat"><Img src={pt.icon} size={22}/></div>
                    <div className="h-info">
                      <div className="h-main">{patLabels[pt.type] || pt.label}</div>
                      <div className="h-date">{fmtDate(p.date)}</div>
                    </div>
                    <span className="h-badge badge-pat">Pattern break</span>
                    <button className="h-del" onClick={() => { setPatterns(prev => prev.filter(x => x.id !== p.id)); syncDelete("pattern", p.id); }} title="Delete">✕</button>
                  </div>
                );
              }
              if (item.kind === "feeding") {
                const f = item.data;
                return (
                  <div className="h-item" key={`f-${f.id}`}>
                    <div className="h-dot dot-feed">🍽️</div>
                    <div className="h-info">
                      <div className="h-main" style={{ textTransform: "capitalize" }}>{f.foodType} · {f.amount}</div>
                      <div className="h-date">{fmtDate(f.date)}</div>
                    </div>
                    <span className="h-badge badge-feed">Feeding</span>
                    <button className="h-del" onClick={() => { setFeedings(prev => prev.filter(x => x.id !== f.id)); syncDelete("feeding", f.id); }} title="Delete">✕</button>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>)}

        {/* ═══ STATS ═══ */}
        {tab === "progress" && (<div className="tab-content">
          <div className="section">
            <div className="page-title">{name}'s Progress</div>
            {totalCount === 0 ? (
              <div className="empty-state">
                <div className="es-icon">🌱</div>
                <div className="es-title">Progress starts here</div>
                <div className="es-body">Complete your first session and {name}'s stats, streak, and progress chart will appear here.</div>
                <button className="es-cta" onClick={() => setTab("home")}>Start first session →</button>
              </div>
            ) : (<>

            <div className="streak-card">
              <div className="streak-num">{streak}</div>
              <div className="streak-lbl">
                <span className="streak-fire">🔥</span>
                <span>Calm session streak</span>
              </div>
            </div>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-val" style={{color:"var(--green-dark)"}}>{noneCount}</div>
                <div className="stat-lbl">Calm sessions</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{Math.round((noneCount/totalCount)*100)}<span className="t-helper">%</span></div>
                <div className="stat-lbl">Success rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(bestCalm)}</div>
                <div className="stat-lbl">Best calm time</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(target)}</div>
                <div className="stat-lbl">Next target</div>
              </div>
              <div className="stat-wide">
                <div><div className="stat-val">{fmt(totalAlone)}</div><div className="stat-lbl">Total time alone</div></div>
                <div className="stat-icon"><PawIcon size={32}/></div>
              </div>
              <div className="stat-wide">
                <div><div className="stat-val">{walks.length}</div><div className="stat-lbl">Walks together</div></div>
                <div className="stat-icon"><Img src="walk.png" size={36} alt="walks"/></div>
              </div>
              <div className="stat-wide">
                <div><div className="stat-val">{patterns.length}</div><div className="stat-lbl">Pattern breaks</div></div>
                <div className="stat-icon"><Img src="pattern-keys.png" size={36} alt="pattern breaks"/></div>
              </div>
            </div>
            <p className="t-helper train-coverage" style={{ marginTop: 0, marginBottom: 14 }}>
              Data coverage for smarter recommendations: {recommendationCoveragePct}% ({recommendationCoverageCount}/{totalCount})
            </p>
            <div className="goal-card" style={{margin:"0 0 14px"}}>
              <div className="goal-label">
                <span className="goal-title">Progress toward goal</span>
                <span className="goal-pct">{Math.round(goalPct)}%</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{width:`${goalPct}%`}}/></div>
              <div className="goal-meta">
                <span>Current threshold: {fmt(target)}</span>
                <span>Goal: {fmt(goalSec)}</span>
              </div>
            </div>
            {totalCount > 0 && (
              <div className="ratio-card">
                <div className="ratio-title">Outcome breakdown — {totalCount} sessions</div>
                <div className="ratio-bar">
                  <div className="ratio-good" style={{width:`${(noneCount/totalCount)*100}%`}}/>
                  <div className="ratio-mild" style={{width:`${(subtleCount/totalCount)*100}%`}}/>
                  <div className="ratio-active" style={{width:`${(activeCount/totalCount)*100}%`}}/>
                  <div className="ratio-bad"  style={{width:`${(severeCount/totalCount)*100}%`}}/>
                </div>
                <div className="ratio-legend">
                  <span><div className="dot12" style={{background:"var(--green-dark)"}}/>{noneCount} calm</span>
                  <span><div className="dot12" style={{background:"var(--orange)"}}/>{subtleCount} subtle</span>
                  <span><div className="dot12" style={{background:"#d65f3c"}}/>{activeCount} active</span>
                  <span><div className="dot12" style={{background:"var(--red)"}}/>{severeCount} severe</span>
                </div>
              </div>
            )}
            {totalCount > 0 && (
              <div className="insights-grid">
                <button className="stat-card metric-btn" onClick={() => openMetricHelp("stability")} type="button">
                  <div className="stat-val" style={{ color: stabilityTone.color }}>
                    {calmMedian != null ? fmt(calmMedian) : "—"}
                  </div>
                  <div className="stat-lbl">Stability</div>
                </button>
                <button className="stat-card metric-btn" onClick={() => openMetricHelp("momentum")} type="button">
                  <div className="stat-val" style={{ color: momentumTone.color }}>
                    {calmRate7 != null ? `${calmRate7}%` : "—"}
                  </div>
                  <div className="stat-lbl">Momentum</div>
                </button>
                <button className="stat-card metric-btn" onClick={() => openMetricHelp("adherence")} type="button">
                  <div className="stat-val" style={{ color: adherenceTone.color }}>
                    {adherenceByDay != null ? `${adherenceByDay}%` : "—"}
                  </div>
                  <div className="stat-lbl">Adherence</div>
                </button>
                <button className="stat-card metric-btn" onClick={() => openMetricHelp("relapseRisk")} type="button">
                  <div className="stat-val" style={{ color: relapseTone.color }}>
                    {relapseRisk ? "High" : "Low"}
                  </div>
                  <div className="stat-lbl">Relapse risk</div>
                </button>
              </div>
            )}
            {chartData.length > 1 ? (
              <div className="chart-wrap">
                <div className="chart-title">Session duration over time (min)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{top:5,right:24,left:-14,bottom:5}}>
                    <CartesianGrid stroke="var(--surf-soft)" vertical={false}/>
                    <XAxis dataKey="session" tick={CHART_TYPOGRAPHY.axisTick} tickLine={false} axisLine={false}/>
                    <YAxis tick={CHART_TYPOGRAPHY.axisTick} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={CHART_TYPOGRAPHY.tooltipContent} labelStyle={CHART_TYPOGRAPHY.tooltipLabel} formatter={(v,n,p)=>[`${v}m — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
                    <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={CHART_TYPOGRAPHY.goalLineLabel}/>
                    <Line type="monotone" dataKey="duration" stroke="var(--brown)" strokeWidth={2.5} dot={<CustomDot/>} activeDot={{r:6}}/>
                  </LineChart>
                </ResponsiveContainer>
                <div className="t-helper" style={{display:"flex",gap:14,justifyContent:"center",marginTop:10,flexWrap:"wrap"}}>
                  <span><span style={{color:"var(--green-dark)"}}>●</span> Calm</span>
                  <span><span style={{color:"var(--orange)"}}>●</span> Mild</span>
                  <span><span style={{color:"var(--red)"}}>●</span> Strong</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="es-icon">📈</div>
                <div className="es-title">Almost there</div>
                <div className="es-body">Complete 2 more sessions to see {name}'s progress chart and trends.</div>
                <button className="es-cta" onClick={() => setTab("home")}>Start training →</button>
              </div>
            )}
            </>)}
          </div>
        </div>)}

        {/* ═══ SETTINGS ═══ */}
        {tab === "tips" && (<div className="tab-content">
          <div className="section">
            <div className="page-title">Settings</div>

            <div className="settings-section-label">Dog profile</div>

            {/* Dog ID */}
            <div className="share-card">
              <div className="share-title" style={{ display:"flex", alignItems:"center", gap:8 }}><PawIcon size={20}/> {name}'s Dog ID</div>
              <div className="share-sub">Share this ID with your partner so both phones log to the same dog.</div>
              <div className="share-id-row">
                <div className="share-id-val" aria-label="Dog ID">{activeDogId}</div>
                <button className="copy-btn" onClick={copyDogId} aria-label="Copy dog ID">Copy</button>
              </div>
              <ol className="share-steps">
                <li>Copy the ID and send it to your partner</li>
                <li>On their phone: open PawTimer → "Join with a dog ID"</li>
                <li>Enter the ID — they're in immediately, no extra setup</li>
              </ol>
            </div>

            <div className="settings-section-label">Training protocol</div>
            <div className="share-card">
              <div className="share-title">How to run a session</div>
              <div className="proto-section" style={{ marginTop:0 }}>
                <div className="proto-row prose">1. Tap Start and leave calmly, without a big goodbye.</div>
                <div className="proto-row prose">2. Come back whenever you need to and tap End Session.</div>
                <div className="proto-row prose">3. Rate how {name} did, and we'll set a gentle next target.</div>
              </div>
              <div className="proto-title" style={{ marginTop:8 }}>Progress rules</div>
              <div className="proto-row prose">✅ <strong>Calm (completed):</strong> Add +15% next session (below 40 min), then +5 min.</div>
              <div className="proto-row prose">⚠️ <strong>Subtle stress:</strong> Hold the same duration next time.</div>
              <div className="proto-row prose">❌ <strong>Active/Severe distress:</strong> Roll back by 1–2 sessions.</div>
              <div className="proto-title" style={{ marginTop:10 }}>Daily rhythm</div>
              <div className="proto-row prose">📅 Up to {activeProto.sessionsPerDayMax} sessions · up to {activeProto.maxDailyAloneMinutes} min alone/day.</div>
              <div className="proto-row prose">🔁 Pattern breaks: {recMin}–{recMax}/day for ~{normalizedLeaves} departures/day · at least walks + {walkBuffer} buffer.</div>
              <div className="proto-row prose">😴 Rest days: {activeProto.restDaysPerWeekRecommended}/week is recommended.</div>
            </div>

            <div className="settings-section-label">Notifications</div>
            <div className="share-card">
              <div className="share-title">Daily training reminder</div>
              <div className="share-sub">Set a gentle daily prompt so sessions stay consistent.</div>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap"}}>
                {notifEnabled ? (
                  <input type="time" value={notifTime}
                    onChange={e=>{ setNotifTime(e.target.value); scheduleNotif(e.target.value, dogs.find((d) => canonicalDogId(d.id) === canonicalDogId(activeDogId))?.dogName??"your dog"); }}
                    className="notif-time-input"/>
                ) : <span className="t-helper">Turn reminders on to choose a time.</span>}
                <button className={`notif-toggle ${notifEnabled?"on":""}`} onClick={handleToggleNotif}>
                  {notifEnabled ? "On" : "Off"}
                </button>
              </div>
            </div>

            <div className="settings-section-label">App preferences</div>
            <div className="share-card">
              <div className="diag-head">
                <div className="share-title" style={{ marginBottom:0 }}>Sync diagnostics</div>
                <button className="diag-run-btn" type="button" disabled={syncDiagRunning} onClick={runSyncDiagnostics}>
                  {syncDiagRunning ? "Running…" : "Run connection test"}
                </button>
              </div>
              <div className="share-sub" style={{ marginBottom:10 }}>
                Use this if sync turns red. It checks env setup, read access, and write/delete permissions.
              </div>
              <div className="diag-grid">
                <div>Sync enabled: <strong>{SYNC_ENABLED ? "Yes" : "No"}</strong></div>
                <div>VITE_SUPABASE_URL: <strong>{SB_URL ? "Set" : "Missing"}</strong></div>
                <div>VITE_SUPABASE_ANON_KEY: <strong>{SB_KEY ? "Set" : "Missing"}</strong></div>
                <div>Supabase base URL: <code>{SB_BASE_URL || "(missing)"}</code></div>
              </div>
              {syncDiagResult && (
                <>
                  <div className={`diag-summary ${syncDiagResult.checks?.summary?.ok ? "ok" : "err"}`}>
                    {syncDiagResult.checks?.summary?.ok ? "✓ All checks passed" : "✕ Some checks failed"}
                  </div>
                  <pre className="diag-json">{JSON.stringify(syncDiagResult, null, 2)}</pre>
                </>
              )}
            </div>

            {/* Pattern label customisation */}
            <div className="settings-section-label">Customisation</div>
            <div className="share-card">
              <div className="share-title">Customise Pattern Names</div>
              <div className="share-sub">Rename each pattern to match your own routine.</div>
              {PATTERN_TYPES.map(pt => (
                <div key={pt.type} className="pat-edit-row">
                  <Img src={pt.icon} size={28} alt={pt.label}/>
                  {editingPat === pt.type ? (
                    <input className="pat-edit-input" autoFocus
                      aria-label={`Rename ${pt.label}`}
                      defaultValue={patLabels[pt.type] || pt.label}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val) setPatLabels(prev => ({ ...prev, [pt.type]: val }));
                        setEditingPat(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditingPat(null);
                      }}/>
                  ) : (
                    <span className="pat-edit-label">{patLabels[pt.type] || pt.label}</span>
                  )}
                  <button className="pat-edit-btn" onClick={() => setEditingPat(pt.type)} aria-label={`Edit ${pt.label} name`}>✎</button>
                  {patLabels[pt.type] && (
                    <button className="pat-edit-reset" onClick={() => setPatLabels(prev => { const n={...prev}; delete n[pt.type]; return n; })} aria-label="Reset to default">↩</button>
                  )}
                </div>
              ))}
            </div>
            <div className="share-card">
              <div className="share-title">Training Protocol</div>
              <div className="t-helper protocol-summary">
                <div><strong style={{ color:"var(--brown)" }}>Sessions:</strong> max {activeProto.sessionsPerDayMax}/day · max {activeProto.maxDailyAloneMinutes} min alone/day</div>
                <div><strong style={{ color:"var(--brown)" }}>Step up:</strong> +{activeProto.incrementPercentDefault}% after each calm session, then +5 min fixed</div>
                <div><strong style={{ color:"var(--brown)" }}>Pattern breaks:</strong> {recMin}–{recMax}/day recommended for ~{normalizedLeaves} leaves/day</div>
              </div>

              {!protoWarnAck ? (
                <div className="proto-warn-banner">
                  <div className="proto-warn-title">⚠️ Modifying this is strongly not recommended</div>
                  <div className="proto-warn-body">
                    These values are based on clinical separation anxiety protocols. Changing them may slow your dog's progress or cause regression. Only proceed if advised by a certified trainer.
                  </div>
                  <button onClick={() => setProtoWarnAck(true)}
                    className="t-btn proto-edit-btn">
                    I understand — let me edit
                  </button>
                </div>
              ) : (
                <div>
                  <div className="proto-advanced-note">⚠️ Advanced — edit with caution</div>
                  {[
                    { key:"sessionsPerDayMax", label:"Max sessions/day", unit:"" },
                    { key:"maxDailyAloneMinutes", label:"Max alone time/day", unit:"min" },
                    { key:"incrementPercentDefault", label:"Step-up increment", unit:"%" },
                    { key:"desensitizationBlocksPerDayRecommendedMin", label:"Pattern breaks min/day", unit:"" },
                    { key:"desensitizationBlocksPerDayRecommendedMax", label:"Pattern breaks max/day", unit:"" },
                  ].map(({ key, label, unit }) => (
                    <div key={key} className="proto-field-row">
                      <span className="proto-field-label">{label}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" className="proto-field-input"
                          aria-label={label}
                          value={protoOverride[key] ?? PROTOCOL[key]}
                          onChange={e => {
                            const v = Number(e.target.value);
                            if (!isNaN(v) && v > 0) setProtoOverride(prev => ({ ...prev, [key]: v }));
                          }}/>
                        {unit && <span className="t-helper">{unit}</span>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => { setProtoOverride({}); setProtoWarnAck(false); }}
                    className="t-helper plain-btn-link">
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>

            <div className="settings-section-label">Account</div>
            <button className="settings-btn" onClick={() => {
              if (window.confirm(`Re-run setup for ${name}? All sessions are kept.`)) {
                setDogs(prev => prev.filter(d => d.id !== activeDogId));
                setScreen("onboard");
              }
            }}>✎ Edit {name}'s settings</button>

            <button className="settings-btn" onClick={() => setScreen("select")} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <PawIcon size={18} aria-hidden="true"/> Switch to another dog
            </button>

            <div className="settings-danger-sep"/>
            <div className="settings-section-label" style={{color:"var(--red)"}}>Danger zone</div>
            <button className="settings-btn danger" onClick={() => {
              if (window.confirm(`Remove ${name} from this device? Sessions stored elsewhere are unaffected.`)) {
                const newDogs = dogs.filter(d => d.id !== activeDogId);
                setDogs(newDogs);
                save(ACTIVE_DOG_KEY, null);
                setActiveDogId(null);
              }
            }}>✕ Remove {name} from this device</button>
          </div>
        </div>)}

      </div>

      {/* Tab bar */}
      <div className="tabs">
        {[
          { id:"home",     label:"Train",    icon:<HomeIcon/> },
          { id:"history",  label:"History",  icon:<HistoryIcon/> },
          { id:"progress", label:"Stats",    icon:<ChartIcon/> },
          { id:"tips",     label:"Settings", icon:<SettingsIcon/> },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>
    </>
  );
}
