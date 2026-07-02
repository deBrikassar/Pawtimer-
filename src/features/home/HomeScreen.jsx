import { SessionControl, SessionRatingPanel, TrainProgressBar } from "../train/TrainComponents";
import { DISTRESS_TYPES, PATTERN_TYPES, WALK_TYPE_OPTIONS, fmt, fmtClock, isToday, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton, ViewportModal } from "../app/ui";
import { useState } from "react";

import { useApp } from "../app/AppContext";
import { FeedingModal } from "./FeedingModal";
import { WalkModal } from "./WalkModal";
import { PatternModal } from "./PatternModal";

export default function HomeScreen() {
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
    setPatOpen,
    feedings,
    openFeedingForm,
    dogPhoto,
    handlePhotoUpload,
  } = useApp();
  const target = recommendation?.duration ?? 0;
  const [todayOpen, setTodayOpen] = useState(false);
  const todaySessions = sessions.filter((s) => isToday(s.date));
  const todayFeedingCount = feedings.filter((f) => isToday(f.date)).length;
  const latestSession = [...todaySessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .at(0);
  const sessionBlockedMessage = daily.blockReason === "cap"
    ? `Daily alone-time cap reached (${fmtClock(daily.capSec)}). Try again tomorrow.`
    : daily.blockReason === "frequency"
    ? "Take a break before your next session."
    : daily.blockReason === "max_sessions"
      ? `Daily session max reached (${daily.maxCount}). Try again tomorrow.`
      : "";


  return (
    <div className="tab-content train-screen">
      <div className="train-main">
        <header className="train-identity-hero">
          <label className="train-identity-hero__avatar" aria-label="Upload dog photo" role="button" tabIndex={0}>
            {dogPhoto ? (
              <img src={dogPhoto} alt={name} className="train-identity-hero__photo" />
            ) : (
              <div className="train-identity-hero__placeholder">
                <span className="train-identity-hero__initial">{String(name || "D").trim().charAt(0).toUpperCase()}</span>
                <div className="train-identity-hero__add-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="train-identity-hero__input sr-only"
              onChange={handlePhotoUpload}
              aria-hidden="true"
              tabIndex={-1}
              hidden
            />
          </label>
          <h2 className="train-identity-hero__name">Train with {name}</h2>
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
        />

        <TrainProgressBar goalPct={goalPct} target={target} goalSec={goalSec} fmt={fmt} elapsed={elapsed} phase={phase} />

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

        <section className="train-today surface-card settings-collapsible-card settings-collapsible-card--quiet settings-neumorphic-card">
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

        <WalkModal />
        <PatternModal />
        <FeedingModal />
      </div>
    </div>
  );
}
