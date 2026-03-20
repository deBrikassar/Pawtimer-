import { SessionControl, SessionRatingPanel, TrainProgressBar, WelcomeBackBanner } from "../train/TrainComponents";
import { StatsProgressRing } from "../stats/StatsComponents";
import { DISTRESS_TYPES, PATTERN_TYPES, WALK_TYPE_OPTIONS, fmt, isToday, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton } from "../app/ui";

export default function HomeScreen(props) {
  const {
    name,
    sessions,
    target,
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
    showWelcomeBack,
    setShowWelcomeBack,
    activeProto,
    daily,
    recommendationConfidence,
    adjustedTarget,
    pattern,
    leaveProfile,
    openTip,
    setOpenTip,
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

  return (
    <div className="tab-content train-screen">
      {showWelcomeBack && <WelcomeBackBanner sessions={sessions} name={name} target={target} onDismiss={() => setShowWelcomeBack(false)} fmt={fmt} />}

      <div className="train-main">
        <TrainProgressBar goalPct={goalPct} target={target} goalSec={goalSec} fmt={fmt} />

        <SessionControl phase={phase} elapsed={elapsed} target={target} onStart={startSession} onEnd={endSession} onCancel={cancelSession} completed={sessionCompleted} fmt={fmt} />

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

        {phase === "idle" && (() => {
          const goalFrac = Math.min(goalPct / 100, 1);
          const sessFrac = activeProto.sessionsPerDayMax > 0 ? Math.min(daily.count / activeProto.sessionsPerDayMax, 1) : 0;
          const toggleRecommendations = () => setOpenTip((prev) => (prev === "recommendations" ? null : "recommendations"));
          const nextSessionLabel = fmt(target);
          return (
            <div className="stats-rings-card">
              <StatsProgressRing
                value={nextSessionLabel}
                label="Next session"
                progress={goalFrac}
                fillClassName="ring-fill-1"
                onLabelClick={toggleRecommendations}
                labelExpanded={openTip === "recommendations"}
                labelControls="recommendation-popover"
              />
              <div className="ring-col-sep" />
              <StatsProgressRing
                value={daily.count}
                label="Sessions today"
                progress={sessFrac}
                fillClassName="ring-fill-2"
                onLabelClick={toggleRecommendations}
                labelExpanded={openTip === "recommendations"}
                labelControls="recommendation-popover"
              />
              {openTip === "recommendations" && (
                <div className="recommendation-pop" id="recommendation-popover" role="dialog" aria-label="Recommendation details">
                  <p>Recommendation confidence: <strong>{recommendationConfidence.toUpperCase()}</strong> · suggested desensitization dose target {fmt(adjustedTarget)} built from recent calm history, distress, and stability.</p>
                  <p>Leave frequency profile: ~{pattern.normalizedLeaves}/day ({leaveProfile.desc}). Higher leave frequency raises today's pattern-break target and requires more calm-session consistency before bigger recommendations.</p>
                </div>
              )}
            </div>
          );
        })()}

        {daily.count >= Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0)) && (
          <p className="status-msg" style={{ color: "var(--amber)" }}>
            ⚠️ {daily.count} sessions today — for ~{pattern.normalizedLeaves} departures/day, keep it around {Math.max(1, activeProto.sessionsPerDayMax - (pattern.normalizedLeaves >= 7 ? 1 : 0))} to avoid overloading real departures.
          </p>
        )}

        <div className="tool-group-card">
          <div className="section-title" style={{ marginBottom: 12 }}>Today's logs</div>
          <div className="quick-actions-row">
            <button className="quick-action-btn" type="button" onClick={walkPhase === "idle" ? startWalk : undefined}>
              <span className="quick-action-icon"><Img src="walk.png" alt="Walk" /></span>
              <span className="quick-action-label">Log walk</span>
              <span className="quick-action-meta">{walkPhase === "timing" ? `${fmt(walkElapsed)} live` : `Today: ${pattern.todayWalks}`}</span>
            </button>
            <button className={`quick-action-btn ${pattern.behind ? "warn" : ""}`} type="button" onClick={() => setPatOpen(true)}>
              <span className="quick-action-icon"><Img src="pattern-keys.png" alt="Pattern" /></span>
              <span className="quick-action-label">Log pattern break</span>
              <span className="quick-action-meta">Today: {pattern.todayPat}</span>
            </button>
            <button className="quick-action-btn" type="button" onClick={openFeedingForm}>
              <span className="quick-action-icon" aria-hidden="true"><span className="qa-glyph">🍽️</span></span>
              <span className="quick-action-label">Log feeding</span>
              <span className="quick-action-meta">Today: {feedings.filter((f) => isToday(f.date)).length}</span>
            </button>
          </div>
        </div>

        {(walkPhase !== "idle" || patOpen) && (
          <div className="quick-modal-overlay" role="dialog" aria-modal="true" onClick={() => { if (walkPhase !== "idle") cancelWalk(); if (patOpen) setPatOpen(false); }}>
            <div className="quick-modal-card" onClick={(e) => e.stopPropagation()}>
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
                    <button className="walk-cancel-btn" onClick={cancelWalk}>Cancel</button>
                    <button className="walk-end-btn" onClick={endWalk}>End Walk</button>
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
                    <button className="walk-cancel-btn" type="button" onClick={cancelWalk}>Cancel</button>
                  </div>
                </div>
              )}

              {patOpen && (
                <div className="tool-expand" style={{ borderTop: "none", borderRadius: 12 }}>
                  <div className={`pat-reminder ${pattern.behind ? "warn" : ""}`} style={{ marginBottom: 10 }}>{patReminderText}</div>
                  <div className="pat-btns">
                    {PATTERN_TYPES.map((pt) => (
                      <button key={pt.type} className="btn-pat" onClick={(e) => { e.stopPropagation(); logPattern(pt.type); }}>
                        <Img src={pt.icon} size={28} alt={pt.label} />
                        <div className="p-text">
                          <div className="p-label">{patLabels[pt.type] || pt.label}</div>
                          <div className="p-desc">{pt.desc}</div>
                        </div>
                        <span className="p-count">Today: {patterns.filter((p) => isToday(p.date) && p.type === pt.type).length}</span>
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
            <div className="feeding-card" onClick={(e) => e.stopPropagation()}>
              <div className="quick-modal-head">
                <div className="section-title" id="feeding-title" style={{ marginBottom: 0 }}>Log feeding</div>
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
                <button className="walk-cancel-btn" type="button" onClick={cancelFeedingForm}>Cancel</button>
                <button className="walk-end-btn" type="button" onClick={saveFeeding}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
