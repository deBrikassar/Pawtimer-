import { useState } from "react";
import { ViewportModal } from "../app/ui";

function SessionActionRow({ onEnd, onCancel }) {
  return (
    <div className="session-actions session-actions--sheet">
      <button className="session-end-btn button-base button-primary button--md button--pill" onClick={onEnd}>End session</button>
      <button className="session-cancel-btn button-base button-ghost button--md button--pill" onClick={onCancel}>Cancel (don&apos;t save)</button>
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
  const remaining = Math.max(target - elapsed, 0);
  const remainingSeconds = Math.max(Math.ceil(remaining), 0); // kept for aria copy
  const overTargetSeconds = Math.max(elapsed - target, 0); // kept for aria copy
  const frac = Math.min(elapsed / Math.max(target, 1), 1);
  const isRunning = phase === "running";
  const isIdle = phase === "idle";
  const displayElapsed = Math.max(0, Math.floor(elapsed));

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
      {phase !== "rating" && (
        <div className="session-control-wrap">
          <section className="train-hero" aria-hidden="true">
            <div className="train-hero__dog">
              <svg viewBox="0 0 120 120" width="108" height="108" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g className="train-hero__line">
                  <path d="M20 95h57c0-2.9-2.3-5.2-5.2-5.2h-7.6l4.5-6.8c3.7-5.6 1.1-13.1-5.1-15.2-4.8-1.6-10.1.3-12.9 4.5l-2.3 3.6V95H30.2l-1.7-4.9A25.8 25.8 0 0 1 33 64l20.5-22.4a17.7 17.7 0 0 0 4.5-14.6c-.9-5.4 1.8-10.8 6.7-13.2L71 28.3 78 14c2.6 0 4.8 2 5.2 4.6l1.3 8.6c4.5 1.2 8.4 3.9 11.4 7.5 3.8 4.6 9.7 6.6 15.5 5.5l5.9-1.1a7.4 7.4 0 0 1-5.6 8.8L99.6 51a5.5 5.5 0 0 0-4.3 6.5l2.2 9.6c1.1 4.8-.8 9.8-4.8 12.7l-7.5 5.5V95h13.6c0-2.9-2.3-5.2-5.2-5.2" />
                  <path d="M17.8 95c-8.9 0-16-7.2-16-16 0-6.7 2.4-12.2 7.2-16.5 2.3-2.1 3.6-5.1 3.6-8.3v-2.3c5.2 0 10.1 2.3 13.3 6.3 2 2.5 3.1 5.6 3.1 8.8" />
                </g>
              </svg>
            </div>
            <p className="train-hero__title">Ready to focus?</p>
            <p className="train-hero__copy">Short, consistent sessions make the biggest difference.</p>
          </section>

          <section className="session-sheet surface-card" aria-live={isRunning ? "polite" : undefined}>
            {!isRunning ? (
              <>
                <div className="session-sheet__time-block">
                  <div className="session-sheet__label">Session time</div>
                  <div className="session-sheet__planned num-stable">{fmt(target)}</div>
                </div>
                <button
                  className={`session-sheet__cta button-base button-primary button--md button--pill ${pressing ? "is-pressing" : ""}`}
                  onClick={isIdle && canStart ? startWithFeedback : undefined}
                  disabled={!canStart}
                  aria-label={canStart ? `Start ${fmt(target)} session` : startBlockedMessage}
                >
                  Start session
                </button>
                <p className="session-sheet__helper">Recommended next session</p>
              </>
            ) : (
              <>
                <div className="session-sheet__time-block">
                  <div className="session-sheet__label">Session time</div>
                  <div className="session-sheet__elapsed num-stable">{fmt(displayElapsed)} / {fmt(target)}</div>
                </div>
                <div className="session-sheet__progress" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
                  <span className="session-sheet__progress-fill" style={{ width: `${Math.max(0, Math.min(frac * 100, 100))}%` }} />
                </div>
                <SessionActionRow onEnd={onEnd} onCancel={onCancel} />
              </>
            )}
          </section>
          {isRunning && overTargetSeconds > 0 && (
            <p className="session-action-meta">+{fmt(overTargetSeconds)} over planned duration.</p>
          )}
          {!isRunning && !canStart && (
            <p className="session-action-meta">{startBlockedMessage}</p>
          )}
          {!isRunning && canStart && (
            <p className="session-action-meta">Planned duration stays visible before you begin.</p>
          )}
          <div className="sr-only" aria-live={isRunning ? "polite" : undefined}>
            {isRunning
              ? (elapsed > target
                ? `${fmt(overTargetSeconds)} over target in current session`
                : `${fmt(remainingSeconds)} remaining in current session`)
              : ""}
          </div>
        </div>
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
    <ViewportModal open onClose={onCancel} overlayClassName="rating-overlay" labelledBy="session-rating-title">
      <div className="rating-screen session-feedback modal-card modal-card--dialog-md">
        <div className="rating-scroll-body">
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
          <button className="button-base button-ghost button--md button--block rating-inline-cancel" onClick={onCancel}>
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
