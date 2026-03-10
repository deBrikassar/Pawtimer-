import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_KEY  = "pawtimer_sessions_v2";
const SETTINGS_KEY = "pawtimer_settings_v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) => {
  if (s === null || s === undefined || isNaN(s)) return "—";
  const totalSec = Math.round(s);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// ─── Progression Engine ───────────────────────────────────────────────────────
// distressLevel: "none" | "mild" | "strong"
const suggestNext = (sessions, settings) => {
  const startDuration = settings?.currentMaxCalm
    ? Math.round(settings.currentMaxCalm * 0.8)
    : 30;

  if (sessions.length === 0) return Math.max(startDuration, 15);

  const last = sessions[sessions.length - 1];
  const base = last.plannedDuration;
  const goalSec = settings?.goalSeconds ?? 2400;

  if (last.distressLevel === "none") {
    const increase = Math.round(base * 0.15);
    return Math.min(base + Math.max(increase, 5), goalSec);
  }
  if (last.distressLevel === "mild") {
    return base; // hold — don't increase, don't punish
  }
  // strong distress -> revert to last "none" session, or drop 40%
  const lastGood = [...sessions].reverse().find(s => s.distressLevel === "none");
  return lastGood
    ? Math.max(lastGood.plannedDuration, 10)
    : Math.max(Math.round(base * 0.6), 10);
};

// How many sessions to do today
const recommendDailyCount = (sessions, settings) => {
  const leaves = settings?.leavesPerDay ?? 2;
  const base = Math.min(Math.max(leaves + 1, 3), 6);
  let streak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].distressLevel === "none") streak++; else break;
  }
  if (streak >= 5) return Math.max(base - 1, 2);
  return base;
};

