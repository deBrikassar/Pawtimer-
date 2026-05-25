import { useCallback, useEffect, useRef, useState } from "react";
import { ViewportModal } from "../app/ui";

export function TamagotchiDog({ phase, latestSession }) {
  let dogState = "idle";
  if (phase === "running") {
    dogState = "running";
  } else if (phase === "idle" && latestSession) {
    if (latestSession.outcome === "none") {
      dogState = "success";
    } else {
      dogState = "stress";
    }
  }

  return (
    <div className="tamagotchi-wrap">
      <div className={`tamagotchi-dog ${dogState === 'idle' ? 'is-visible' : ''}`} style={{ maskImage: 'url(/icons/dog-idle.svg)', WebkitMaskImage: 'url(/icons/dog-idle.svg)' }}></div>
      <div className={`tamagotchi-dog ${dogState === 'running' ? 'is-visible' : ''}`} style={{ maskImage: 'url(/icons/dog-running.svg)', WebkitMaskImage: 'url(/icons/dog-running.svg)' }}></div>
      <div className={`tamagotchi-dog ${dogState === 'success' ? 'is-visible' : ''}`} style={{ maskImage: 'url(/icons/dog-success.svg)', WebkitMaskImage: 'url(/icons/dog-success.svg)' }}></div>
      <div className={`tamagotchi-dog ${dogState === 'stress' ? 'is-visible' : ''}`} style={{ maskImage: 'url(/icons/dog-stress.svg)', WebkitMaskImage: 'url(/icons/dog-stress.svg)' }}></div>
    </div>
  );
}

function SessionActionRow({ onCancel }) {
  return (
    <div className="session-actions is-running">
      <button className="session-cancel-btn button-base button-ghost button--md button--pill" onClick={onCancel}>Cancel (don't save)</button>
    </div>
  );
}

/* ── Odometer digit component ── */
function OdometerDigit({ char, index }) {
  const [prev, setPrev] = useState(char);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    if (char !== prev) {
      setIsChanging(true);
      setPrev(char);
      const t = setTimeout(() => setIsChanging(false), 300);
      return () => clearTimeout(t);
    }
  }, [char, prev]);

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
            <div className="sc-time">
              {isRunning && isPastTarget && <div className="session-panel__over">+{fmt(overTargetSeconds)}</div>}
              <OdometerTime value={isRunning ? fmt(elapsed) : fmt(target)} />
              <div className="session-panel__eyebrow">{isRunning ? "RUNNING" : "START SESSION"}</div>
            </div>
          </div>
        </button>

        {/* Ripple waves — only visible during running */}
        <div className="sc-ripple" aria-hidden="true"></div>
        <div className="sc-ripple" aria-hidden="true"></div>
        <div className="sc-ripple" aria-hidden="true"></div>
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
        <span className="prog-thumb" style={{ left: `${thumbPct}%` }} // INLINE_STYLE_TECHNICAL_EXCEPTION
         aria-hidden="true" />
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
