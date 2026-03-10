import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const DOGS_KEY       = "pawtimer_dogs_v3";
const ACTIVE_DOG_KEY = "pawtimer_active_dog_v3";
const sessKey = (id) => `pawtimer_sess_v3_${id}`;
const walkKey = (id) => `pawtimer_walk_v3_${id}`;
const patKey  = (id) => `pawtimer_pat_v3_${id}`;

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
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
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL LOGIC — mirrors protocolConfig exactly
// ═══════════════════════════════════════════════════════════════════════════════
const PROTOCOL = {
  sessionsPerDayDefault:                    1,
  sessionsPerDayMax:                        2,
  trainingDaysPerWeekDefault:               5,
  restDaysPerWeekMin:                       1,
  restDaysPerWeekRecommended:               2,
  startDurationSeconds:                     30,
  incrementPercentMin:                      10,
  incrementPercentMax:                      20,
  incrementPercentDefault:                  15,
  microstepCeilingMinutes:                  40,
  maxDailyAloneMinutes:                     30,
  desensitizationBlocksPerDayRecommendedMin: 3,
  desensitizationBlocksPerDayRecommendedMax: 5,
  desensitizationBlocksPerDayMax:           12,
  cuesPerBlockMin:                          2,
  cuesPerBlockMax:                          5,
  minPauseBetweenBlocksMinutes:             30,
};

/** Next duration after a SUCCESSFUL session. */
function getNextDurationSeconds(lastSuccessfulDurationSec) {
  if (!lastSuccessfulDurationSec || lastSuccessfulDurationSec <= 0)
    return PROTOCOL.startDurationSeconds;
  const lastMin = lastSuccessfulDurationSec / 60;
  if (lastMin <= PROTOCOL.microstepCeilingMinutes) {
    const next = Math.round(lastSuccessfulDurationSec * (1 + PROTOCOL.incrementPercentDefault / 100));
    return next;
  }
  // Above 40-min ceiling → fixed +5-min steps
  return Math.round((lastMin + 5) * 60);
}

/**
 * Given the full sessions array and the dog profile, return the next planned
 * duration in seconds.
 *
 * Rules (from protocol):
 *   • No history       → startDurationSeconds (or 80% of currentMaxCalm if set)
 *   • Last = "none"    → +incrementPercentDefault% (up to 40 min ceiling, then +5 min)
 *   • Last = "mild"    → hold (same plannedDuration)
 *   • Last = "strong"  → roll back to 1–2 successful sessions ago
 */
function suggestNext(sessions, dog) {
  const goalSec = dog?.goalSeconds ?? 7200;
  if (!sessions.length) {
    const start = dog?.currentMaxCalm
      ? Math.round(dog.currentMaxCalm * 0.8)
      : PROTOCOL.startDurationSeconds;
    return Math.max(start, PROTOCOL.startDurationSeconds);
  }

  const last = sessions[sessions.length - 1];
  const successful = sessions.filter(s => s.distressLevel === "none");

  if (last.distressLevel === "none") {
    const next = getNextDurationSeconds(last.plannedDuration);
    return Math.min(next, goalSec);
  }

  if (last.distressLevel === "mild") {
    return last.plannedDuration; // hold
  }

  // strong distress → rollback 1–2 successful steps
  if (!successful.length) return PROTOCOL.startDurationSeconds;
  const rollbackIdx = Math.max(successful.length - 2, 0);
  return Math.max(successful[rollbackIdx].plannedDuration, PROTOCOL.startDurationSeconds);
}

/**
 * Returns daily session allowance info.
 * Protocol: max 2 sessions/day AND max 30 min total alone time/day.
 */
function dailyInfo(sessions) {
  const capSec = PROTOCOL.maxDailyAloneMinutes * 60;
  const today  = sessions.filter(s => isToday(s.date));
  const usedSec = today.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const count   = today.length;
  const canAdd  = count < PROTOCOL.sessionsPerDayMax && usedSec < capSec;
  return { count, usedSec, capSec, canAdd, maxCount: PROTOCOL.sessionsPerDayMax };
}

/**
 * Returns pattern-break (desensitization) status for today.
 * Rule: ≥ number of complete departure rituals (walks) today,
 *       AND at least desensitizationBlocksPerDayRecommendedMin per day.
 */
function patternInfo(patterns, walks) {
  const todayPat   = patterns.filter(p => isToday(p.date)).length;
  const todayWalks = walks.filter(w => isToday(w.date)).length;
  const recMin = PROTOCOL.desensitizationBlocksPerDayRecommendedMin;
  const recMax = PROTOCOL.desensitizationBlocksPerDayRecommendedMax;
  // must be ≥ walks AND ≥ recMin
  const needed = Math.max(recMin, todayWalks);
  const behind = todayPat < needed;
  return { todayPat, todayWalks, recMin, recMax, needed, behind };
}

const distressLabel = (l) =>
  l === "none" ? "No distress" : l === "mild" ? "Mild distress" : l === "strong" ? "Strong distress" : "—";

