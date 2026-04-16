import { useState } from "react";

function SessionActionRow({
  isRunning,
  canStart,
  onStart,
  onEnd,
  onCancel,
  onIdlePress,
  startBlockedMessage,
}) {
  const canRunStart = canStart && Boolean(onStart);
  const canExplain = !canRunStart && Boolean(onIdlePress);
  const handlePrimary = () => {
    if (isRunning) {
      onEnd?.();
      return;
    }
    if (canRunStart) {
      onStart?.();
      return;
    }
    if (canExplain) onIdlePress?.();
  };

  return (
    <div className={`session-actions ${isRunning ? "is-running" : "is-idle"}`}>
      <button
        className="session-primary-btn button-base button-primary button--md button--pill"
        onClick={handlePrimary}
        disabled={!isRunning && !canRunStart && !canExplain}
      >
        {isRunning ? "End and save session" : "Start calm session"}
      </button>
      <button
        className="session-cancel-btn button-base button-ghost button--md button--pill"
        onClick={onCancel}
        aria-hidden={!isRunning}
        tabIndex={isRunning ? 0 : -1}
      >
        Cancel session (don&apos;t save)
      </button>
      {!isRunning && !canStart && (
        <p className="session-action-meta" role="status">{startBlockedMessage}</p>
      )}
    </div>
  );
}

export function SessionControl({
  phase,
  elapsed,
  target,
  name = "your dog",
  onStart,
  onEnd,
  onCancel,
  completed,
  fmt,
  canStart = true,
  startBlockedMessage = "Session limit reached for today.",
  allowIdlePress = true,
  onIdlePress,
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
  const timerValue = isRunning ? remainingSeconds : target;
  const displayState = !canStart && isIdle
    ? "warning"
    : completed
      ? "success"
      : isRunning
        ? "active"
        : "idle";
  const innerCaption = displayState === "warning"
    ? "Calm practice is paused for today"
    : displayState === "success"
      ? `${name} hit this calm target`
      : displayState === "active"
        ? isPastTarget
          ? `Past target — end while ${name} is still settled`
          : `${name}'s calm hold for this rep`
        : `Next calm session target for ${name}`;
  const helperCaption = displayState === "active"
    ? (isPastTarget ? `+${fmt(overTargetSeconds)} calm hold` : `${fmt(elapsed)} completed this rep`)
    : displayState === "warning"
      ? "Come back tomorrow for the next rep"
      : "Builds comfort with short solo reps";

  const startWithFeedback = () => {
    if (!onStart || !canStart) return;
    setPressing(true);
    setTimeout(() => {
      setPressing(false);
      onStart();
    }, 120);
  };

  const idleCanStart = allowIdlePress && canStart && Boolean(onStart);
  const idleCanExplain = !idleCanStart && Boolean(onIdlePress);
  const idleCanPress = idleCanStart || idleCanExplain;
  const handleIdlePress = () => {
    if (idleCanStart) {
      startWithFeedback();
      return;
    }
    if (idleCanExplain) onIdlePress();
  };

  return (
    <>
      {phase !== "rating" && (<div className="session-control-wrap">
        <button
          className={`session-control state-${displayState} ${isRunning ? "is-running" : ""} ${pressing ? "is-pressing" : ""} ${completed ? "is-complete" : ""} ${isPastTarget ? "is-over-target" : ""}`}
          onClick={isIdle && idleCanPress ? handleIdlePress : undefined}
          disabled={isIdle && !idleCanPress}
          aria-label={isRunning
            ? (isPastTarget
              ? `${fmt(overTargetSeconds)} over target in current session`
              : `${fmt(remainingSeconds)} remaining in current session`)
            : idleCanStart
              ? `Start ${fmt(target)} session`
              : idleCanExplain
                ? `Explain ${fmt(target)} session target`
                : canStart ? `Ready for ${fmt(target)} session` : startBlockedMessage}
          aria-live={isRunning ? "polite" : undefined}
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
            <div className="sc-time">
              <div className="sc-time-value">{fmt(timerValue)}</div>
              <div className="sc-caption">{innerCaption}</div>
              <div className="sc-support">{helperCaption}</div>
              <div className={`sc-state-chip ${isRunning ? "is-running" : ""}`}>
                {isRunning ? `Session live · ${fmt(elapsed)} elapsed` : "Ready when you are"}
              </div>
            </div>
          </div>
        </button>
      </div>)}

      {phase !== "rating" && (
        <SessionActionRow
          isRunning={isRunning}
          canStart={canStart}
          onStart={startWithFeedback}
          onEnd={onEnd}
          onCancel={onCancel}
          onIdlePress={onIdlePress}
          startBlockedMessage={startBlockedMessage}
        />
      )}
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
        <button className="session-cancel-btn button-base button-ghost button--md button--block" onClick={onCancel}>
          Discard this session
        </button>
      </div>
    </div>
  );
}
