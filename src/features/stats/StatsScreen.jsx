import EmptyState from "../../components/EmptyState";
import { StatsSection } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone, contextualInsights = [] }) {
  const target = recommendation?.duration ?? 0;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const independenceGoalSeconds = goalSec > 0 ? goalSec : (target > 0 ? target : 40 * 60);
  const progressPct = Math.max(0, Math.min(100, Math.round((bestCalm / independenceGoalSeconds) * 100)));
  const nextSessionSeconds = target > 0 ? target : bestCalm;
  const progressMessage = progressPct >= 100
    ? "You reached your goal"
    : progressPct >= 75
      ? "You’re getting very close"
      : progressPct >= 50
        ? "You’re over halfway there"
        : progressPct >= 25
          ? "You’re building momentum"
          : "You’ve started the path";
  const insightLine = chartTrendLabel
    || (progressPct >= 100
      ? "Stable streak — your dog is learning consistency"
      : progressPct >= 50
        ? "Your sessions are getting longer"
        : "Small calm wins are building confidence");

  return (
    <div className="tab-content stats-tab-content">
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Progress starts here" body={`Log your first rep and ${name}&apos;s trend will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection className="stats-section-hero stats-section-priority">
            <div
              className={`stats-simple-hero metric-surface metric-surface--headline surface-state--${headlineSurfaceState}`.trim()}
              aria-label="Current calm-alone progress"
            >
              <div className="stats-simple-duration">{fmt(bestCalm)}</div>
              <div className="stats-simple-label">Your dog can stay calm alone</div>
              <span className="stats-simple-status">{headlineStatus}</span>
            </div>
          </StatsSection>

          <StatsSection title="Progress toward independence" className="stats-section-minimal">
            <div className="stats-goal-progress metric-surface metric-surface--standard" aria-label={`${progressPct}% toward independence goal`}>
              <div className="stats-goal-progress-topline">
                <span>{progressMessage}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="stats-goal-progress-track" aria-hidden="true">
                <span className="stats-goal-progress-fill" style={{ width: `${Math.max(progressPct, 4)}%` }} />
              </div>
              <div className="stats-goal-progress-meta">{fmt(bestCalm)} → {fmt(independenceGoalSeconds)} goal</div>
              <div className="stats-goal-progress-insight">{insightLine}</div>
            </div>
          </StatsSection>

          <StatsSection className="stats-section-minimal stats-section-next-step">
            <div className="stats-next-step metric-surface metric-surface--standard" aria-live="polite">
              <span>Next session: {fmt(nextSessionSeconds)}</span>
              <span className="stats-next-step-hint">Keep it slightly below your best</span>
            </div>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
