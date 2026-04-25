import { SessionControl, SessionRatingPanel } from "../train/TrainComponents";
import { DISTRESS_TYPES, PATTERN_TYPES, WALK_TYPE_OPTIONS, fmt, fmtClock, isToday, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton, ViewportModal } from "../app/ui";
import { useState } from "react";

export default function HomeScreen(props) {
  const {
    name,
    sessions,
    recommendation,
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
    dismissTrainFirstRunHint,
  } = props;
  const target = recommendation?.duration ?? 0;
  const [todayOpen, setTodayOpen] = useState(false);
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
  return (
    <div className="tab-content train-screen">
      <div className="train-main">
        <header className="train-identity-header surface-card">
          <div className="train-identity-header__badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 10.5 5.6 6.8a1.2 1.2 0 0 1 2-.9L10 8.8h4l2.4-2.9a1.2 1.2 0 0 1 2 .9L17 10.5a6.2 6.2 0 0 1 .7 2.8c0 3.2-2.6 5.7-5.7 5.7s-5.7-2.5-5.7-5.7c0-1 .2-2 .7-2.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9.4 13.1c.2 0 .4-.2.4-.4s-.2-.4-.4-.4-.4.2-.4.4.2.4.4.4Zm5.2 0c.2 0 .4-.2.4-.4s-.2-.4-.4-.4-.4.2-.4.4.2.4.4.4Z" fill="currentColor"/>
              <path d="M10.3 15.3c.5.5 1 .7 1.7.7s1.2-.2 1.7-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="train-identity-header__copy">
            <h2 className="train-identity-header__name">Train with {name}</h2>
          </div>
        </header>

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
          allowIdlePress={false}
          onIdlePress={dismissTrainFirstRunHint}
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

        {!daily.canAdd && (
          <p className="status-msg status-msg--warning">
            {sessionBlockedMessage}
          </p>
        )}

        {daily.canAdd && daily.count >= Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0)) && (
          <p className="status-msg status-msg--warning">
            {daily.count} reps today — with ~{pattern.normalizedLeaves} departures/day, try to stay near {Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0))} so training stays sustainable.
          </p>
        )}

        <section className="train-today surface-card settings-collapsible-card settings-collapsible-card--quiet">
          <button
            type="button"
            className="settings-collapsible-toggle secondary-control--toggle train-today-toggle"
            aria-expanded={todayOpen}
            onClick={() => setTodayOpen((prev) => !prev)}
          >
            <div className="train-today-toggle__copy">
              <div className="section-title section-title--flush">Today&apos;s care log</div>
              <div className="t-helper">{todaySessions.length} calm reps · walks, breaks, feeding</div>
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
          <ViewportModal open onClose={() => { if (walkPhase !== "idle") cancelWalk(); if (patOpen) setPatOpen(false); }}>
            <div className="quick-modal-card modal-card modal-card--dialog-md modal-card--sheet quick-modal-card--sheet">
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
          </ViewportModal>
        )}

        {feedingOpen && (
          <ViewportModal open onClose={cancelFeedingForm} overlayClassName="feeding-overlay" labelledBy="feeding-title">
            <div className="feeding-card modal-card modal-card--dialog-sm modal-card--sheet quick-modal-card--sheet quick-modal-card--sheet-compact">
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
          </ViewportModal>
        )}
      </div>
    </div>
  );
}