const distressLabel = (level) => {
  if (level === "none")   return "No distress";
  if (level === "mild")   return "Mild distress";
  if (level === "strong") return "Strong distress";
  return level ?? "Unknown";
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,400&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #faf6ef;
    --sand: #f0e8d8;
    --tan: #d4b896;
    --dark: #2c1a0e;
    --sage: #7a9e7e;
    --sage-light: #a8c5ab;
    --sage-dark: #4f7a54;
    --amber: #d4813a;
    --amber-light: #f0a865;
    --red: #c0392b;
    --orange: #e67e22;
    --text: #3d2b1a;
    --text-muted: #8b7355;
    --shadow: 0 4px 24px rgba(44,26,14,0.10);
    --shadow-lg: 0 8px 40px rgba(44,26,14,0.15);
    --radius: 20px;
    --radius-sm: 12px;
  }

  body {
    background: var(--cream);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-weight: 300;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding-bottom: 100px;
  }

  /* ── Onboarding ── */
  .onboarding {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    padding-bottom: 40px;
    display: flex;
    flex-direction: column;
    background: var(--cream);
  }
  .ob-hero {
    background: linear-gradient(160deg, var(--sand) 0%, var(--cream) 60%);
    padding: 52px 28px 28px;
    position: relative;
    overflow: hidden;
  }
  .ob-hero::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 240px; height: 240px;
    background: radial-gradient(circle, rgba(212,184,150,0.4) 0%, transparent 70%);
    border-radius: 50%;
  }
  .ob-hero-emoji { font-size: 56px; margin-bottom: 12px; position: relative; z-index: 1; }
  .ob-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; color: var(--dark); line-height: 1.15; position: relative; z-index: 1; }
  .ob-subtitle { font-size: 15px; color: var(--text-muted); margin-top: 8px; line-height: 1.6; font-weight: 400; position: relative; z-index: 1; }
  .ob-step-indicator { display: flex; gap: 6px; margin-top: 20px; position: relative; z-index: 1; }
  .ob-step-dot { width: 24px; height: 4px; border-radius: 99px; background: var(--tan); transition: background 0.3s; }
  .ob-step-dot.active { background: var(--amber); }
  .ob-step-dot.done   { background: var(--sage); }

  .ob-body { padding: 28px; flex: 1; }
  .ob-question { font-family: 'Fraunces', serif; font-size: 22px; color: var(--dark); margin-bottom: 6px; line-height: 1.3; }
  .ob-hint { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }

  .ob-input {
    width: 100%; padding: 16px 18px;
    background: white; border: 2px solid var(--sand);
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 17px; color: var(--dark);
    outline: none; transition: border-color 0.2s; font-weight: 400;
  }
  .ob-input:focus { border-color: var(--amber); }
  .ob-input::placeholder { color: var(--tan); }

  .ob-options { display: flex; flex-direction: column; gap: 10px; }
  .ob-option {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 18px; background: white; border: 2px solid var(--sand);
    border-radius: var(--radius-sm); cursor: pointer;
    transition: border-color 0.2s, background 0.2s; text-align: left;
  }
  .ob-option:hover { border-color: var(--tan); }
  .ob-option.selected { border-color: var(--amber); background: rgba(212,129,58,0.06); }
  .ob-option-emoji { font-size: 24px; flex-shrink: 0; }
  .ob-option-label { font-size: 15px; color: var(--dark); font-weight: 400; }
  .ob-option-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  .ob-duration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ob-dur-btn {
    padding: 16px 12px; background: white; border: 2px solid var(--sand);
    border-radius: var(--radius-sm); cursor: pointer;
    transition: border-color 0.2s, background 0.2s; text-align: center;
  }
  .ob-dur-btn:hover { border-color: var(--tan); }
  .ob-dur-btn.selected { border-color: var(--amber); background: rgba(212,129,58,0.06); }
  .ob-dur-val { font-family: 'Fraunces', serif; font-size: 22px; color: var(--dark); font-weight: 600; }
  .ob-dur-lbl { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  .ob-footer { padding: 0 28px; }
  .ob-btn-next {
    width: 100%; padding: 18px; background: var(--dark); color: white;
    border: none; border-radius: var(--radius);
    font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 500;
    cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
    box-shadow: 0 4px 20px rgba(44,26,14,0.25);
  }
  .ob-btn-next:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(44,26,14,0.30); }
  .ob-btn-next:disabled { opacity: 0.4; cursor: default; }
  .ob-back-btn {
    background: none; border: none; color: var(--text-muted);
    font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer;
    margin-top: 14px; display: block; width: 100%; text-align: center; padding: 8px;
  }
  .ob-back-btn:hover { color: var(--text); }

  /* ── Header ── */
  .header {
    padding: 44px 24px 18px;
    background: linear-gradient(160deg, var(--sand) 0%, var(--cream) 100%);
    position: relative; overflow: hidden;
  }
  .header::before {
    content: ''; position: absolute;
    top: -40px; right: -40px; width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(212,184,150,0.4) 0%, transparent 70%);
    border-radius: 50%;
  }
  .header-top { display: flex; align-items: flex-start; justify-content: space-between; position: relative; z-index: 1; }
  .app-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; color: var(--dark); line-height: 1.1; }
  .app-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; font-weight: 400; }
  .paw-icon { font-size: 38px; line-height: 1; cursor: pointer; }

  /* ── Goal bar ── */
  .goal-card {
    margin: 0 24px 16px; background: white; border-radius: var(--radius);
    padding: 16px 20px; box-shadow: var(--shadow); position: relative; overflow: hidden;
  }
  .goal-card::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--sage), var(--amber)); opacity: 0.6;
  }
  .goal-label { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .goal-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 500; }
  .goal-pct { font-family: 'Fraunces', serif; font-size: 22px; color: var(--sage-dark); font-weight: 600; }
  .progress-track { height: 10px; background: var(--sand); border-radius: 99px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--sage), var(--sage-light)); border-radius: 99px; transition: width 0.8s cubic-bezier(0.34,1.56,0.64,1); }
  .goal-meta { margin-top: 8px; font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; }

  /* ── Recommendation card ── */
  .rec-card {
    margin: 0 24px 16px;
    background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
    border-radius: var(--radius); padding: 18px 20px; color: white;
    box-shadow: 0 6px 28px rgba(212,129,58,0.30); position: relative; overflow: hidden;
  }
  .rec-card::before {
    content: '🐾'; position: absolute; right: 16px; bottom: -4px;
    font-size: 56px; opacity: 0.15;
  }
  .rec-row { display: flex; gap: 20px; align-items: flex-end; }
  .rec-col { flex: 1; }
  .rec-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; font-weight: 500; margin-bottom: 4px; }
  .rec-value { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 600; line-height: 1; }
  .rec-unit { font-size: 12px; opacity: 0.8; font-weight: 400; }
  .rec-tip { font-size: 12px; opacity: 0.88; margin-top: 12px; line-height: 1.55; font-weight: 400; }

  /* ── Start button ── */
  .btn-start {
    display: block; width: calc(100% - 48px); margin: 0 24px 12px;
    padding: 18px; background: var(--dark); color: white; border: none;
    border-radius: var(--radius); font-family: 'DM Sans', sans-serif;
    font-size: 16px; font-weight: 500; letter-spacing: 0.04em; cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px rgba(44,26,14,0.25);
  }
  .btn-start:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(44,26,14,0.30); }
  .btn-start:active { transform: translateY(0); }

  /* ── Timer screen ── */
  .timer-screen {
    margin: 0 24px; background: white; border-radius: var(--radius);
    padding: 28px 22px; box-shadow: var(--shadow-lg); text-align: center;
    animation: slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  .timer-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 500; margin-bottom: 8px; }
  .timer-target { font-size: 13px; color: var(--text-muted); margin: 8px 0 22px; }
  .timer-target span { color: var(--amber); font-weight: 500; }

  /* 3-outcome buttons */
  .result-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px; }
  .btn-result {
    width: 100%; padding: 15px 16px; border: none; border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
    display: flex; align-items: center; gap: 14px; text-align: left;
  }
  .btn-result .emoji { font-size: 22px; flex-shrink: 0; }
  .btn-result .result-desc { font-size: 11px; opacity: 0.72; margin-top: 1px; font-weight: 300; }
  .btn-none   { background: var(--sage);   color: white; box-shadow: 0 4px 16px rgba(122,158,126,0.35); }
  .btn-mild   { background: var(--orange); color: white; box-shadow: 0 4px 16px rgba(230,126,34,0.30); }
  .btn-strong { background: var(--red);    color: white; box-shadow: 0 4px 16px rgba(192,57,43,0.28); }
  .btn-result:hover { transform: translateY(-2px); }

  .btn-cancel {
    display: block; width: 100%; margin-top: 12px; padding: 12px;
    background: transparent; color: var(--text-muted);
    border: 1.5px solid var(--tan); border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer;
    transition: background 0.15s;
  }
  .btn-cancel:hover { background: var(--sand); }

  /* ── Ring ── */
  .ring-wrap { position: relative; width: 110px; height: 110px; margin: 0 auto 6px; }
  .ring-svg { transform: rotate(-90deg); }
  .ring-bg   { fill: none; stroke: var(--sand); stroke-width: 6; }
  .ring-fill { fill: none; stroke: var(--amber); stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
  .ring-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; }
  .ring-time { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--dark); }
  .ring-sub  { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }

  /* ── Tabs ── */
  .tabs {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 480px;
    background: rgba(250,246,239,0.96); backdrop-filter: blur(12px);
    border-top: 1px solid var(--sand); display: flex; z-index: 100;
  }
  .tab-btn {
    flex: 1; padding: 10px 4px 14px; background: none; border: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: var(--tan); transition: color 0.2s;
    font-family: 'DM Sans', sans-serif; font-size: 9px; font-weight: 500;
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .tab-btn.active { color: var(--amber); }
  .tab-btn svg { width: 20px; height: 20px; }

  /* ── Sections ── */
  .section { padding: 24px; }
  .section-title { font-family: 'Fraunces', serif; font-size: 22px; color: var(--dark); margin-bottom: 16px; }
  .empty-state { text-align: center; padding: 40px 24px; color: var(--text-muted); }
  .empty-state .big { font-size: 48px; margin-bottom: 12px; }
  .empty-state p { font-size: 14px; line-height: 1.6; }

  /* ── History ── */
  .session-item {
    background: white; border-radius: var(--radius-sm); padding: 13px 16px;
    margin-bottom: 9px; box-shadow: 0 2px 12px rgba(44,26,14,0.06);
    display: flex; align-items: center; gap: 12px;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .session-dot { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .dot-none   { background: rgba(122,158,126,0.15); }
  .dot-mild   { background: rgba(230,126,34,0.12); }
  .dot-strong { background: rgba(192,57,43,0.10); }
  .session-info { flex: 1; min-width: 0; }
  .session-dur  { font-weight: 500; font-size: 14px; color: var(--dark); }
  .session-date { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
  .session-badge { font-size: 10px; font-weight: 500; padding: 3px 9px; border-radius: 99px; letter-spacing: 0.03em; white-space: nowrap; flex-shrink: 0; }
  .badge-none   { background: rgba(122,158,126,0.15); color: var(--sage-dark); }
  .badge-mild   { background: rgba(230,126,34,0.12); color: var(--orange); }
  .badge-strong { background: rgba(192,57,43,0.10); color: var(--red); }

  /* ── Stats ── */
  .chart-wrap { background: white; border-radius: var(--radius); padding: 20px 8px 16px; box-shadow: var(--shadow); margin-bottom: 18px; }
  .chart-title { font-family: 'Fraunces', serif; font-size: 15px; color: var(--dark); margin-bottom: 14px; padding-left: 12px; }
  .streak-card {
    background: linear-gradient(135deg, var(--sage-dark) 0%, var(--sage) 100%);
    border-radius: var(--radius); padding: 18px 20px; color: white;
    text-align: center; box-shadow: 0 4px 20px rgba(79,122,84,0.28); margin-bottom: 14px;
  }
  .streak-num   { font-family: 'Fraunces', serif; font-size: 44px; font-weight: 600; line-height: 1; }
  .streak-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-top: 4px; font-weight: 500; }
  .stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
  .stat-card { background: white; border-radius: var(--radius-sm); padding: 14px; text-align: center; box-shadow: var(--shadow); }
  .stat-val { font-family: 'Fraunces', serif; font-size: 26px; color: var(--dark); font-weight: 600; }
  .stat-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; font-weight: 500; }
  .ratio-card { background: white; border-radius: var(--radius-sm); padding: 16px; box-shadow: var(--shadow); margin-bottom: 14px; }
  .ratio-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); font-weight: 500; margin-bottom: 10px; }
  .ratio-bar { height: 12px; border-radius: 99px; overflow: hidden; display: flex; }
  .ratio-good { background: var(--sage);   transition: width 0.6s; }
  .ratio-mild { background: var(--orange); transition: width 0.6s; }
  .ratio-bad  { background: var(--red);    transition: width 0.6s; }
  .ratio-legend { display: flex; gap: 14px; margin-top: 8px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
  .ratio-legend span { display: flex; align-items: center; gap: 5px; }
  .dot12 { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* ── Tips ── */
  .tip-card {
    background: white; border-radius: var(--radius); padding: 18px 20px;
    margin-bottom: 12px; box-shadow: var(--shadow);
    display: flex; gap: 14px; align-items: flex-start;
    animation: fadeIn 0.3s ease;
  }
  .tip-icon  { font-size: 26px; flex-shrink: 0; line-height: 1; margin-top: 2px; }
  .tip-title { font-family: 'Fraunces', serif; font-size: 16px; color: var(--dark); margin-bottom: 5px; }
  .tip-body  { font-size: 13px; color: var(--text-muted); line-height: 1.65; font-weight: 400; }
  .tip-rule {
    background: linear-gradient(135deg, rgba(212,129,58,0.08), rgba(212,129,58,0.03));
    border-left: 3px solid var(--amber);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    padding: 12px 16px; margin-bottom: 10px;
    font-size: 13px; color: var(--text); line-height: 1.6;
  }
  .tip-rule strong { color: var(--amber); }

  /* ── Toast ── */
  .toast {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: var(--dark); color: white;
    padding: 12px 22px; border-radius: 99px; font-size: 14px; z-index: 999;
    animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1), toastOut 0.3s ease 2.7s forwards;
    box-shadow: 0 8px 32px rgba(44,26,14,0.25);
    max-width: 88vw; text-align: center;
  }
  @keyframes toastIn  { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes toastOut { to   { opacity:0; transform:translateX(-50%) translateY(-10px); } }

  .clear-btn { background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; text-decoration: underline; padding: 4px; font-family: 'DM Sans', sans-serif; }
  .clear-btn:hover { color: var(--red); }
  .settings-link { background: none; border: none; color: var(--amber); font-size: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; text-decoration: underline; display: block; text-align: center; padding: 12px; }
  .settings-link:hover { color: var(--dark); }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--tan); border-radius: 99px; }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
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
const TipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
  </svg>
);

