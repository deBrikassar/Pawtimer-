import { useState } from "react";
import { ViewportModal } from "../app/ui";

function SessionActionRow({ onEnd, onCancel }) {
  return (
    <div className="session-actions is-running">
      <button className="session-end-btn button-base button-primary button--md button--pill" onClick={onEnd}>End Session</button>
      <button className="session-cancel-btn button-base button-ghost button--md button--pill" onClick={onCancel}>Cancel (don't save)</button>
    </div>
  );
}

export function SessionControl({
  phase,
  elapsed,
  target,
  onStart,
  onEnd,
  onCancel,
  completed,
  fmt,
  canStart = true,
  startBlockedMessage = "Session limit reached for today.",
}) {
  const [pressing, setPressing] = useState(false);
  const overTargetSeconds = Math.max(elapsed - target, 0);
  const radius = 103;
  const circumference = 2 * Math.PI * radius;
  const frac = Math.min(elapsed / Math.max(target, 1), 1);
  const isRunning = phase === "running";
  const isIdle = phase === "idle";
  const isPastTarget = elapsed > target;

  const startWithFeedback = () => {
    if (!onStart || !canStart) return;
    setPressing(true);
    setTimeout(() => {
      setPressing(false);
      onStart();
    }, 120);
  };

  return (
    <>
      {phase !== "rating" && (<div className="session-control-wrap">
        <div
          className={`session-control ${isRunning ? "is-running" : ""} ${pressing ? "is-pressing" : ""} ${completed ? "is-complete" : ""} ${isPastTarget ? "is-over-target" : ""}`}
          aria-hidden="true"
        >
          <svg className="sc-ring-svg" viewBox="0 0 226 226" aria-hidden="true">
            <circle className="sc-track" cx="113" cy="113" r={radius} />
            <circle
              className={`sc-progress ${isRunning || completed ? "" : "is-dim"}`.trim()}
              cx="113"
              cy="113"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - frac)}
            />
          </svg>

          <div className="sc-content">
            <div className="sc-dog-hero" aria-hidden="true">
              <img src="/icons/dog-base.svg" alt="" />
            </div>
          </div>
        </div>

        <div className="session-panel surface-card">
          <div className="session-panel__eyebrow">SESSION TIME</div>
          <div className="session-panel__time">{isRunning ? `${fmt(elapsed)} / ${fmt(target)}` : fmt(target)}</div>
          {!isRunning && <div className="session-panel__plan">Planned duration: {fmt(target)}</div>}
          {isRunning && (
            <div className="session-panel__progress" aria-hidden="true">
              <span className="session-panel__progress-fill" style={{ width: `${Math.min(frac, 1) * 100}%` }} />
            </div>
          )}
          {isRunning && isPastTarget && <div className="session-panel__over">+{fmt(overTargetSeconds)} over target</div>}

          {isIdle ? (
            <>
              <button
                className="session-start-btn button-base button-primary button--md button--pill"
                onClick={canStart ? startWithFeedback : undefined}
                disabled={!canStart}
                aria-label={canStart ? `Start ${fmt(target)} session` : startBlockedMessage}
              >
                Start session
              </button>
              <p className="session-panel__helper">{canStart ? "Recommended next session" : startBlockedMessage}</p>
            </>
          ) : (
            <SessionActionRow onEnd={onEnd} onCancel={onCancel} />
          )}
        </div>
      </div>)}
    </>
  );
}


export function TrainProgressBar({ goalPct, target, goalSec, fmt }) {
  const clampedGoalPct = Math.max(0, Math.min(goalPct, 100));
  const thumbPct = Math.max(Math.min(clampedGoalPct, 98), 2);

  return (
    <div className="prog-section surface-card surface-card--progress">
      <div className="prog-track-wrap">
        <svg className="prog-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
          <rect className="prog-fill-track" x="0" y="0" width="100" height="8" rx="4" ry="4" />
          <rect className="prog-fill" x="0" y="0" width={clampedGoalPct} height="8" rx="4" ry="4" />
        </svg>
        <span className="prog-thumb" style={{ left: `${thumbPct}%` }} aria-hidden="true" />
      </div>
      <div className="prog-meta">
        <span>Threshold <strong className="num-stable">{fmt(target)}</strong></span>
        <span>Goal <strong className="num-stable">{fmt(goalSec)}</strong></span>
      </div>
    </div>
  );
}

