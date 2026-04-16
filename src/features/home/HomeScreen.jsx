import { SessionControl, SessionRatingPanel } from "../train/TrainComponents";
import { DISTRESS_TYPES, PATTERN_TYPES, WALK_TYPE_OPTIONS, fmt, fmtClock, isToday, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton } from "../app/ui";
import { useEffect, useState } from "react";

export default function HomeScreen(props) {
  const {
    name,
    sessions,
    recommendation,
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
    showTrainFirstRunHint,
    dismissTrainFirstRunHint,
    trainTimeChangeInsight,
    returningTrainNudge,
    dismissReturningTrainNudge,
    openHistory,
    openProgress,
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
  const [todayOpen, setTodayOpen] = useState(false);
  const [trainExplainOpen, setTrainExplainOpen] = useState(false);
  const todaySessions = sessions.filter((s) => isToday(s.date));
  const todayFeedingCount = feedings.filter((f) => isToday(f.date)).length;
  const latestSession = [...todaySessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .at(0);
  const sessionBlockedMessage = daily.blockReason === "cap"
    ? `Daily alone-time cap reached (${fmtClock(daily.capSec)}). Try again tomorrow.`
    : daily.blockReason === "max_sessions"
      ? `Daily session max reached (${daily.maxCount}). Try again tomorrow.`
      : "";
  const toggleTrainExplain = () => {
    setTrainExplainOpen((prev) => !prev);
    if (showTrainFirstRunHint) dismissTrainFirstRunHint();
  };

  useEffect(() => {
    if (phase !== "idle") {
      setTrainExplainOpen(false);
      return;
    }
    if (showTrainFirstRunHint) setTrainExplainOpen(true);
  }, [phase, showTrainFirstRunHint]);

  return (
    <div className="tab-content train-screen">
      <div className="train-main">
        <header className="train-identity-header surface-card">
          <div className="train-identity-header__badge" aria-hidden="true">
            <Img src="hero-dog.png" size={44} alt="" />
          </div>
          <div className="train-identity-header__copy">
            <div className="train-identity-header__eyebrow">{name}'s calm practice</div>
            <h2 className="train-identity-header__name">Train with {name}</h2>
            <p className="train-identity-header__mood">Short, gentle reps to help {name} feel safer during real departures.</p>
          </div>
        </header>

        <SessionControl
          phase={phase}
          elapsed={elapsed}
          target={target}
          name={name}
          onStart={startSession}
          onEnd={endSession}
          onCancel={cancelSession}
          completed={sessionCompleted}
          fmt={fmt}
          canStart={daily.canAdd}
          startBlockedMessage={sessionBlockedMessage}
          allowIdlePress={false}
          onIdlePress={toggleTrainExplain}
        />
        {phase === "idle" && returningTrainNudge && (
          <section className="train-returning-summary surface-card" role="status" aria-live="polite">
            <div className="train-returning-summary__head">
              <p className="train-returning-summary__eyebrow">Welcome back</p>
              <button type="button" className="train-returning-summary__dismiss" onClick={dismissReturningTrainNudge} aria-label="Dismiss update">
                Dismiss
              </button>
            </div>
            <p className="train-returning-summary__title">
              Target updated from <strong>{fmtClock(returningTrainNudge.previousTarget)}</strong> to <strong>{fmtClock(returningTrainNudge.currentTarget)}</strong>.
            </p>
            <p className="train-returning-summary__meta">
              {returningTrainNudge.changedBy > 0 ? "You can try a slightly longer calm rep today." : "A shorter rep keeps confidence steady today."}
            </p>
            <div className="train-returning-summary__actions">
              <button type="button" className="button-base button-ghost button--md button--pill" onClick={openHistory}>History</button>
              <button type="button" className="button-base button-ghost button--md button--pill" onClick={openProgress}>Progress</button>
            </div>
          </section>
        )}
        {phase === "idle" && (
          <div className="train-contextual-help">
            <button
              type="button"
              className={`train-inline-guidance ${showTrainFirstRunHint ? "is-first-run" : ""}`}
              onClick={toggleTrainExplain}
              aria-expanded={trainExplainOpen}
            >
              <span className="train-inline-guidance__label">What this means</span>
              <span className="train-inline-guidance__copy">How the circle supports separation training</span>
            </button>
            {trainExplainOpen && (
              <div className="train-inline-explain" role="note" aria-live="polite">
                <p><strong>Circle:</strong> this is {name}&apos;s target for one rep. The ring fills as calm alone time is completed.</p>
                <p><strong>Target ({fmtClock(target)}):</strong> your current safe step. End while {name} is still relaxed.</p>
                <p><strong>Session flow:</strong> start, observe calm body language, then end and rate what you saw.</p>
              </div>
            )}
          </div>
        )}
        <section className="train-context-block surface-card">
          <p className="train-context-block__title">Today&apos;s target</p>
          <p className="train-context-block__value">{fmtClock(target)} calm for {name}</p>
          <p className="train-context-block__meta">
            Reps today: <strong>{daily.count}</strong> · Longer-term goal: <strong>{fmt(goalSec)}</strong>
          </p>
          {!daily.canAdd && (
            <p className="status-msg status-msg--warning">
              {sessionBlockedMessage}
            </p>
          )}
          {phase === "idle" && showTrainFirstRunHint && (
            <div className="train-inline-tip" role="note">
              <span className="train-inline-tip__label">Targets adapt to your dog</span>
              <span className="train-inline-tip__copy">Calm reps nudge targets up. Stress signs nudge them down.</span>
              <ol className="train-inline-tip__steps">
                <li>Press <strong>Start rep</strong> when the space is calm.</li>
                <li>Watch quietly, then end before stress builds.</li>
                <li>Rate what you saw so tomorrow&apos;s target fits better.</li>
              </ol>
              <button
                type="button"
                className="train-inline-tip__dismiss"
                onClick={dismissTrainFirstRunHint}
              >
                Got it
              </button>
            </div>
          )}
          {phase === "idle" && recoveryMode?.active && (
            <div className="train-recovery-inline" role="note" aria-live="polite">
              <p className="train-recovery-inline__title">{recoveryModalTitle}</p>
              <p className="train-recovery-inline__copy">{recoveryModalCopy}</p>
            </div>
          )}
          {phase === "idle" && trainTimeChangeInsight && (
            <div className={`train-time-change-insight is-${trainTimeChangeInsight.tone || "neutral"}`} role="status" aria-live="polite">
              <p className="train-time-change-insight__title">{trainTimeChangeInsight.title}</p>
              <p className="train-time-change-insight__copy">{trainTimeChangeInsight.body}</p>
            </div>
          )}
        </section>

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

        {daily.canAdd && daily.count >= Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0)) && (
          <p className="status-msg status-msg--warning">
            {daily.count} reps today — with ~{pattern.normalizedLeaves} departures/day, try to stay near {Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0))} so training stays sustainable.
          </p>
        )}

        <section className="train-today surface-card settings-collapsible-card settings-collapsible-card--quiet">
          <button
            type="button"
            className="settings-collapsible-toggle secondary-control--toggle"
            aria-expanded={todayOpen}
            onClick={() => setTodayOpen((prev) => !prev)}
          >
            <div>
              <div className="section-title section-title--flush">Today&apos;s training + care log</div>
              <div className="t-helper">{todaySessions.length} calm-alone reps · support logs</div>
            </div>
            <span className="settings-collapsible-arrow" aria-hidden="true">{todayOpen ? "−" : "+"}</span>
          </button>
          <div className={`collapsible-body train-today-body ${todayOpen ? "open" : "closed"}`}>
            <div className="settings-collapsible-inner">
              <div className="train-today-list" role="list" aria-label="Today's logged activity">
                <button className="train-today-row train-today-row--action" type="button" onClick={walkPhase === "idle" ? startWalk : undefined}>
                  <span className="train-today-row__label">Walk</span>
                  <span className="train-today-row__meta">{walkPhase === "timing" ? `${fmt(walkElapsed)} live` : `${pattern.todayWalks} today`}</span>
                </button>
                <button className={`train-today-row train-today-row--action ${pattern.behind ? "warn" : ""}`} type="button" onClick={() => setPatOpen(true)}>
                  <span className="train-today-row__label">Pattern break</span>
                  <span className="train-today-row__meta">{pattern.todayPat} today</span>
                </button>
                <button className="train-today-row train-today-row--action" type="button" onClick={openFeedingForm}>
                  <span className="train-today-row__label">Feeding</span>
                  <span className="train-today-row__meta">{todayFeedingCount} today</span>
                </button>
              </div>
              {latestSession ? (
                <div className="train-today-mini-log" role="status" aria-live="polite">
                  Latest calm-alone rep: {new Date(latestSession.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {fmt(latestSession.actualDuration || latestSession.seconds || 0)}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {(walkPhase !== "idle" || patOpen) && (
          <div className="quick-modal-overlay quick-modal-overlay--sheet" role="dialog" aria-modal="true" onClick={() => { if (walkPhase !== "idle") cancelWalk(); if (patOpen) setPatOpen(false); }}>
            <div className="quick-modal-card modal-card modal-card--dialog-md modal-card--sheet quick-modal-card--sheet" onClick={(e) => e.stopPropagation()}>
              <div className="history-session-sheet-grabber" aria-hidden="true" />
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
          <div className="feeding-overlay quick-modal-overlay--sheet" role="dialog" aria-modal="true" aria-labelledby="feeding-title" onClick={cancelFeedingForm}>
            <div className="feeding-card modal-card modal-card--dialog-sm modal-card--sheet quick-modal-card--sheet quick-modal-card--sheet-compact" onClick={(e) => e.stopPropagation()}>
              <div className="history-session-sheet-grabber" aria-hidden="true" />
              <div className="quick-modal-head">
                <div className="section-title section-title--flush" id="feeding-title">Log feeding</div>
                <ModalCloseButton onClick={cancelFeedingForm} />
              </div>
              <div className="t-helper activity-time-hint">Quick log for routine consistency. You can fine-tune details in History later.</div>
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