// ─── Ring Timer ───────────────────────────────────────────────────────────────
function RingTimer({ elapsed, target }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(elapsed / Math.max(target, 1), 1);
  const offset = circ * (1 - pct);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  return (
    <div className="ring-wrap">
      <svg className="ring-svg" width="110" height="110" viewBox="0 0 110 110">
        <circle className="ring-bg" cx="55" cy="55" r={r} />
        <circle className="ring-fill" cx="55" cy="55" r={r}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ stroke: pct >= 1 ? "var(--sage)" : "var(--amber)" }} />
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
  { value: 1, label: "1–2 times",  sub: "Work from home / rarely leave",     emoji: "🏠" },
  { value: 3, label: "3–4 times",  sub: "Short errands, occasional outings",  emoji: "🚶" },
  { value: 5, label: "5–6 times",  sub: "Regular commute or active lifestyle", emoji: "🚗" },
  { value: 8, label: "7+ times",   sub: "Frequent short trips during the day", emoji: "🏃" },
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
  { value: 1800,  label: "30 min", sub: "Short errands" },
  { value: 2400,  label: "40 min", sub: "Standard goal" },
  { value: 3600,  label: "1 hour", sub: "Longer outings" },
  { value: 7200,  label: "2 hours", sub: "Half workday" },
  { value: 14400, label: "4 hours", sub: "Morning/afternoon" },
  { value: 28800, label: "8 hours", sub: "Full workday" },
];

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName]   = useState("");
  const [leaves, setLeaves] = useState(null);
  const [calm, setCalm]   = useState(null);
  const [goal, setGoal]   = useState(null);

  const totalSteps = 4;
  const canNext = [
    name.trim().length >= 1,
    leaves !== null,
    calm !== null,
    goal !== null,
  ][step];

  const handleNext = () => {
    if (step < totalSteps - 1) { setStep(s => s + 1); }
    else { onComplete({ dogName: name.trim(), leavesPerDay: leaves, currentMaxCalm: calm, goalSeconds: goal }); }
  };

  return (
    <div className="onboarding">
      <div className="ob-hero">
        <div className="ob-hero-emoji">🐾</div>
        <div className="ob-title">PawTimer</div>
        <div className="ob-subtitle">Let's set up your training plan in 4 quick steps.</div>
        <div className="ob-step-indicator">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`ob-step-dot ${i < step ? "done" : i === step ? "active" : ""}`} />
          ))}
        </div>
      </div>

      <div className="ob-body">
        {step === 0 && (
          <>
            <div className="ob-question">What's your dog's name?</div>
            <div className="ob-hint">This personalises everything — messages, tips, and progress will all use their name.</div>
            <input className="ob-input" placeholder="e.g. Luna, Max, Bella…" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && canNext && handleNext()} autoFocus />
          </>
        )}
        {step === 1 && (
          <>
            <div className="ob-question">How often do you leave the house each day?</div>
            <div className="ob-hint">This helps us recommend how many short training sessions to do daily so {name} gets enough practice.</div>
            <div className="ob-options">
              {LEAVE_OPTIONS.map(opt => (
                <button key={opt.value} className={`ob-option ${leaves === opt.value ? "selected" : ""}`} onClick={() => setLeaves(opt.value)}>
                  <span className="ob-option-emoji">{opt.emoji}</span>
                  <div>
                    <div className="ob-option-label">{opt.label}</div>
                    <div className="ob-option-sub">{opt.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="ob-question">How long can {name} currently stay calm alone?</div>
            <div className="ob-hint">We'll start just below this threshold — keeping sessions easy and positive.</div>
            <div className="ob-duration-grid">
              {CALM_DURATIONS.map(d => (
                <button key={d.value} className={`ob-dur-btn ${calm === d.value ? "selected" : ""}`} onClick={() => setCalm(d.value)}>
                  <div className="ob-dur-val">{d.label}</div>
                  <div className="ob-dur-lbl">{d.sub}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="ob-question">What's your final goal for {name}?</div>
            <div className="ob-hint">Training is gradual — there's no rush. You can always change this later.</div>
            <div className="ob-duration-grid">
              {GOAL_DURATIONS.map(d => (
                <button key={d.value} className={`ob-dur-btn ${goal === d.value ? "selected" : ""}`} onClick={() => setGoal(d.value)}>
                  <div className="ob-dur-val">{d.label}</div>
                  <div className="ob-dur-lbl">{d.sub}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ob-footer">
        <button className="ob-btn-next" onClick={handleNext} disabled={!canNext}>
          {step < totalSteps - 1 ? "Continue →" : `Start training with ${name} 🐾`}
        </button>
        {step > 0 && <button className="ob-back-btn" onClick={() => setStep(s => s - 1)}>← Back</button>}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PawTimer() {
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || null; } catch { return null; }
  });
  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });
  const [tab, setTab]       = useState("home");
  const [phase, setPhase]   = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [target, setTarget] = useState(() => {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    const sess = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return suggestNext(sess, s);
  });
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY,  JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { if (settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

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

  const startSession = () => { setElapsed(0); setPhase("running"); };

  const recordResult = (distressLevel) => {
    clearInterval(timerRef.current);
    const session = {
      id: Date.now(),
      date: new Date().toISOString(),
      plannedDuration: target,
      actualDuration: elapsed,
      distressLevel,
      result: distressLevel === "none" ? "success" : "distress",
    };
    const updated = [...sessions, session];
    setSessions(updated);
    const next = suggestNext(updated, settings);
    setTarget(next);
    setPhase("idle");
    setElapsed(0);

    const dog = settings?.dogName ?? "Your dog";
    if (distressLevel === "none")        showToast(`✅ ${dog} was calm! Next: ${fmt(next)}`);
    else if (distressLevel === "mild")   showToast(`⚠️ Mild signs noted — holding at ${fmt(next)}`);
    else                                  showToast(`❤️ Stepping back to ${fmt(next)} — no pressure!`);
  };

  const cancelSession = () => { setPhase("idle"); setElapsed(0); clearInterval(timerRef.current); };

  const handleOnboardingComplete = (data) => {
    setSettings(data);
    const initialTarget = Math.max(Math.round(data.currentMaxCalm * 0.8), 15);
    setTarget(initialTarget);
  };

  // ── Derived values ──
  const dog     = settings?.dogName ?? "Your dog";
  const goalSec = settings?.goalSeconds ?? 2400;
  const goalPct = Math.min((target / goalSec) * 100, 100);
  const recCount = recommendDailyCount(sessions, settings);

  const noneCount   = sessions.filter(s => s.distressLevel === "none").length;
  const mildCount   = sessions.filter(s => s.distressLevel === "mild").length;
  const strongCount = sessions.filter(s => s.distressLevel === "strong").length;
  const totalCount  = sessions.length;
  const bestDuration = sessions.filter(s => s.distressLevel === "none")
    .reduce((m, s) => Math.max(m, s.actualDuration), 0);

  const streak = (() => {
    let n = 0;
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].distressLevel === "none") n++; else break;
    }
    return n;
  })();

  const todayDone = sessions.filter(s => {
    return new Date(s.date).toDateString() === new Date().toDateString() && s.distressLevel === "none";
  }).length;

  const chartData = sessions.slice(-25).map((s, i) => ({
    session: i + 1,
    duration: Math.round(s.actualDuration / 60 * 10) / 10,
    distressLevel: s.distressLevel,
  }));

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    const c = payload.distressLevel === "none" ? "var(--sage)"
            : payload.distressLevel === "mild" ? "var(--orange)" : "var(--red)";
    return <circle cx={cx} cy={cy} r={5} fill={c} stroke="white" strokeWidth={2} />;
  };

  // ── Show onboarding if no settings ──
  if (!settings) return (
    <>
      <style>{styles}</style>
      <Onboarding onComplete={handleOnboardingComplete} />
    </>
  );

  const goalLabel = fmt(goalSec);
  const lastSession = sessions[sessions.length - 1];

  return (
    <>
      <style>{styles}</style>
      {toast && <div className="toast">{toast}</div>}

      <div className="app">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="app-title">PawTimer</div>
              <div className="app-subtitle">Today's training for {dog}</div>
            </div>
            <div className="paw-icon" title="Tap to reset" onClick={() => {
              if (window.confirm("Reset all settings and start over? Sessions will be kept.")) {
                setSettings(null);
              }
            }}>🐕</div>
          </div>
        </div>

        {/* ══════════════ TRAIN TAB ══════════════ */}
        {tab === "home" && (
          <>
            {/* Goal progress */}
            <div className="goal-card">
              <div className="goal-label">
                <span className="goal-title">Goal: {goalLabel}</span>
                <span className="goal-pct">{Math.round(goalPct)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="goal-meta">
                <span>Current: {fmt(target)}</span>
                <span>Target: {goalLabel}</span>
              </div>
            </div>

            {/* Daily recommendation */}
            <div className="rec-card">
              <div className="rec-row">
                <div className="rec-col">
                  <div className="rec-label">Next session</div>
                  <div className="rec-value">{fmt(target)}</div>
                </div>
                <div className="rec-col">
                  <div className="rec-label">Today's sessions</div>
                  <div className="rec-value" style={{ fontSize: 28 }}>
                    {todayDone}
                    <span style={{ fontSize: 17, opacity: 0.7 }}>/{recCount}</span>
                  </div>
                  <div className="rec-unit">recommended</div>
                </div>
              </div>
              <div className="rec-tip">
                {sessions.length === 0
                  ? `Starting below ${dog}'s comfort threshold — building confidence slowly 🐾`
                  : !lastSession || lastSession.distressLevel === "none"
                    ? `Great work! Stepping up gradually — ${dog} is making progress.`
                    : lastSession.distressLevel === "mild"
                      ? `Holding the same duration — consistency builds confidence.`
                      : `Stepping back to keep things positive for ${dog}. No rush!`}
              </div>
            </div>

            {/* Start / Timer */}
            {phase === "idle" && (
              <button className="btn-start" onClick={startSession}>
                ▶ Start Session for {dog}
              </button>
            )}

            {phase === "running" && (
              <div className="timer-screen">
                <div className="timer-label">Leave the room now</div>
                <RingTimer elapsed={elapsed} target={target} />
                <div className="timer-target">Target: <span>{fmt(target)}</span></div>

                <div className="result-grid">
                  <button className="btn-result btn-none" onClick={() => recordResult("none")}>
                    <span className="emoji">✅</span>
                    <div>
                      <div>No Distress</div>
                      <div className="result-desc">{dog} was completely calm</div>
                    </div>
                  </button>
                  <button className="btn-result btn-mild" onClick={() => recordResult("mild")}>
                    <span className="emoji">⚠️</span>
                    <div>
                      <div>Mild Distress</div>
                      <div className="result-desc">Some whining or restlessness</div>
                    </div>
                  </button>
                  <button className="btn-result btn-strong" onClick={() => recordResult("strong")}>
                    <span className="emoji">❌</span>
                    <div>
                      <div>Strong Distress</div>
                      <div className="result-desc">Barking, pacing, or destructive</div>
                    </div>
                  </button>
                </div>
                <button className="btn-cancel" onClick={cancelSession}>Cancel session</button>
              </div>
            )}

            {/* First-time tip */}
            {phase === "idle" && sessions.length === 0 && (
              <div style={{ margin: "16px 24px 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, background: "white", borderRadius: "var(--radius-sm)", padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                <strong style={{ color: "var(--dark)", display: "block", marginBottom: 6 }}>How to train with {dog}:</strong>
                1. Press Start, then calmly leave the room<br />
                2. Return before the timer ends<br />
                3. Log how {dog} did — be honest!<br />
                4. Only increase time when there's zero distress 🐾
              </div>
            )}
          </>
        )}

        {/* ══════════════ HISTORY TAB ══════════════ */}
        {tab === "history" && (
          <div className="section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="section-title">Session History</div>
              {sessions.length > 0 && (
                <button className="clear-btn" onClick={() => {
                  if (window.confirm("Clear all sessions? This cannot be undone.")) {
                    setSessions([]); setTarget(suggestNext([], settings)); showToast("Sessions cleared");
                  }
                }}>Clear all</button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="big">📋</div>
                <p>No sessions yet.<br />Start {dog}'s first training session!</p>
              </div>
            ) : (
              [...sessions].reverse().map((s) => {
                const level = s.distressLevel ?? (s.result === "success" ? "none" : "strong");
                const emoji = level === "none" ? "✅" : level === "mild" ? "⚠️" : "❌";
                return (
                  <div className="session-item" key={s.id}>
                    <div className={`session-dot dot-${level}`}>{emoji}</div>
                    <div className="session-info">
                      <div className="session-dur">
                        {fmt(s.actualDuration)}
                        <span style={{ color: "var(--text-muted)", fontWeight: 300, fontSize: 12 }}> of {fmt(s.plannedDuration)}</span>
                      </div>
                      <div className="session-date">{fmtDate(s.date)}</div>
                    </div>
                    <span className={`session-badge badge-${level}`}>{distressLabel(level)}</span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══════════════ STATS TAB ══════════════ */}
        {tab === "progress" && (
          <div className="section">
            <div className="section-title">{dog}'s Progress</div>

            <div className="streak-card">
              <div className="streak-num">{streak}</div>
              <div className="streak-label">Calm session streak 🔥</div>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-val">{totalCount}</div>
                <div className="stat-lbl">Total sessions</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: "var(--sage-dark)" }}>{noneCount}</div>
                <div className="stat-lbl">No distress</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: "var(--orange)" }}>{mildCount}</div>
                <div className="stat-lbl">Mild distress</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: "var(--red)" }}>{strongCount}</div>
                <div className="stat-lbl">Strong distress</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(bestDuration)}</div>
                <div className="stat-lbl">Best calm time</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(target)}</div>
                <div className="stat-lbl">Next target</div>
              </div>
            </div>

            {totalCount > 0 && (
              <div className="ratio-card">
                <div className="ratio-title">Outcome breakdown</div>
                <div className="ratio-bar">
                  <div className="ratio-good" style={{ width: `${(noneCount / totalCount) * 100}%` }} />
                  <div className="ratio-mild" style={{ width: `${(mildCount / totalCount) * 100}%` }} />
                  <div className="ratio-bad"  style={{ width: `${(strongCount / totalCount) * 100}%` }} />
                </div>
                <div className="ratio-legend">
                  <span><div className="dot12" style={{ background: "var(--sage)" }} />{noneCount} calm</span>
                  <span><div className="dot12" style={{ background: "var(--orange)" }} />{mildCount} mild</span>
                  <span><div className="dot12" style={{ background: "var(--red)" }} />{strongCount} strong</span>
                </div>
              </div>
            )}

            <div className="goal-card" style={{ margin: "0 0 14px" }}>
              <div className="goal-label">
                <span className="goal-title">Progress toward goal</span>
                <span className="goal-pct">{Math.round(goalPct)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="goal-meta">
                <span>{dog} is at {fmt(target)}</span>
                <span>Goal: {goalLabel}</span>
              </div>
            </div>

            {chartData.length > 1 ? (
              <div className="chart-wrap">
                <div className="chart-title">Session duration over time (min)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 24, left: -14, bottom: 5 }}>
                    <CartesianGrid stroke="var(--sand)" vertical={false} />
                    <XAxis dataKey="session" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--dark)", border: "none", borderRadius: 10, color: "white", fontSize: 12 }}
                      labelStyle={{ color: "var(--tan)" }}
                      formatter={(v, n, p) => [`${v}m — ${distressLabel(p.payload.distressLevel)}`, "Duration"]}
                    />
                    <ReferenceLine y={goalSec / 60} stroke="var(--sage)" strokeDasharray="4 4"
                      label={{ value: "Goal", position: "right", fontSize: 10, fill: "var(--sage-dark)" }} />
                    <Line type="monotone" dataKey="duration" stroke="var(--amber)" strokeWidth={2.5}
                      dot={<CustomDot />} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                  <span><span style={{ color: "var(--sage)" }}>●</span> Calm</span>
                  <span><span style={{ color: "var(--orange)" }}>●</span> Mild</span>
                  <span><span style={{ color: "var(--red)" }}>●</span> Strong</span>
                  <span><span style={{ color: "var(--amber)" }}>—</span> Duration</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="big">📈</div>
                <p>Complete at least 2 sessions to see {dog}'s progress chart.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TIPS TAB ══════════════ */}
        {tab === "tips" && (
          <div className="section">
            <div className="section-title">Training Principles</div>

            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              Evidence-based principles for separation anxiety training. Keep these in mind every session.
            </div>

            <div className="tip-rule"><strong>Golden Rule:</strong> If {dog} shows any distress, you've gone too far. Always stay below the threshold.</div>
            <div className="tip-rule"><strong>Positive ratio:</strong> Aim for many more calm sessions than distressing ones — 5:1 or better.</div>
            <div className="tip-rule"><strong>Progress isn't linear.</strong> Hard days happen. On a hard day, hold or go back — never push forward.</div>

            {[
              {
                emoji: "🎯",
                title: "Stay below the threshold",
                body: `Every session should end before ${dog} shows distress. If you see ANY sign of anxiety — whining, staring at the door, pacing — you've stayed too long. End while they're still calm.`,
              },
              {
                emoji: "🔁",
                title: "Many small reps beat one long session",
                body: `4–6 short, successful sessions per day are far better than one long stressful one. Each calm experience builds ${dog}'s confidence and slowly rewires their emotional response to being alone.`,
              },
              {
                emoji: "📉",
                title: "Distress means going backward",
                body: `If ${dog} shows strong distress, don't just hold the same time — actively step back to the last duration that worked. Solid foundations are built faster than progress layered on top of anxiety.`,
              },
              {
                emoji: "⚠️",
                title: "Mild distress: hold, don't push",
                body: `Mild signs (a little whining, slight restlessness) mean you're right at the edge. Don't increase yet. Stay at this duration until ${dog} is reliably calm, then take a small step forward.`,
              },
              {
                emoji: "🚶",
                title: "Keep departures and arrivals low-key",
                body: `No big goodbyes, no excited greetings. This helps ${dog} learn that your leaving is a normal, unremarkable event — not something to panic about. Neutral energy is the goal.`,
              },
              {
                emoji: "📅",
                title: "Train every single day",
                body: `Consistency matters enormously. Even 10 minutes of short daily sessions creates faster progress than intensive weekend-only training. Build it into your routine like a walk.`,
              },
              {
                emoji: "🌡️",
                title: "Watch for subtle distress signs",
                body: `Distress isn't only barking. Watch for: yawning, lip-licking, excessive sniffing, not settling, following you to the door, or staring. These are early signs — catch them before they escalate.`,
              },
              {
                emoji: "💛",
                title: "You're doing great",
                body: `Separation anxiety training is one of the most challenging things to work on, but also one of the most rewarding. ${dog} is lucky to have someone this dedicated. Trust the process — it works.`,
              },
            ].map((tip) => (
              <div className="tip-card" key={tip.title}>
                <div className="tip-icon">{tip.emoji}</div>
                <div>
                  <div className="tip-title">{tip.title}</div>
                  <div className="tip-body">{tip.body}</div>
                </div>
              </div>
            ))}

            <button className="settings-link" onClick={() => {
              if (window.confirm("Re-run the setup wizard? Settings will reset but sessions are kept.")) {
                setSettings(null);
              }
            }}>
              ✏️ Edit {dog}'s settings
            </button>
          </div>
        )}

      </div>

      {/* ── Tab Bar ── */}
      <div className="tabs">
        {[
          { id: "home",     label: "Train",   icon: <HomeIcon /> },
          { id: "history",  label: "History", icon: <HistoryIcon /> },
          { id: "progress", label: "Stats",   icon: <ChartIcon /> },
          { id: "tips",     label: "Tips",    icon: <TipIcon /> },
        ].map((t) => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
