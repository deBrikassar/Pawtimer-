import { SessionControl, SessionRatingPanel, TrainProgressBar } from "../train/TrainComponents";
import { DISTRESS_TYPES, PATTERN_TYPES, WALK_TYPE_OPTIONS, fmt, fmtClock, isToday, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton } from "../app/ui";
import { useState } from "react";

export default function HomeScreen(props) {
  const {
    name,
    sessions,
    recommendation,
    goalPct,
    goalSec,
    phase,
    elapsed,
    finalElapsed,
    sessionCompleted,
    sessionOutcome,
    setSessionOutcome,
    recordResult,
    latencyDraft,
    setLatencyDraft,
    distressTypeDraft,
    setDistressTypeDraft,
    setPhase,
    setElapsed,
    setFinalElapsed,
    startSession,
    endSession,
    cancelSession,
    activeProto,
    daily,
    pattern,
    walkPhase,
    startWalk,
    cancelWalk,
    walkElapsed,
    endWalk,
    walkPendingDuration,
    saveWalkWithType,
    patOpen,
    setPatOpen,
    patReminderText,
    logPattern,
    patLabels,
    patterns,
    feedings,
    feedingOpen,
    openFeedingForm,
    feedingDraft,
    setFeedingDraft,
    cancelFeedingForm,
    saveFeeding,
  } = props;
  const target = recommendation?.duration ?? 0;
  const recoveryMode = recommendation?.details?.recoveryMode;
  const recommendationType = recommendation?.details?.recommendationType;
  const recoveryModalTitle = (() => {
    if (!recoveryMode?.active) return "Recovery plan";
    if (recommendationType === "recovery_mode_active") return "Recovery reset sessions";
    return "Recovery sessions active";
  })();
  const recoveryModalCopy = recoveryMode?.planCopy
    || recommendation?.details?.summary
    || recommendation?.explanation
    || "We temporarily adjusted session targets to rebuild calm confidence before progression resumes.";
  const [showRecoveryInfo, setShowRecoveryInfo] = useState(false);
  const sessionBlockedMessage = daily.blockReason === "cap"
    ? `Daily alone-time cap reached (${fmtClock(daily.capSec)}). Log more sessions tomorrow.`
    : daily.blockReason === "max_sessions"
      ? `Daily session max reached (${daily.maxCount}). Log more sessions tomorrow.`
      : "";

  return (
    <div className="tab-content train-screen">
      <div className="train-main">
        <TrainProgressBar goalPct={goalPct} target={target} goalSec={goalSec} fmt={fmt} />

        <SessionControl
          phase={phase}
          elapsed={elapsed}
          target={target}
          onStart={startSession}
          onEnd={endSession}
          onCancel={cancelSession}
          completed={sessionCompleted}
          fmt={fmt}
          canStart={daily.canAdd}
          startBlockedMessage={sessionBlockedMessage}
        />

        <SessionRatingPanel
          phase={phase}
          finalElapsed={finalElapsed}
          name={name}
          sessionOutcome={sessionOutcome}
          setSessionOutcome={setSessionOutcome}
          recordResult={recordResult}
          latencyDraft={latencyDraft}
          setLatencyDraft={setLatencyDraft}
          distressTypeDraft={distressTypeDraft}
          setDistressTypeDraft={setDistressTypeDraft}
          onCancel={() => { setPhase("idle"); setElapsed(0); setFinalElapsed(0); setSessionOutcome(null); setLatencyDraft(""); setDistressTypeDraft(""); }}
          fmt={fmt}
          Img={Img}
          distressTypes={DISTRESS_TYPES}
        />

        {phase === "idle" && (
          <button
            type="button"
            className={`train-focus-strip ${recoveryMode?.active ? "train-focus-strip--recovery" : ""}`.trim()}
            onClick={recoveryMode?.active ? () => setShowRecoveryInfo(true) : undefined}
            disabled={!recoveryMode?.active}
          >
            <span className="train-focus-strip__label">Focus now</span>
            <span className="train-focus-strip__value">{fmtClock(target)} calm session</span>
            <span className="train-focus-strip__meta">{daily.count} logged today</span>
          </button>
        )}
        {showRecoveryInfo && recoveryMode?.active && (
          <div className="quick-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowRecoveryInfo(false)}>
            <div className="quick-modal-card modal-card modal-card--dialog-md recovery-explain-modal" onClick={(e) => e.stopPropagation()}>
              <div className="quick-modal-head">
                <div className="quick-modal-title">{recoveryModalTitle}</div>
                <ModalCloseButton onClick={() => setShowRecoveryInfo(false)} />
              </div>
              <div className="recovery-explain-steps">
                {(recoveryMode.stepLabels || []).map((label, idx) => (
                  <div key={`${label}-${idx}`} className={`recovery-step-chip ${recoveryMode.step >= (idx + 1) ? "is-done" : ""}`}>{label}</div>
                ))}
              </div>
              <p className="recovery-explain-copy">
                {recoveryModalCopy}
              </p>
              {recoveryMode.acceptsAnyCalmSession && (
                <p className="recovery-explain-copy">
                  For subtle recovery, calm sessions can be any length—you do not need to match the exact step duration.
                </p>
              )}
              <div className="recovery-explain-meta">
                <span>{recoveryMode.currentStepLabel || `Step ${Math.max(1, recoveryMode.step)} of ${recoveryMode.totalSessions || 2}`}</span>
                <span>{recoveryMode.remainingSessions} remaining</span>
              </div>
            </div>
          </div>
        )}

        {!daily.canAdd && (
          <p className="status-msg status-msg--warning">
            {sessionBlockedMessage}
          </p>
        )}

        {daily.canAdd && daily.count >= Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0)) && (
          <p className="status-msg status-msg--warning">
            {daily.count} sessions today — for ~{pattern.normalizedLeaves} departures/day, keep it around {Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0))} to avoid overloading real departures.
          </p>
        )}

        <div className="tool-group-card surface-card surface-card--tool-group">
          <div className="section-title">Support routines</div>
          <div className="t-helper">Quick log items that support training, without leaving Train.</div>
          <div className="quick-actions-row">
            <button className="quick-action-btn" type="button" onClick={walkPhase === "idle" ? startWalk : undefined}>
              <span className="quick-action-label">Walk</span>
              <span className="quick-action-meta">{walkPhase === "timing" ? `${fmt(walkElapsed)} live` : `Today: ${pattern.todayWalks}`}</span>
            </button>
            <button className={`quick-action-btn ${pattern.behind ? "warn" : ""}`} type="button" onClick={() => setPatOpen(true)}>
              <span className="quick-action-label">Pattern break</span>
              <span className="quick-action-meta">Today: {pattern.todayPat}</span>
            </button>
            <button className="quick-action-btn" type="button" onClick={openFeedingForm}>
              <span className="quick-action-label">Feeding</span>
              <span className="quick-action-meta">Today: {feedings.filter((f) => isToday(f.date)).length}</span>
            </button>
          </div>
        </div>

        {(walkPhase !== "idle" || patOpen) && (
          <div className="quick-modal-overlay" role="dialog" aria-modal="true" onClick={() => { if (walkPhase !== "idle") cancelWalk(); if (patOpen) setPatOpen(false); }}>
            <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
              <div className="quick-modal-head">
                <div className="quick-modal-title">{walkPhase !== "idle" ? "Log walk" : "Log pattern break"}</div>
                <ModalCloseButton onClick={() => { if (walkPhase !== "idle") cancelWalk(); if (patOpen) setPatOpen(false); }} />
              </div>

              {walkPhase === "timing" && (
                <div className="walk-timer-banner">
                  <div className="walk-timer-left">
                    <div className="walk-timer-elapsed">{fmt(walkElapsed)}</div>
                    <div className="walk-timer-lbl">Walk in progress…</div>
                  </div>
                  <div className="walk-timer-btns">
                    <button className="walk-cancel-btn button-base button-ghost button--md button--pill" onClick={cancelWalk}>Cancel</button>
                    <button className="walk-end-btn button-base button-primary button--md button--pill" onClick={endWalk}>End Walk</button>
                  </div>
                </div>
              )}

              {walkPhase === "classify" && (
                <div className="walk-type-panel">
                  <div className="walk-type-title">Classify this walk</div>
                  <div className="walk-type-sub">{fmt(walkPendingDuration)} · select a walk type to save.</div>
                  <div className="walk-type-grid">
                    {WALK_TYPE_OPTIONS.map((option) => (
                      <button key={option.value} className="walk-type-option" onClick={() => saveWalkWithType(option.value)} type="button">{option.label}</button>
                    ))}
                  </div>
                  <div className="walk-type-actions">
                    <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={cancelWalk}>Cancel</button>
                  </div>
                </div>
              )}

              {patOpen && (
                <div className="tool-expand tool-expand--modal">
                  <div className={`pat-reminder ${pattern.behind ? "warn" : ""}`}>{patReminderText}</div>
                  <div className="pat-btns">
                    {PATTERN_TYPES.map((pt) => (
                      <button key={pt.type} className="btn-pat surface-row--interactive interactive-row-card" onClick={(e) => { e.stopPropagation(); logPattern(pt.type); }}>
                        <span className="interactive-row-card__icon"><Img src={pt.icon} size={28} alt={pt.label} /></span>
                        <div className="p-text interactive-row-card__content">
                          <div className="p-label">{patLabels[pt.type] || pt.label}</div>
                          <div className="p-desc">{pt.desc}</div>
                        </div>
                        <span className="p-count interactive-row-card__trailing">Today: {patterns.filter((p) => isToday(p.date) && p.type === pt.type).length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {feedingOpen && (
          <div className="feeding-overlay" role="dialog" aria-modal="true" aria-labelledby="feeding-title" onClick={cancelFeedingForm}>
            <div className="feeding-card modal-card modal-card--dialog-sm" onClick={(e) => e.stopPropagation()}>
              <div className="quick-modal-head">
                <div className="section-title section-title--flush" id="feeding-title">Log feeding</div>
                <ModalCloseButton onClick={cancelFeedingForm} />
              </div>
              <label className="feeding-field">
                <span className="t-helper">Feeding time</span>
                <input type="datetime-local" value={feedingDraft.time} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, time: e.target.value }))} />
              </label>
              <label className="feeding-field">
                <span className="t-helper">Food type</span>
                <select value={feedingDraft.foodType} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, foodType: e.target.value }))}>
                  <option value="meal">meal</option>
                  <option value="treat">treat</option>
                  <option value="kong">kong</option>
                  <option value="lick mat">lick mat</option>
                  <option value="chew">chew</option>
                </select>
              </label>
              <label className="feeding-field">
                <span className="t-helper">Amount</span>
                <select value={feedingDraft.amount} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, amount: e.target.value }))}>
                  <option value="small">small</option>
                  <option value="medium">medium</option>
                  <option value="large">large</option>
                </select>
              </label>
              <div className="feeding-actions">
                <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={cancelFeedingForm}>Cancel</button>
                <button className="walk-end-btn button-base button-primary button--md button--pill" type="button" onClick={saveFeeding}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
