import { useState } from "react";

function SessionActionRow({ onEnd, onCancel }) {
  return (
    <div className="session-actions">
      <button className="session-end-btn button-base button-primary button--md button--pill" onClick={onEnd}>End Session</button>
      <button className="session-cancel-btn secondary-control secondary-control--modal" onClick={onCancel}>Cancel (don't save)</button>
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
}) {
  const [pressing, setPressing] = useState(false);
  const remaining = Math.max(target - elapsed, 0);
  const remainingSeconds = Math.max(Math.ceil(remaining), 0);
  const overTargetSeconds = Math.max(elapsed - target, 0);
  const radius = 103;
  const circumference = 2 * Math.PI * radius;
  const frac = Math.min(elapsed / Math.max(target, 1), 1);
  const isRunning = phase === "running";
  const isIdle = phase === "idle";
  const isPastTarget = elapsed > target;
  const timerValue = isRunning ? elapsed : remainingSeconds;

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
          className={`session-control ${isRunning ? "is-running" : ""} ${pressing ? "is-pressing" : ""} ${completed ? "is-complete" : ""} ${isPastTarget ? "is-over-target" : ""}`}
          onClick={isIdle ? startWithFeedback : undefined}
          aria-label={isRunning
            ? (isPastTarget
              ? `${fmt(overTargetSeconds)} over target in current session`
              : `${fmt(remainingSeconds)} remaining in current session`)
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
              <div className="sc-time-value">{fmt(timerValue)}</div>
              {isPastTarget && <div className="sc-over-target">+{fmt(overTargetSeconds)} over target</div>}
            </div>
          </div>
        </button>
      </div>)}

      {isRunning && <SessionActionRow onEnd={onEnd} onCancel={onCancel} />}
    </>
  );
}


export function TrainProgressBar({ goalPct, target, goalSec, fmt }) {
  return (
    <div className="prog-section">
      <div className="prog-track">
        <div className="prog-fill" style={{ width:`${goalPct}%` }}/>
        <div className="prog-thumb" style={{ left:`${Math.max(Math.min(goalPct,98),2)}%` }}/>
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
  Img,
  distressTypes,
}) {
  if (phase !== "rating") return null;

  return (
    <div className="rating-overlay" role="presentation">
      <div className="rating-screen session-feedback modal-card modal-card--dialog-md" role="dialog" aria-modal="true" aria-labelledby="session-rating-title">
        <div className="rating-title" id="session-rating-title">Was there any stress?</div>
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
        <button className="btn-cancel secondary-control secondary-control--modal" onClick={onCancel}>
          Discard this session
        </button>
      </div>
    </div>
  );
}