export function SessionRatingPanel({
  phase,
  finalElapsed,
  name,
  sessionOutcome,
  setSessionOutcome,
  recordResult,
  latencyDraft,
  setLatencyDraft,
  distressTypeDraft,
  setDistressTypeDraft,
  onCancel,
  fmt,
  distressTypes,
}) {
  if (phase !== "rating") return null;

  return (
    <ViewportModal open onClose={onCancel} overlayClassName="rating-overlay" labelledBy="session-rating-title">
      <div className="rating-screen session-feedback modal-card modal-card--dialog-md">
        <div className="rating-scroll-body">
          <div className="rating-title" id="session-rating-title">Was there any stress?</div>
          <div className="rating-sub">
            {fmt(finalElapsed)} session — how did {name} handle it?
          </div>
          <div className="result-list" role="radiogroup" aria-label="Stress rating">
            <button
              className={`result-option result-option--none ${sessionOutcome === "none" ? "is-selected" : ""}`.trim()}
              onClick={() => { setSessionOutcome("none"); recordResult("none"); }}
              role="radio"
              aria-checked={sessionOutcome === "none"}
            >
              <span className="result-option__radio" aria-hidden="true">{sessionOutcome === "none" ? "✓" : ""}</span>
              <span className="result-option__text">
                <span className="result-option__title">No distress</span>
                <span className="result-option__subtitle">{name} was completely calm</span>
              </span>
            </button>
            <button
              className={`result-option result-option--subtle ${sessionOutcome === "subtle" ? "is-selected" : ""}`.trim()}
              onClick={() => setSessionOutcome("subtle")}
              role="radio"
              aria-checked={sessionOutcome === "subtle"}
            >
              <span className="result-option__radio" aria-hidden="true">{sessionOutcome === "subtle" ? "✓" : ""}</span>
              <span className="result-option__text">
                <span className="result-option__title">Subtle stress</span>
                <span className="result-option__subtitle">Mild/passive signs (restless, lip licking, etc.)</span>
              </span>
            </button>
            <button
              className={`result-option result-option--active ${sessionOutcome === "active" ? "is-selected" : ""}`.trim()}
              onClick={() => setSessionOutcome("active")}
              role="radio"
              aria-checked={sessionOutcome === "active"}
            >
              <span className="result-option__radio" aria-hidden="true">{sessionOutcome === "active" ? "✓" : ""}</span>
              <span className="result-option__text">
                <span className="result-option__title">Active distress</span>
                <span className="result-option__subtitle">Barking, pacing, unable to settle</span>
              </span>
            </button>
            <button
              className={`result-option result-option--severe ${sessionOutcome === "severe" ? "is-selected" : ""}`.trim()}
              onClick={() => setSessionOutcome("severe")}
              role="radio"
              aria-checked={sessionOutcome === "severe"}
            >
              <span className="result-option__radio" aria-hidden="true">{sessionOutcome === "severe" ? "✓" : ""}</span>
              <span className="result-option__text">
                <span className="result-option__title">Severe distress</span>
                <span className="result-option__subtitle">Panic, escape attempt, major breakdown</span>
              </span>
            </button>
          </div>
          <button className="button-base button-ghost button--md rating-inline-cancel" onClick={onCancel}>
            Cancel
          </button>
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
                {distressTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button
                className="btn-save-outcome button-base button-primary button--md button--block"
                onClick={() => recordResult(sessionOutcome, {
                  latencyToFirstDistress: latencyDraft,
                  distressType: distressTypeDraft || null,
                })}
              >
                Save session
              </button>
            </div>
          )}
        </div>
      </div>
    </ViewportModal>
  );
}