// ─── Pattern-break cue types ──────────────────────────────────────────────────
const PATTERN_TYPES = [
  {
    type:  "keys",
    emoji: "🔑",
    label: "Took keys — stayed home",
    desc:  "Pick up your keys, then put them down without going out",
  },
  {
    type:  "shoes",
    emoji: "👟",
    label: "Put on shoes — stayed home",
    desc:  "Put shoes on, then take them off without going out",
  },
  {
    type:  "jacket",
    emoji: "🧥",
    label: "Put on jacket — stayed home",
    desc:  "Put jacket on, then take it off without going out",
  },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,400&family=DM+Sans:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:          #F7F2E7;
    --surf:        #FFFFFF;
    --surf-soft:   #EDF5EF;
    --border:      #C6DDD0;
    --green:       #A8D5BA;
    --green-light: #CBE9D7;
    --green-dark:  #3d8c60;
    --brown:       #4B3C30;
    --brown-mid:   #7a6a5a;
    --brown-muted: #a09080;
    --amber:       #d4813a;
    --amber-light: #f0a865;
    --red:         #c0392b;
    --orange:      #e67e22;
    --text:        #4B3C30;
    --text-muted:  #8a7a6a;
    --shadow:    0 4px 24px rgba(75,60,48,0.09);
    --shadow-lg: 0 8px 40px rgba(75,60,48,0.14);
    --radius:    20px;
    --radius-sm: 12px;
  }

  html { overflow-x: hidden; width: 100%; max-width: 100vw; }
  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-weight: 300;
    min-height: 100vh; min-height: 100dvh;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior-y: none;
    overflow-x: hidden;
  }

  .app {
    max-width: 480px; margin: 0 auto;
    min-height: 100vh; display: flex; flex-direction: column;
    padding-bottom: 100px; overflow-x: hidden;
  }

  /* ── Dog Select ── */
  .dog-select { max-width:480px; margin:0 auto; min-height:100vh; display:flex; flex-direction:column; background:var(--bg); overflow-x:hidden; }
  .ds-hero { background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 60%); padding:60px 28px 32px; position:relative; overflow:hidden; text-align:center; }
  .ds-hero::before { content:''; position:absolute; top:-60px; right:-60px; width:240px; height:240px; background:radial-gradient(circle,rgba(168,213,186,0.35) 0%,transparent 70%); border-radius:50%; }
  .ds-logo { margin-bottom:14px; position:relative; z-index:1; display:flex; justify-content:center; }
  .ds-title { font-family:'Fraunces',serif; font-size:34px; font-weight:600; color:var(--brown); position:relative; z-index:1; }
  .ds-sub { font-size:14px; color:var(--text-muted); margin-top:6px; position:relative; z-index:1; line-height:1.5; }
  .ds-body { padding:28px; flex:1; overflow-x:hidden; }
  .ds-section-label { font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); font-weight:500; margin-bottom:10px; }
  .ds-dog-card { display:flex; align-items:center; gap:14px; background:var(--surf); border-radius:var(--radius-sm); padding:14px 16px; margin-bottom:10px; box-shadow:var(--shadow); cursor:pointer; border:2px solid transparent; transition:border-color 0.2s,transform 0.15s; }
  .ds-dog-card:hover { border-color:var(--green-dark); transform:translateY(-1px); }
  .ds-dog-name { font-family:'Fraunces',serif; font-size:18px; color:var(--brown); font-weight:600; }
  .ds-dog-id { font-size:11px; color:var(--text-muted); font-family:monospace; letter-spacing:0.06em; margin-top:2px; }
  .ds-dog-arrow { margin-left:auto; color:var(--border); font-size:20px; }
  .ds-divider { display:flex; align-items:center; gap:12px; margin:20px 0; }
  .ds-divider-line { flex:1; height:1px; background:var(--border); }
  .ds-divider-text { font-size:12px; color:var(--text-muted); }
  .ds-btn { width:100%; padding:17px; border:none; border-radius:var(--radius); font-family:'DM Sans',sans-serif; font-size:16px; font-weight:500; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; margin-bottom:12px; display:flex; align-items:center; justify-content:center; gap:10px; }
  .ds-btn-primary { background:var(--brown); color:white; box-shadow:0 4px 20px rgba(75,60,48,0.25); }
  .ds-btn-primary:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(75,60,48,0.30); }
  .ds-note { font-size:11px; color:var(--green-dark); background:rgba(168,213,186,0.2); border-left:3px solid var(--green); border-radius:0 var(--radius-sm) var(--radius-sm) 0; padding:8px 12px; margin-bottom:12px; line-height:1.5; }
  .ds-join-row { display:flex; gap:10px; margin-top:4px; }
  .ds-join-input { flex:1; padding:14px 16px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:16px; color:var(--brown); outline:none; transition:border-color 0.2s; font-weight:500; text-transform:uppercase; letter-spacing:0.06em; }
  .ds-join-input:focus { border-color:var(--green-dark); }
  .ds-join-input::placeholder { color:var(--brown-muted); text-transform:none; letter-spacing:0; font-weight:300; font-size:14px; }
  .ds-join-btn { padding:14px 18px; background:var(--green); color:var(--brown); border:none; border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; transition:transform 0.15s; }
  .ds-join-btn:hover { transform:translateY(-1px); }
  .ds-join-hint { font-size:12px; color:var(--text-muted); margin-top:8px; line-height:1.5; }
  .ds-join-error { font-size:12px; color:var(--red); margin-top:6px; }

  /* ── Onboarding ── */
  .onboarding { max-width:480px; margin:0 auto; min-height:100vh; padding-bottom:40px; display:flex; flex-direction:column; background:var(--bg); overflow-x:hidden; }
  .ob-hero { background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 60%); padding:52px 28px 28px; position:relative; overflow:hidden; }
  .ob-hero::before { content:''; position:absolute; top:-60px; right:-60px; width:240px; height:240px; background:radial-gradient(circle,rgba(168,213,186,0.35) 0%,transparent 70%); border-radius:50%; }
  .ob-hero-icon { position:relative; z-index:1; margin-bottom:12px; }
  .ob-title { font-family:'Fraunces',serif; font-size:32px; font-weight:600; color:var(--brown); line-height:1.15; position:relative; z-index:1; }
  .ob-subtitle { font-size:15px; color:var(--text-muted); margin-top:8px; line-height:1.6; font-weight:400; position:relative; z-index:1; }
  .ob-step-indicator { display:flex; gap:6px; margin-top:20px; position:relative; z-index:1; }
  .ob-step-dot { width:24px; height:4px; border-radius:99px; background:var(--border); transition:background 0.3s; }
  .ob-step-dot.active { background:var(--brown); }
  .ob-step-dot.done   { background:var(--green-dark); }
  .ob-body { padding:28px; flex:1; }
  .ob-question { font-family:'Fraunces',serif; font-size:22px; color:var(--brown); margin-bottom:6px; line-height:1.3; }
  .ob-hint { font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.5; }
  .ob-note { font-size:11px; color:var(--green-dark); background:rgba(168,213,186,0.2); border-left:3px solid var(--green); border-radius:0 var(--radius-sm) var(--radius-sm) 0; padding:8px 12px; margin-bottom:12px; line-height:1.5; }
  .ob-input { width:100%; padding:16px 18px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:20px; color:var(--brown); outline:none; transition:border-color 0.2s; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; }
  .ob-input:focus { border-color:var(--green-dark); }
  .ob-input::placeholder { color:var(--brown-muted); font-weight:300; font-size:15px; text-transform:none; letter-spacing:0; }
  .ob-options { display:flex; flex-direction:column; gap:10px; }
  .ob-option { display:flex; align-items:center; gap:14px; padding:14px 18px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; transition:border-color 0.2s,background 0.2s; text-align:left; }
  .ob-option:hover { border-color:var(--green); }
  .ob-option.selected { border-color:var(--green-dark); background:rgba(168,213,186,0.1); }
  .ob-option-emoji { font-size:22px; flex-shrink:0; }
  .ob-option-label { font-size:15px; color:var(--brown); font-weight:400; }
  .ob-option-sub { font-size:12px; color:var(--text-muted); margin-top:2px; }
  .ob-duration-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ob-dur-btn { padding:14px 12px; background:var(--surf); border:2px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; transition:border-color 0.2s,background 0.2s; text-align:center; }
  .ob-dur-btn:hover { border-color:var(--green); }
  .ob-dur-btn.selected { border-color:var(--green-dark); background:rgba(168,213,186,0.1); }
  .ob-dur-val { font-family:'Fraunces',serif; font-size:22px; color:var(--brown); font-weight:600; }
  .ob-dur-lbl { font-size:12px; color:var(--text-muted); margin-top:2px; }
  .ob-footer { padding:0 28px; }
  .ob-btn-next { width:100%; padding:18px; background:var(--brown); color:white; border:none; border-radius:var(--radius); font-family:'DM Sans',sans-serif; font-size:16px; font-weight:500; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s,opacity 0.2s; box-shadow:0 4px 20px rgba(75,60,48,0.25); }
  .ob-btn-next:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 28px rgba(75,60,48,0.30); }
  .ob-btn-next:disabled { opacity:0.4; cursor:default; }
  .ob-back-btn { background:none; border:none; color:var(--text-muted); font-family:'DM Sans',sans-serif; font-size:14px; cursor:pointer; margin-top:14px; display:block; width:100%; text-align:center; padding:8px; }

  /* ── Header ── */
  .header { padding:44px 24px 18px; background:linear-gradient(160deg,var(--surf-soft) 0%,var(--bg) 100%); position:relative; overflow:hidden; }
  .header::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; background:radial-gradient(circle,rgba(168,213,186,0.30) 0%,transparent 70%); border-radius:50%; }
  .header-top { display:flex; align-items:flex-start; justify-content:space-between; position:relative; z-index:1; }
  .app-title { font-family:'Fraunces',serif; font-size:26px; font-weight:600; color:var(--brown); line-height:1.1; }
  .app-subtitle { font-size:13px; color:var(--text-muted); margin-top:3px; font-weight:400; }
  .header-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .dog-id-badge { display:flex; align-items:center; gap:6px; background:var(--surf); border-radius:99px; padding:4px 10px 4px 8px; box-shadow:var(--shadow); cursor:pointer; border:1.5px solid var(--border); transition:border-color 0.2s; }
  .dog-id-badge:hover { border-color:var(--green-dark); }
  .dog-id-text { font-size:11px; font-family:monospace; font-weight:600; color:var(--brown); letter-spacing:0.06em; }

  /* ── Goal card ── */
  .goal-card { margin:0 24px 16px; background:var(--surf); border-radius:var(--radius); padding:16px 20px; box-shadow:var(--shadow); position:relative; overflow:hidden; }
  .goal-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg,var(--green-dark),var(--green)); opacity:0.8; }
  .goal-label { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
  .goal-title { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); font-weight:500; }
  .goal-pct   { font-family:'Fraunces',serif; font-size:22px; color:var(--green-dark); font-weight:600; }
  .progress-track { height:10px; background:var(--surf-soft); border-radius:99px; overflow:hidden; }
  .progress-fill  { height:100%; background:linear-gradient(90deg,var(--green-dark),var(--green)); border-radius:99px; transition:width 0.8s cubic-bezier(0.34,1.56,0.64,1); }
  .goal-meta { margin-top:8px; font-size:12px; color:var(--text-muted); display:flex; justify-content:space-between; }

  /* ── Rec card ── */
  .rec-card { margin:0 24px 16px; background:linear-gradient(135deg,var(--brown) 0%,#6b5444 100%); border-radius:var(--radius); padding:18px 20px; color:white; box-shadow:0 6px 28px rgba(75,60,48,0.30); position:relative; overflow:hidden; }
  .rec-card::before { content:'🐾'; position:absolute; right:16px; bottom:-4px; font-size:56px; opacity:0.12; }
  .rec-row { display:flex; gap:20px; align-items:flex-end; }
  .rec-col { flex:1; }
  .rec-label { font-size:10px; text-transform:uppercase; letter-spacing:0.1em; opacity:0.75; font-weight:500; margin-bottom:4px; }
  .rec-value { font-family:'Fraunces',serif; font-size:34px; font-weight:600; line-height:1; }
  .rec-unit  { font-size:12px; opacity:0.75; font-weight:400; }
  .rec-tip   { font-size:12px; opacity:0.85; margin-top:12px; line-height:1.55; font-weight:400; }

  /* ── Daily cap bar ── */
  .cap-bar { margin:0 24px 14px; background:var(--surf); border-radius:var(--radius-sm); padding:12px 16px; box-shadow:var(--shadow); }
  .cap-bar-label { display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:500; margin-bottom:7px; }
  .cap-bar-track { height:8px; background:var(--surf-soft); border-radius:99px; overflow:hidden; }
  .cap-bar-fill { height:100%; border-radius:99px; transition:width 0.6s; }
  .cap-bar-fill.ok   { background:linear-gradient(90deg,var(--green-dark),var(--green)); }
  .cap-bar-fill.near { background:linear-gradient(90deg,var(--orange),var(--amber-light)); }
  .cap-bar-fill.full { background:linear-gradient(90deg,var(--red),var(--orange)); }

  /* ── Buttons ── */
  .btn-start { display:block; width:calc(100% - 48px); margin:0 24px 12px; padding:18px; background:var(--brown); color:white; border:none; border-radius:var(--radius); font-family:'DM Sans',sans-serif; font-size:16px; font-weight:500; letter-spacing:0.04em; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; box-shadow:0 4px 20px rgba(75,60,48,0.25); }
  .btn-start:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 28px rgba(75,60,48,0.30); }
  .btn-start:disabled { opacity:0.45; cursor:default; }
  .btn-end { display:block; width:calc(100% - 44px); margin:16px 22px 0; padding:16px; background:var(--green); color:var(--brown); border:none; border-radius:var(--radius); font-family:'DM Sans',sans-serif; font-size:16px; font-weight:600; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; box-shadow:0 4px 16px rgba(168,213,186,0.50); letter-spacing:0.02em; }
  .btn-end:hover { transform:translateY(-2px); box-shadow:0 6px 22px rgba(168,213,186,0.60); }
  .btn-end:active { transform:translateY(0); }
  .btn-walk { display:flex; align-items:center; gap:10px; width:calc(100% - 48px); margin:0 24px 14px; padding:14px 18px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius); font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; cursor:pointer; transition:border-color 0.2s,background 0.2s,transform 0.15s; box-shadow:var(--shadow); }
  .btn-walk:hover { border-color:var(--green-dark); background:var(--surf-soft); transform:translateY(-1px); }
  .btn-walk .walk-count { margin-left:auto; background:var(--surf-soft); padding:2px 10px; border-radius:99px; font-size:12px; color:var(--text-muted); font-weight:400; }

  /* ── Timer screen ── */
  .timer-screen { margin:0 24px; background:var(--surf); border-radius:var(--radius); padding:26px 22px; box-shadow:var(--shadow-lg); text-align:center; animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  .timer-label  { font-size:12px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); font-weight:500; margin-bottom:8px; }
  .timer-target { font-size:13px; color:var(--text-muted); margin:8px 0 4px; }
  .timer-target span { color:var(--brown); font-weight:500; }
  .timer-tip { font-size:12px; color:var(--text-muted); font-style:italic; margin:6px 0 20px; line-height:1.5; }
  .btn-cancel { display:block; width:100%; margin-top:12px; padding:12px; background:transparent; color:var(--text-muted); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:14px; cursor:pointer; transition:background 0.15s; }
  .btn-cancel:hover { background:var(--surf-soft); }

  /* ── Rating screen ── */
  .rating-screen { margin:0 24px; background:var(--surf); border-radius:var(--radius); padding:24px 22px; box-shadow:var(--shadow-lg); animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  .rating-title { font-family:'Fraunces',serif; font-size:21px; color:var(--brown); text-align:center; margin-bottom:4px; }
  .rating-sub   { font-size:13px; color:var(--text-muted); text-align:center; margin-bottom:20px; line-height:1.5; }
  .result-grid { display:flex; flex-direction:column; gap:10px; margin-bottom:4px; }
  .btn-result { width:100%; padding:15px 16px; border:none; border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; cursor:pointer; transition:transform 0.15s; display:flex; align-items:center; gap:14px; text-align:left; }
  .btn-result .emoji { font-size:22px; flex-shrink:0; }
  .btn-result .result-desc { font-size:11px; opacity:0.72; margin-top:1px; font-weight:300; }
  .btn-none   { background:var(--green);  color:var(--brown); box-shadow:0 4px 16px rgba(168,213,186,0.45); }
  .btn-mild   { background:var(--orange); color:white; box-shadow:0 4px 16px rgba(230,126,34,0.30); }
  .btn-strong { background:var(--red);    color:white; box-shadow:0 4px 16px rgba(192,57,43,0.28); }
  .btn-result:hover { transform:translateY(-2px); }

  /* ── Contextual tips ── */
  .ctx { margin:0 24px 14px; padding:12px 16px; background:var(--surf); border-radius:var(--radius-sm); border-left:3px solid var(--green-dark); font-size:12px; color:var(--text-muted); line-height:1.65; box-shadow:0 2px 8px rgba(75,60,48,0.06); }
  .ctx strong { color:var(--brown); }
  .ctx.amber { border-left-color:var(--amber); }
  .ctx.red   { border-left-color:var(--red); background:rgba(192,57,43,0.04); }
  .ctx.green { border-left-color:var(--green-dark); }

  /* ── Ring timer ── */
  .ring-wrap { position:relative; width:110px; height:110px; margin:0 auto 6px; }
  .ring-svg  { transform:rotate(-90deg); }
  .ring-bg   { fill:none; stroke:var(--surf-soft); stroke-width:6; }
  .ring-fill { fill:none; stroke:var(--brown); stroke-width:6; stroke-linecap:round; transition:stroke-dashoffset 1s linear; }
  .ring-text { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; }
  .ring-time { font-family:'Fraunces',serif; font-size:20px; font-weight:600; color:var(--brown); }
  .ring-sub  { font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; }

  /* ── Pattern Breaking section ── */
  .pat-section { margin:0 24px 16px; }
  .pat-header  { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .pat-title   { font-family:'Fraunces',serif; font-size:17px; color:var(--brown); }
  .pat-badge   { font-size:10px; font-weight:500; padding:2px 9px; border-radius:99px; background:rgba(168,213,186,0.3); color:var(--green-dark); letter-spacing:0.05em; text-transform:uppercase; }
  .pat-reminder { font-size:12px; color:var(--text-muted); line-height:1.65; padding:10px 14px; background:var(--surf); border-radius:var(--radius-sm); margin-bottom:10px; border-left:3px solid var(--green-dark); box-shadow:0 2px 8px rgba(75,60,48,0.06); }
  .pat-reminder.warn { border-left-color:var(--amber); color:var(--brown-mid); }
  .pat-btns { display:flex; flex-direction:column; gap:8px; }
  .btn-pat { display:flex; align-items:center; gap:12px; padding:13px 16px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:400; cursor:pointer; transition:border-color 0.2s,transform 0.15s; text-align:left; box-shadow:0 2px 8px rgba(75,60,48,0.05); }
  .btn-pat:hover { border-color:var(--green-dark); transform:translateX(3px); }
  .btn-pat:active { transform:translateX(0); }
  .p-emoji { font-size:18px; flex-shrink:0; }
  .p-text  { flex:1; }
  .p-label { font-size:14px; color:var(--brown); font-weight:400; }
  .p-desc  { font-size:11px; color:var(--text-muted); margin-top:1px; font-weight:300; }
  .p-count { font-size:11px; color:var(--text-muted); background:var(--surf-soft); padding:2px 9px; border-radius:99px; flex-shrink:0; white-space:nowrap; }

  /* ── Tabs ── */
  .tabs { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; max-width:480px; background:rgba(247,242,231,0.96); backdrop-filter:blur(12px); border-top:1px solid var(--border); display:flex; z-index:100; padding-bottom:env(safe-area-inset-bottom,0px); }
  .tab-btn { flex:1; padding:10px 4px 14px; background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; color:var(--brown-muted); transition:color 0.2s; font-family:'DM Sans',sans-serif; font-size:9px; font-weight:500; letter-spacing:0.05em; text-transform:uppercase; }
  .tab-btn.active { color:var(--brown); }
  .tab-btn svg { width:20px; height:20px; }

  /* ── Sections ── */
  .section { padding:24px; overflow-x:hidden; }
  .section-title { font-family:'Fraunces',serif; font-size:22px; color:var(--brown); margin-bottom:16px; }
  .empty-state { text-align:center; padding:40px 24px; color:var(--text-muted); }
  .empty-state .big { font-size:48px; margin-bottom:12px; }
  .empty-state p { font-size:14px; line-height:1.6; }

  /* ── History ── */
  .h-item { background:var(--surf); border-radius:var(--radius-sm); padding:13px 16px; margin-bottom:9px; box-shadow:0 2px 12px rgba(75,60,48,0.06); display:flex; align-items:center; gap:12px; animation:fadeIn 0.3s ease; }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .h-dot { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .dot-none   { background:rgba(168,213,186,0.3); }
  .dot-mild   { background:rgba(230,126,34,0.12); }
  .dot-strong { background:rgba(192,57,43,0.10); }
  .dot-walk   { background:rgba(74,158,110,0.15); }
  .dot-pat    { background:rgba(75,60,48,0.09); }
  .h-info { flex:1; min-width:0; }
  .h-main { font-weight:500; font-size:14px; color:var(--brown); }
  .h-date { font-size:11px; color:var(--text-muted); margin-top:2px; }
  .h-badge { font-size:10px; font-weight:500; padding:3px 9px; border-radius:99px; letter-spacing:0.03em; white-space:nowrap; flex-shrink:0; }
  .badge-none   { background:rgba(168,213,186,0.3);  color:var(--green-dark); }
  .badge-mild   { background:rgba(230,126,34,0.12); color:var(--orange); }
  .badge-strong { background:rgba(192,57,43,0.10);  color:var(--red); }
  .badge-walk   { background:rgba(74,158,110,0.15);  color:var(--green-dark); }
  .badge-pat    { background:rgba(75,60,48,0.09);    color:var(--brown-mid); }

  /* ── Stats ── */
  .chart-wrap  { background:var(--surf); border-radius:var(--radius); padding:20px 8px 16px; box-shadow:var(--shadow); margin-bottom:18px; }
  .chart-title { font-family:'Fraunces',serif; font-size:15px; color:var(--brown); margin-bottom:14px; padding-left:12px; }
  .streak-card { background:linear-gradient(135deg,var(--green-dark) 0%,var(--green) 100%); border-radius:var(--radius); padding:18px 20px; color:white; text-align:center; box-shadow:0 4px 20px rgba(61,140,96,0.30); margin-bottom:14px; }
  .streak-num  { font-family:'Fraunces',serif; font-size:44px; font-weight:600; line-height:1; }
  .streak-lbl  { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.85; margin-top:4px; font-weight:500; }
  .stats-row   { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
  .stat-card   { background:var(--surf); border-radius:var(--radius-sm); padding:14px; text-align:center; box-shadow:var(--shadow); }
  .stat-val    { font-family:'Fraunces',serif; font-size:26px; color:var(--brown); font-weight:600; }
  .stat-lbl    { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-top:2px; font-weight:500; }
  .stat-wide   { background:var(--surf); border-radius:var(--radius-sm); padding:14px 18px; box-shadow:var(--shadow); grid-column:span 2; display:flex; align-items:center; justify-content:space-between; }
  .stat-wide .stat-val { font-family:'Fraunces',serif; font-size:26px; color:var(--brown); font-weight:600; }
  .stat-wide .stat-lbl { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-top:2px; font-weight:500; }
  .stat-icon   { font-size:28px; opacity:0.45; }
  .ratio-card  { background:var(--surf); border-radius:var(--radius-sm); padding:16px; box-shadow:var(--shadow); margin-bottom:14px; }
  .ratio-title { font-size:12px; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted); font-weight:500; margin-bottom:10px; }
  .ratio-bar   { height:12px; border-radius:99px; overflow:hidden; display:flex; }
  .ratio-good  { background:var(--green);  transition:width 0.6s; }
  .ratio-mild  { background:var(--orange); transition:width 0.6s; }
  .ratio-bad   { background:var(--red);    transition:width 0.6s; }
  .ratio-legend { display:flex; gap:14px; margin-top:8px; font-size:11px; color:var(--text-muted); flex-wrap:wrap; }
  .ratio-legend span { display:flex; align-items:center; gap:5px; }
  .dot12 { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

  /* ── Settings tab ── */
  .share-card  { background:var(--surf); border-radius:var(--radius); padding:20px; margin-bottom:14px; box-shadow:var(--shadow); }
  .share-title { font-family:'Fraunces',serif; font-size:17px; color:var(--brown); margin-bottom:4px; }
  .share-sub   { font-size:13px; color:var(--text-muted); margin-bottom:14px; line-height:1.5; }
  .share-id-row { display:flex; align-items:center; gap:10px; background:var(--surf-soft); border-radius:var(--radius-sm); padding:12px 16px; margin-bottom:10px; }
  .share-id-val { font-family:monospace; font-size:22px; font-weight:700; color:var(--brown); letter-spacing:0.1em; flex:1; }
  .copy-btn { background:var(--brown); color:white; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:opacity 0.15s; }
  .copy-btn:hover { opacity:0.85; }
  .share-steps { font-size:12px; color:var(--text-muted); line-height:1.8; padding-left:18px; }
  .share-steps li { margin-bottom:2px; }
  .settings-btn { width:100%; padding:14px 18px; background:var(--surf); color:var(--brown); border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:10px; margin-bottom:10px; transition:border-color 0.2s,background 0.2s; box-shadow:0 2px 8px rgba(75,60,48,0.05); }
  .settings-btn:hover { border-color:var(--green-dark); background:var(--surf-soft); }
  .settings-btn.danger { color:var(--red); }
  .settings-btn.danger:hover { border-color:var(--red); }

  /* ── Toast ── */
  .toast { position:fixed; top:24px; left:50%; transform:translateX(-50%); background:var(--brown); color:white; padding:12px 22px; border-radius:99px; font-size:14px; z-index:999; animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1),toastOut 0.3s ease 2.7s forwards; box-shadow:0 8px 32px rgba(75,60,48,0.25); max-width:88vw; text-align:center; white-space:nowrap; }
  @keyframes toastIn  { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes toastOut { to{opacity:0;transform:translateX(-50%) translateY(-10px)} }
  .clear-btn { background:none; border:none; color:var(--text-muted); font-size:12px; cursor:pointer; text-decoration:underline; padding:4px; font-family:'DM Sans',sans-serif; }
  .clear-btn:hover { color:var(--red); }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-thumb { background:var(--border); border-radius:99px; }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const PawIcon = ({ size = 36, color = "var(--green-dark)" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="PawTimer">
    <ellipse cx="50" cy="66" rx="22" ry="20" fill={color}/>
    <ellipse cx="25" cy="44" rx="9"  ry="12" transform="rotate(-10 25 44)" fill={color}/>
    <ellipse cx="41" cy="33" rx="9"  ry="12" transform="rotate(-3 41 33)"  fill={color}/>
    <ellipse cx="59" cy="33" rx="9"  ry="12" transform="rotate(3 59 33)"   fill={color}/>
    <ellipse cx="75" cy="44" rx="9"  ry="12" transform="rotate(10 75 44)"  fill={color}/>
  </svg>
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

// ─── Ring Timer ───────────────────────────────────────────────────────────────
function RingTimer({ elapsed, target }) {
  const r = 46, circ = 2 * Math.PI * r;
  const pct  = Math.min(elapsed / Math.max(target, 1), 1);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  return (
    <div className="ring-wrap">
      <svg className="ring-svg" width="110" height="110" viewBox="0 0 110 110">
        <circle className="ring-bg" cx="55" cy="55" r={r}/>
        <circle className="ring-fill" cx="55" cy="55" r={r}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ stroke: pct >= 1 ? "var(--green-dark)" : "var(--brown)" }}/>
      </svg>
      <div className="ring-text">
        <div className="ring-time">{mins}:{secs}</div>
        <div className="ring-sub">elapsed</div>
      </div>
    </div>
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

  const nameUp = name.toUpperCase().replace(/\s+/g, " ").trim();
  const canNext = [nameUp.length >= 1, leaves !== null, calm !== null, goal !== null][step];
  const displayName = nameUp || "your dog";

  const handleNext = () => {
    if (step < 3) setStep(s => s + 1);
    else onComplete({ dogName: nameUp, leavesPerDay: leaves, currentMaxCalm: calm, goalSeconds: goal });
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
          <div className="ob-note">Names are case-insensitive — they're shown automatically in CAPITAL LETTERS.</div>
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
                <div className="ds-dog-name">{(d.dogName || "").toUpperCase()}</div>
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
        <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:10, lineHeight:1.5 }}>
          Use the same ID from your partner's phone to track the same dog together.
        </div>
        <div className="ds-join-row">
          <input className="ds-join-input" placeholder="e.g. LUNA-4829"
            value={joinId}
            onChange={e => { setJoinId(e.target.value.toUpperCase()); setJoinError(""); }}
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
  const [dogs,        setDogs]        = useState(() => load(DOGS_KEY, []));
  const [activeDogId, setActiveDogId] = useState(() => load(ACTIVE_DOG_KEY, null));
  const [screen,      setScreen]      = useState("select");
  const [sessions,    setSessions]    = useState([]);
  const [walks,       setWalks]       = useState([]);
  const [patterns,    setPatterns]    = useState([]);
  const [tab,          setTab]          = useState("home");
  const [phase,        setPhase]        = useState("idle"); // idle | running | rating
  const [elapsed,      setElapsed]      = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const [target,       setTarget]       = useState(PROTOCOL.startDurationSeconds);
  const [toast,        setToast]        = useState(null);

  const timerRef = useRef(null);
  const startRef = useRef(null);

  // ── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => { save(DOGS_KEY, dogs); }, [dogs]);
  useEffect(() => { save(ACTIVE_DOG_KEY, activeDogId); }, [activeDogId]);

  useEffect(() => {
    if (!activeDogId) { setScreen("select"); return; }
    // Look for dog in current dogs list OR in fresh localStorage (covers join race condition)
    const dog = dogs.find(d => d.id === activeDogId)
              ?? load(DOGS_KEY, []).find(d => d.id === activeDogId);
    if (!dog) { setScreen("select"); return; }
    const s = load(sessKey(activeDogId), []);
    const w = load(walkKey(activeDogId), []);
    const p = load(patKey(activeDogId),  []);
    setSessions(s); setWalks(w); setPatterns(p);
    setTarget(suggestNext(s, dog));
    setScreen("app");
  }, [activeDogId]);

  useEffect(() => { if (activeDogId) save(sessKey(activeDogId), sessions); }, [sessions, activeDogId]);
  useEffect(() => { if (activeDogId) save(walkKey(activeDogId), walks);    }, [walks,    activeDogId]);
  useEffect(() => { if (activeDogId) save(patKey(activeDogId),  patterns); }, [patterns, activeDogId]);

  // Boot: restore last active dog
  useEffect(() => {
    const savedId   = load(ACTIVE_DOG_KEY, null);
    const savedDogs = load(DOGS_KEY, []);
    if (savedId && savedDogs.find(d => d.id === savedId)) setActiveDogId(savedId);
    else setScreen("select");
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────
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
  const handleDogSelect = (id, isJoin = false) => {
    const existing = dogs.find(d => d.id === id);
    if (existing) { setActiveDogId(id); return; }
    if (isJoin) {
      // Create placeholder and persist it synchronously to localStorage
      // so the [activeDogId] effect can find it even in edge cases
      const prefix = id.split("-")[0] || "DOG";
      const placeholder = {
        id, dogName: prefix.toUpperCase(),
        leavesPerDay: 3, currentMaxCalm: 60, goalSeconds: 2400,
        createdAt: new Date().toISOString(), isJoined: true,
      };
      const updatedDogs = [...dogs, placeholder];
      save(DOGS_KEY, updatedDogs);          // persist first
      setDogs(updatedDogs);                 // then update state
      setActiveDogId(id);
      showToast(`✅ Joined ${prefix.toUpperCase()}!`);
    } else {
      setActiveDogId(id); setScreen("onboard");
    }
  };

  const handleOnboardComplete = (data) => {
    const id     = activeDogId || generateId(data.dogName);
    const newDog = { ...data, id, dogName: data.dogName.toUpperCase(), createdAt: new Date().toISOString() };
    setDogs(prev => [...prev.filter(d => d.id !== id), newDog]);
    setActiveDogId(id);
    setTarget(Math.max(Math.round(data.currentMaxCalm * 0.8), PROTOCOL.startDurationSeconds));
  };

  const startSession = () => { setElapsed(0); setPhase("running"); };

  const endSession = () => {
    // Freeze the elapsed time, move to rating
    clearInterval(timerRef.current);
    setFinalElapsed(elapsed);
    setPhase("rating");
  };

  const recordResult = (distressLevel) => {
    const dog = dogs.find(d => d.id === activeDogId);
    const session = {
      id: Date.now(), date: new Date().toISOString(),
      plannedDuration: target, actualDuration: finalElapsed,
      distressLevel, result: distressLevel === "none" ? "success" : "distress",
    };
    const updated = [...sessions, session];
    setSessions(updated);
    const next = suggestNext(updated, dog);
    setTarget(next);
    setPhase("idle"); setElapsed(0); setFinalElapsed(0);
    const n = (dog?.dogName ?? "dog").toUpperCase();
    if (distressLevel === "none")       showToast(`✅ ${n} was calm! Next: ${fmt(next)}`);
    else if (distressLevel === "mild")  showToast(`⚠️ Mild signs — holding at ${fmt(next)}`);
    else                                showToast(`❤️ Rolled back to ${fmt(next)}`);
  };

  const cancelSession = () => {
    setPhase("idle"); setElapsed(0); setFinalElapsed(0); clearInterval(timerRef.current);
  };

  const logWalk = () => {
    setWalks(prev => [...prev, { id: Date.now(), date: new Date().toISOString() }]);
    const n = (dogs.find(d => d.id === activeDogId)?.dogName ?? "dog").toUpperCase();
    showToast(`🚶 Walk with ${n} logged!`);
  };

  const logPattern = (type) => {
    setPatterns(prev => [...prev, { id: Date.now(), date: new Date().toISOString(), type }]);
    const pt = PATTERN_TYPES.find(p => p.type === type);
    showToast(`${pt.emoji} Pattern break logged!`);
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
      onCreateNew={() => { setActiveDogId(null); setScreen("onboard"); }}/>
    </>
  );
  if (screen === "onboard") return (
    <><style>{styles}</style>
    <Onboarding onComplete={handleOnboardComplete} onBack={() => setScreen("select")}/>
    </>
  );

  // ── Computed values ───────────────────────────────────────────────────────
  const dog      = dogs.find(d => d.id === activeDogId);
  const name     = (dog?.dogName ?? "YOUR DOG").toUpperCase();
  const goalSec  = dog?.goalSeconds ?? 2400;
  const goalPct  = Math.min((target / goalSec) * 100, 100);

  // Protocol: daily session allowance
  const { count: countToday, usedSec, capSec, canAdd } = dailyInfo(sessions);
  const capPct  = Math.min((usedSec / capSec) * 100, 100);
  const capNear = capPct >= 60 && capPct < 90;
  const capFull = capPct >= 90;

  // Protocol: pattern-break status
  const { todayPat, todayWalks, recMin, recMax, needed, behind } = patternInfo(patterns, walks);

  // Pattern reminder text
  // IMPORTANT: Pattern breaks must be done SEPARATELY from walks —
  // the goal is to break the departure→anxiety association, so
  // sometimes putting on shoes/jacket does NOT lead to going out.
  const patReminderText = (() => {
    if (todayPat === 0)
      return `Do ${recMin}–${recMax} pattern breaks today — spread throughout the day, NOT linked to actual walks. Put on shoes (or jacket, or pick up keys), then take them off and sit back down. This teaches ${name} that these actions don't always mean you're leaving.`;
    if (behind) {
      const deficit = needed - todayPat;
      return `⚠️ You've logged ${todayWalks} walk${todayWalks !== 1 ? "s" : ""} but only ${todayPat} pattern break${todayPat !== 1 ? "s" : ""}. Do ${deficit} more — pattern breaks must outnumber full departures so the cues lose their predictive power.`;
    }
    if (todayPat >= recMax) return `✅ ${todayPat} pattern breaks done today — great work! Cues are losing their power.`;
    return `${todayPat} of ${recMin}–${recMax} pattern breaks done. Do a few more at random times — not before walks, just scattered through the day.`;
  })();

  // Stats
  const noneCount   = sessions.filter(s => s.distressLevel === "none").length;
  const mildCount   = sessions.filter(s => s.distressLevel === "mild").length;
  const strongCount = sessions.filter(s => s.distressLevel === "strong").length;
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

  const chartData = sessions.slice(-25).map((s, i) => ({
    session: i + 1,
    duration: Math.round(s.actualDuration / 60 * 10) / 10,
    distressLevel: s.distressLevel,
  }));
  const CustomDot = ({ cx, cy, payload }) => {
    const c = payload.distressLevel === "none" ? "var(--green-dark)"
            : payload.distressLevel === "mild" ? "var(--orange)" : "var(--red)";
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2}/>;
  };

  // Unified timeline (sessions + walks + pattern breaks)
  const timeline = [
    ...sessions.map(s => ({ kind:"session", date:s.date, data:s })),
    ...walks.map(w    => ({ kind:"walk",    date:w.date, data:w })),
    ...patterns.map(p => ({ kind:"pat",     date:p.date, data:p })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>
      {toast && <div className="toast">{toast}</div>}

      <div className="app">

        {/* Header */}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="app-title">PawTimer</div>
              <div className="app-subtitle">Training {name} today</div>
            </div>
            <div className="header-right">
              <PawIcon size={36}/>
              <div className="dog-id-badge" onClick={copyDogId} title="Tap to copy ID">
                <span className="dog-id-text">{activeDogId}</span>
                <span style={{ fontSize:11, color:"var(--text-muted)" }}>⎘</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ TRAIN ═══ */}
        {tab === "home" && (<>

          {/* Goal progress */}
          <div className="goal-card">
            <div className="goal-label">
              <span className="goal-title">Goal: {fmt(goalSec)}</span>
              <span className="goal-pct">{Math.round(goalPct)}%</span>
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width:`${goalPct}%` }}/></div>
            <div className="goal-meta"><span>Current: {fmt(target)}</span><span>Goal: {fmt(goalSec)}</span></div>
          </div>

          {/* Recommendation card */}
          <div className="rec-card">
            <div className="rec-row">
              <div className="rec-col">
                <div className="rec-label">Next session</div>
                <div className="rec-value">{fmt(target)}</div>
              </div>
              <div className="rec-col">
                <div className="rec-label">Sessions today</div>
                <div className="rec-value" style={{ fontSize:28 }}>
                  {countToday}<span style={{ fontSize:17, opacity:0.7 }}>/{PROTOCOL.sessionsPerDayMax}</span>
                </div>
                <div className="rec-unit">max per protocol</div>
              </div>
            </div>
            <div className="rec-tip">
              {/* Contextual tip based on last session outcome */}
              {!sessions.length
                ? `Starting below ${name}'s comfort threshold — small, positive steps 🐾`
                : !lastSess || lastSess.distressLevel === "none"
                  ? `${name} was calm — stepping up +${PROTOCOL.incrementPercentDefault}% to ${fmt(target)}.`
                  : lastSess.distressLevel === "mild"
                    ? `Mild signs last time — holding at ${fmt(target)} until ${name} is reliably calm.`
                    : `Strong distress — rolled back to ${fmt(target)}. A solid foundation matters most.`}
            </div>
          </div>

          {/* Daily alone-time cap */}
          <div className="cap-bar">
            <div className="cap-bar-label">
              <span>Daily alone-time</span>
              <span>{fmt(usedSec)} / {fmt(capSec)}</span>
            </div>
            <div className="cap-bar-track">
              <div className={`cap-bar-fill ${capFull ? "full" : capNear ? "near" : "ok"}`}
                style={{ width:`${capPct}%` }}/>
            </div>
          </div>

          {/* ── IDLE ── */}
          {phase === "idle" && (<>

            {/* First-time how-to tip */}
            {!sessions.length && (
              <div className="ctx green" style={{ marginBottom:12 }}>
                <strong>How it works:</strong><br/>
                1. Tap Start — then calmly leave the room (no big goodbye)<br/>
                2. Return any time and tap End Session<br/>
                3. Rate how {name} did<br/>
                4. Duration increases +{PROTOCOL.incrementPercentDefault}% only on zero distress 🐾
              </div>
            )}

            <button className="btn-start" onClick={startSession} disabled={!canAdd}
              title={!canAdd ? `Daily limit: max ${PROTOCOL.sessionsPerDayMax} sessions or ${PROTOCOL.maxDailyAloneMinutes} min alone` : ""}>
              ▶ Start Session for {name}
            </button>

            {/* Daily limit reached */}
            {!canAdd && (
              <div className="ctx amber">
                <strong>Daily limit reached.</strong> The protocol caps alone time at {PROTOCOL.maxDailyAloneMinutes} min/day and {PROTOCOL.sessionsPerDayMax} sessions. Rest days are part of the process — {name}'s nervous system needs time to consolidate progress.
              </div>
            )}

            <button className="btn-walk" onClick={logWalk}>
              <span style={{ fontSize:20 }}>🚶</span>
              <span>Log a walk together</span>
              <span className="walk-count">Today: {todayWalks}</span>
            </button>

            {/* ── Pattern Breaking ── */}
            <div className="pat-section">
              <div className="pat-header">
                <span className="pat-title">Pattern Breaking</span>
                <span className="pat-badge">Daily habit</span>
              </div>
              <div className={`pat-reminder ${behind ? "warn" : ""}`}>
                {patReminderText}
              </div>
              <div className="pat-btns">
                {PATTERN_TYPES.map(pt => (
                  <button key={pt.type} className="btn-pat" onClick={() => logPattern(pt.type)}>
                    <span className="p-emoji">{pt.emoji}</span>
                    <div className="p-text">
                      <div className="p-label">{pt.label}</div>
                      <div className="p-desc">{pt.desc}</div>
                    </div>
                    <span className="p-count">Today: {patterns.filter(p => isToday(p.date) && p.type === pt.type).length}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contextual post-session feedback */}
            {lastSess?.distressLevel === "strong" && (
              <div className="ctx red">
                <strong>Rolled back to a safe level.</strong> The protocol returns to 1–2 successful sessions earlier in the history. Rebuild from there — steady progress beats pushing through anxiety.
              </div>
            )}
            {lastSess?.distressLevel === "mild" && (
              <div className="ctx amber">
                <strong>Holding at {fmt(target)}.</strong> Mild signs mean {name} is right at the threshold. Once consistently calm here, take one small step forward.
              </div>
            )}
          </>)}

          {/* ── RUNNING ── */}
          {phase === "running" && (
            <div className="timer-screen">
              <div className="timer-label">Session in progress</div>
              <RingTimer elapsed={elapsed} target={target}/>
              <div className="timer-target">Target: <span>{fmt(target)}</span></div>
              <div className="timer-tip">Leave the room calmly. No big goodbye — come back any time.</div>
              <button className="btn-end" onClick={endSession}>⏹ End Session</button>
              <button className="btn-cancel" onClick={cancelSession}>Cancel (don't save)</button>
            </div>
          )}

          {/* ── RATING ── */}
          {phase === "rating" && (
            <div className="rating-screen">
              <div className="rating-title">Was there any stress?</div>
              <div className="rating-sub">
                {fmt(finalElapsed)} session — how did {name} handle it?
              </div>
              <div className="result-grid">
                <button className="btn-result btn-none" onClick={() => recordResult("none")}>
                  <span className="emoji">✅</span>
                  <div><div>No Distress</div><div className="result-desc">{name} was completely calm</div></div>
                </button>
                <button className="btn-result btn-mild" onClick={() => recordResult("mild")}>
                  <span className="emoji">⚠️</span>
                  <div><div>Mild Distress</div><div className="result-desc">Slight whining or restlessness</div></div>
                </button>
                <button className="btn-result btn-strong" onClick={() => recordResult("strong")}>
                  <span className="emoji">❌</span>
                  <div><div>Strong Distress</div><div className="result-desc">Barking, pacing, or destructive</div></div>
                </button>
              </div>
              <button className="btn-cancel" onClick={() => { setPhase("idle"); setElapsed(0); setFinalElapsed(0); }}>
                Discard this session
              </button>
            </div>
          )}
        </>)}

        {/* ═══ HISTORY ═══ */}
        {tab === "history" && (
          <div className="section">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <div className="section-title">Activity Log</div>
              {sessions.length > 0 && (
                <button className="clear-btn" onClick={() => {
                  if (window.confirm("Clear all training sessions?")) {
                    setSessions([]); setTarget(suggestNext([], dog)); showToast("Sessions cleared");
                  }
                }}>Clear sessions</button>
              )}
            </div>

            {timeline.length === 0 ? (
              <div className="empty-state">
                <div className="big"><PawIcon size={48}/></div>
                <p>No activity yet.<br/>Start {name}'s first training session!</p>
              </div>
            ) : timeline.map(item => {
              if (item.kind === "session") {
                const s = item.data;
                const lv = s.distressLevel ?? (s.result === "success" ? "none" : "strong");
                const em = lv === "none" ? "✅" : lv === "mild" ? "⚠️" : "❌";
                return (
                  <div className="h-item" key={`s-${s.id}`}>
                    <div className={`h-dot dot-${lv}`}>{em}</div>
                    <div className="h-info">
                      <div className="h-main">{fmt(s.actualDuration)} <span style={{ color:"var(--text-muted)", fontWeight:300, fontSize:12 }}>of {fmt(s.plannedDuration)}</span></div>
                      <div className="h-date">{fmtDate(s.date)}</div>
                    </div>
                    <span className={`h-badge badge-${lv}`}>{distressLabel(lv)}</span>
                  </div>
                );
              }
              if (item.kind === "walk") {
                const w = item.data;
                return (
                  <div className="h-item" key={`w-${w.id}`}>
                    <div className="h-dot dot-walk">🚶</div>
                    <div className="h-info">
                      <div className="h-main">Walk with {name}</div>
                      <div className="h-date">{fmtDate(w.date)}</div>
                    </div>
                    <span className="h-badge badge-walk">Walk</span>
                  </div>
                );
              }
              if (item.kind === "pat") {
                const p  = item.data;
                const pt = PATTERN_TYPES.find(x => x.type === p.type) ?? PATTERN_TYPES[0];
                return (
                  <div className="h-item" key={`p-${p.id}`}>
                    <div className="h-dot dot-pat">{pt.emoji}</div>
                    <div className="h-info">
                      <div className="h-main">{pt.label}</div>
                      <div className="h-date">{fmtDate(p.date)}</div>
                    </div>
                    <span className="h-badge badge-pat">Pattern break</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {tab === "progress" && (
          <div className="section">
            <div className="section-title">{name}'s Progress</div>
            <div className="streak-card">
              <div className="streak-num">{streak}</div>
              <div className="streak-lbl">Calm session streak 🔥</div>
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-val">{totalCount}</div><div className="stat-lbl">Total sessions</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:"var(--green-dark)" }}>{noneCount}</div><div className="stat-lbl">No distress</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:"var(--orange)" }}>{mildCount}</div><div className="stat-lbl">Mild distress</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:"var(--red)" }}>{strongCount}</div><div className="stat-lbl">Strong distress</div></div>
              <div className="stat-card"><div className="stat-val">{fmt(bestCalm)}</div><div className="stat-lbl">Best calm time</div></div>
              <div className="stat-card"><div className="stat-val">{fmt(target)}</div><div className="stat-lbl">Next target</div></div>
              <div className="stat-wide">
                <div><div className="stat-val">{fmt(totalAlone)}</div><div className="stat-lbl">Total time {name} stayed alone</div></div>
                <div className="stat-icon">🏠</div>
              </div>
              <div className="stat-wide">
                <div><div className="stat-val">{walks.length}</div><div className="stat-lbl">Walks together</div></div>
                <div className="stat-icon">🚶</div>
              </div>
              <div className="stat-wide">
                <div><div className="stat-val">{patterns.length}</div><div className="stat-lbl">Pattern breaks logged</div></div>
                <div className="stat-icon">🔑</div>
              </div>
            </div>

            {totalCount > 0 && (
              <div className="ratio-card">
                <div className="ratio-title">Outcome breakdown</div>
                <div className="ratio-bar">
                  <div className="ratio-good" style={{ width:`${(noneCount/totalCount)*100}%` }}/>
                  <div className="ratio-mild" style={{ width:`${(mildCount/totalCount)*100}%` }}/>
                  <div className="ratio-bad"  style={{ width:`${(strongCount/totalCount)*100}%` }}/>
                </div>
                <div className="ratio-legend">
                  <span><div className="dot12" style={{ background:"var(--green)" }}/>{noneCount} calm</span>
                  <span><div className="dot12" style={{ background:"var(--orange)" }}/>{mildCount} mild</span>
                  <span><div className="dot12" style={{ background:"var(--red)" }}/>{strongCount} strong</span>
                </div>
              </div>
            )}

            <div className="goal-card" style={{ margin:"0 0 14px" }}>
              <div className="goal-label">
                <span className="goal-title">Progress toward goal</span>
                <span className="goal-pct">{Math.round(goalPct)}%</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width:`${goalPct}%` }}/></div>
              <div className="goal-meta"><span>{name} is at {fmt(target)}</span><span>Goal: {fmt(goalSec)}</span></div>
            </div>

            {chartData.length > 1 ? (
              <div className="chart-wrap">
                <div className="chart-title">Session duration over time (min)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top:5, right:24, left:-14, bottom:5 }}>
                    <CartesianGrid stroke="var(--surf-soft)" vertical={false}/>
                    <XAxis dataKey="session" tick={{ fontSize:10, fill:"var(--text-muted)" }} tickLine={false} axisLine={false}/>
                    <YAxis tick={{ fontSize:10, fill:"var(--text-muted)" }} tickLine={false} axisLine={false}/>
                    <Tooltip
                      contentStyle={{ background:"var(--brown)", border:"none", borderRadius:10, color:"white", fontSize:12 }}
                      labelStyle={{ color:"var(--green-light)" }}
                      formatter={(v,n,p) => [`${v}m — ${distressLabel(p.payload.distressLevel)}`, "Duration"]}/>
                    <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4"
                      label={{ value:"Goal", position:"right", fontSize:10, fill:"var(--green-dark)" }}/>
                    <Line type="monotone" dataKey="duration" stroke="var(--brown)" strokeWidth={2.5}
                      dot={<CustomDot/>} activeDot={{ r:6 }}/>
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:8, fontSize:11, color:"var(--text-muted)", flexWrap:"wrap" }}>
                  <span><span style={{ color:"var(--green-dark)" }}>●</span> Calm</span>
                  <span><span style={{ color:"var(--orange)" }}>●</span> Mild</span>
                  <span><span style={{ color:"var(--red)" }}>●</span> Strong</span>
                  <span><span style={{ color:"var(--brown)" }}>—</span> Duration</span>
                </div>
              </div>
            ) : (
              <div className="empty-state"><div className="big">📈</div><p>Complete 2+ sessions to see {name}'s progress chart.</p></div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "tips" && (
          <div className="section">
            <div className="section-title">Settings</div>

            {/* Dog ID */}
            <div className="share-card">
              <div className="share-title">🐾 {name}'s Dog ID</div>
              <div className="share-sub">Share this ID with your partner so both phones log to the same dog.</div>
              <div className="share-id-row">
                <div className="share-id-val">{activeDogId}</div>
                <button className="copy-btn" onClick={copyDogId}>Copy</button>
              </div>
              <ol className="share-steps">
                <li>Copy the ID and send it to your partner</li>
                <li>On their phone: open PawTimer → "Join with a dog ID"</li>
                <li>Enter the ID — they're in immediately, no extra setup</li>
              </ol>
            </div>

            {/* Protocol summary */}
            <div className="share-card">
              <div className="share-title">Training Protocol</div>
              <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.8 }}>
                <div><strong style={{ color:"var(--brown)" }}>Sessions:</strong> max {PROTOCOL.sessionsPerDayMax}/day · max {PROTOCOL.maxDailyAloneMinutes} min alone/day</div>
                <div><strong style={{ color:"var(--brown)" }}>Step up:</strong> +{PROTOCOL.incrementPercentDefault}% after each calm session (below 40 min), then +5 min fixed</div>
                <div><strong style={{ color:"var(--brown)" }}>Mild distress:</strong> Hold — same duration next session</div>
                <div><strong style={{ color:"var(--brown)" }}>Strong distress:</strong> Roll back 1–2 successful sessions</div>
                <div><strong style={{ color:"var(--brown)" }}>Pattern breaks:</strong> {PROTOCOL.desensitizationBlocksPerDayRecommendedMin}–{PROTOCOL.desensitizationBlocksPerDayRecommendedMax}/day recommended · ≥ number of walks</div>
                <div><strong style={{ color:"var(--brown)" }}>Rest days:</strong> {PROTOCOL.restDaysPerWeekRecommended}/week recommended</div>
              </div>
            </div>

            <button className="settings-btn" onClick={() => {
              if (window.confirm(`Re-run setup for ${name}? All sessions are kept.`)) {
                setDogs(prev => prev.filter(d => d.id !== activeDogId));
                setScreen("onboard");
              }
            }}>✏️ Edit {name}'s settings</button>

            <button className="settings-btn" onClick={() => setScreen("select")}>
              🐾 Switch to another dog
            </button>

            <button className="settings-btn danger" onClick={() => {
              if (window.confirm(`Remove ${name} from this device? Sessions stored elsewhere are unaffected.`)) {
                const newDogs = dogs.filter(d => d.id !== activeDogId);
                setDogs(newDogs);
                save(ACTIVE_DOG_KEY, null);
                setActiveDogId(null);
              }
            }}>🗑 Remove {name} from this device</button>
          </div>
        )}

      </div>

      {/* Tab bar */}
      <div className="tabs">
        {[
          { id:"home",     label:"Train",    icon:<HomeIcon/> },
          { id:"history",  label:"History",  icon:<HistoryIcon/> },
          { id:"progress", label:"Stats",    icon:<ChartIcon/> },
          { id:"tips",     label:"Settings", icon:<SettingsIcon/> },
        ].map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
    </>
  );
}
