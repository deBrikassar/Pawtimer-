import { useCallback, useEffect, useRef, useState } from "react";
import { ViewportModal } from "../app/ui";
import { ContextHint } from "../../components/primitives/Primitives";
import { useHint } from "../app/useHint";

function SessionActionRow({ onCancel }) {
  return (
    <div className="session-actions is-running">
      <button className="session-cancel-btn button-base button-ghost button--md button--pill" onClick={onCancel}>Interrupted (Dog barked)</button>
    </div>
  );
}

/* ── Odometer digit component ── */
function OdometerDigit({ char, index }) {
  const [isChanging, setIsChanging] = useState(false);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    
    setIsChanging(true);
    const t = setTimeout(() => setIsChanging(false), 300);
    return () => clearTimeout(t);
  }, [char]);

  return (
    <span
      className={`sc-odometer-digit ${isChanging ? "is-changing" : ""}`}
      key={index}
    >
      {char}
    </span>
  );
}

function OdometerTime({ value }) {
  const chars = value.split("");
  return (
    <div className="sc-time-value">
      {chars.map((ch, i) => (
        <OdometerDigit char={ch} index={i} key={i} />
      ))}
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
  const triggerLockRef = useRef(false);
  const btnRef = useRef(null);
  const overTargetSeconds = Math.max(elapsed - target, 0);
  const radius = 103;
  const circumference = 2 * Math.PI * radius;
  const frac = Math.min(elapsed / Math.max(target, 1), 1);
  const isRunning = phase === "running";
  const isIdle = phase === "idle";
  const isPastTarget = elapsed > target;
  const isDogInteractive = isIdle ? canStart : isRunning;

  /* ── Tilt effect ── */
  const handlePointerMove = useCallback((e) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5 → 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const tiltX = -(y * 6);  // max 3deg
    const tiltY = x * 6;
    btn.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.01)`;
  }, []);

  const handlePointerLeave = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    btn.style.transform = "";
  }, []);

  const runDogAction = () => {
    if (triggerLockRef.current) return;
    if (isIdle && (!onStart || !canStart)) return;
    if (isRunning && !onEnd) return;
    triggerLockRef.current = true;
    setPressing(true);

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(isIdle ? [30] : [20, 50, 20]);
    }

    setTimeout(() => {
      setPressing(false);
      if (isIdle) onStart();
      if (isRunning) onEnd();
      triggerLockRef.current = false;
    }, 120);
  };

  /* ── Tick-based progress ring ── */
  const tickCount = 80;
  const tickGap = 2.5;
  const tickLen = (circumference - tickCount * tickGap) / tickCount;
  const tickDasharray = `${tickLen} ${tickGap}`;
  const filledLength = frac * circumference;

  return (
    <>
      <div className="session-control-wrap" aria-hidden={phase === "rating"}>
        <div className="sc-button-container">
          <button
            ref={btnRef}
            type="button"
            className={`session-control ${isIdle ? "is-idle" : ""} ${isRunning ? "is-running is-active" : ""} ${pressing ? "is-pressing" : ""} ${completed ? "is-complete" : ""} ${isPastTarget ? "is-over-target" : ""}`.trim()}
            onClick={isDogInteractive ? runDogAction : undefined}
            disabled={!isDogInteractive}
            aria-label={isRunning ? "End training session" : "Start training session"}
            onPointerMove={isDogInteractive ? handlePointerMove : undefined}
            onPointerLeave={handlePointerLeave}
          >
          <svg className="sc-ring-svg" viewBox="0 0 226 226" aria-hidden="true">
            <circle className="sc-track" cx="113" cy="113" r={radius}
              strokeDasharray={tickDasharray} />
            <circle
              className={`sc-progress ${isRunning || completed ? "" : "is-dim"}`.trim()}
              cx="113"
              cy="113"
              r={radius}
              strokeDasharray={tickDasharray}
              strokeDashoffset={circumference - filledLength}
            />
          </svg>
          <div className="sc-content">
            <svg className="sc-watermark" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', width: '50%', height: '50%', opacity: 0.04, pointerEvents: 'none' }}>
              <path fill="currentColor" d="M12 11.5c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5zm5.5-2.5c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5zM6.5 9c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5zm3.5-5.5c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5zm4 0c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5z" />
            </svg>
            <div className="sc-time" style={{ position: 'relative', zIndex: 1 }}>
              {isRunning && isPastTarget && <div className="session-panel__over">+{fmt(overTargetSeconds)}</div>}
              <OdometerTime value={isRunning ? fmt(Math.max(0, target - elapsed)) : fmt(target)} />
              <div className="session-panel__eyebrow">{completed ? "GOOD DOG!" : (isRunning ? "ZEN MODE" : "Home alone")}</div>
            </div>
          </div>

          {/* Ripple waves — moved inside button to guarantee perfect centering */}
          <div className="sc-ripple" aria-hidden="true"></div>
          <div className="sc-ripple" aria-hidden="true"></div>
          <div className="sc-ripple" aria-hidden="true"></div>
        </button>
      </div>

      {!isIdle && (
        <div className="session-panel">
          <SessionActionRow onCancel={onCancel} />
        </div>
      )}
      </div>
    </>
  );
}



export function TrainProgressBar({ goalPct, target, goalSec, fmt, elapsed = 0, phase = "idle" }) {
  const thresholdPct = Math.max(0, Math.min(goalPct, 100));
  const isActive = phase === "running" || phase === "rating";
  const progressPct = goalSec > 0 ? Math.max(0, Math.min((elapsed / goalSec) * 100, 100)) : 0;
  const activePct = isActive ? progressPct : thresholdPct;

  return (
    <div className="prog-section surface-card surface-card--progress" style={{ overflow: 'visible', padding: '16px' }}>
      <div className="neumorphic-track-wrap" style={{ margin: '16px 0' }}>
        <div className="neumorphic-track-fill" style={{ width: `${activePct}%` }}></div>
        <div 
          className="neumorphic-thumb neumorphic-thumb--paw" 
          style={{ 
            left: `${activePct}%`, 
            transform: `translate(-50%, -50%)` 
          }} 
          aria-hidden="true"
        >
          <div className="neumorphic-thumb-icon" aria-label="Paw logo"></div>
        </div>
      </div>
      <div className="prog-meta" style={{ marginTop: '24px' }}>
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
  const distressHint = useHint(`rating_${name}`);

  if (phase !== "rating") return null;

  return (
    <ViewportModal open onClose={onCancel} overlayClassName="rating-overlay" labelledBy="session-rating-title">
      <div className="rating-screen session-feedback modal-card modal-card--dialog-md">
        <div className="rating-scroll-body">
          <div className="rating-title" id="session-rating-title">Was there any stress?</div>
          <div className="rating-sub">
            {fmt(finalElapsed)} session — how did {name} handle it?
          </div>
          
          {distressHint.isVisible && (
            <ContextHint
              title="How to rate distress"
              body="Be honest! It's better to end a session early and rate it 'Subtle stress' than to push too far. We use this to adjust your next target."
              action={<button type="button" className="secondary-control secondary-control--inline-text" onClick={distressHint.dismiss}>Got it</button>}
              className="mb-4 mt-2"
            />
          )}

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
