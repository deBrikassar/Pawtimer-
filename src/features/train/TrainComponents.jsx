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
        {isRunning ? "End and save" : "Start session"}
      </button>
      <button
        className="session-cancel-btn button-base button-ghost button--md button--pill"
        onClick={onCancel}
        aria-hidden={!isRunning}
        tabIndex={isRunning ? 0 : -1}
      >
        Cancel (don&apos;t save)
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
    ? "Paused"
    : displayState === "success"
      ? "Complete"
      : displayState === "active"
        ? "In session"
        : "Ready";

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
  const thumbPosition = Math.max(Math.min(clampedGoalPct, 98), 2);

  return (
    <div className="prog-section surface-card surface-card--progress">
      <div className="prog-track-wrap">
        <svg className="prog-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
          <rect className="prog-fill-track" x="0" y="0" width="100" height="8" rx="4" ry="4" />
          <rect className="prog-fill" x="0" y="0" width={clampedGoalPct} height="8" rx="4" ry="4" />
          <circle className="prog-thumb" cx={thumbPosition} cy="4" r="1.65" />
        </svg>
      </div>
      <div className="prog-meta">
        <span>Current target <strong className="num-stable">{fmt(target)}</strong></span>
        <span>Goal <strong className="num-stable">{fmt(goalSec)}</strong></span>
      </div>
    </div>
  );
}

export function SessionRatingPanel({
  phase,
  finalElapsed,
  name,
  recordResult,
  onCancel,
  fmt,
  Img,
}) {
  if (phase !== "rating") return null;

  return (
    <div className="rating-overlay" role="presentation">
      <div className="rating-screen session-feedback modal-card modal-card--dialog-md rating-sheet" role="dialog" aria-modal="true" aria-labelledby="session-rating-title" aria-describedby="session-rating-sub">
        <div className="rating-sheet-grabber" aria-hidden="true" />
        <div className="rating-title" id="session-rating-title">How did {name} do?</div>
        <div className="rating-sub" id="session-rating-sub">
          {fmt(finalElapsed)} with {name}. Your rating tunes the next step.
        </div>
        <div className="result-grid">
          <button className="btn-result btn-none" onClick={() => recordResult("none")}>
            <Img src="result-calm.png" size={36} alt="No stress"/>
            <div><div>Calm</div><div className="result-desc">Relaxed throughout</div></div>
          </button>
          <button className="btn-result btn-mild" onClick={() => recordResult("subtle")}>
            <Img src="result-mild.png" size={36} alt="Slight stress"/>
            <div><div>Some stress</div><div className="result-desc">Mild signs, recovered</div></div>
          </button>
          <button className="btn-result btn-strong" onClick={() => recordResult("active")}>
            <Img src="result-strong.png" size={36} alt="Strong stress"/>
            <div><div>High stress</div><div className="result-desc">Clear stress signs; next rep should be easier</div></div>
          </button>
        </div>
        <p className="rating-adapt-note" role="status">
          We use this to keep the pace gentle and dog-friendly.
        </p>
        <button className="session-cancel-btn button-base button-ghost button--md button--block" onClick={onCancel}>
          Delete this rep
        </button>
      </div>
    </div>
  );
}
