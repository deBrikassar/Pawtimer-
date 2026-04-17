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
              <span className="stats-simple-status">{headlineStatus}</span>
              <div className="stats-simple-duration">{fmt(bestCalm)}</div>
              <div className="stats-simple-label">Current calm-alone duration</div>
            </div>
          </StatsSection>

          <StatsSection title="Progress toward independence" className="stats-section-minimal">
            <div className="stats-goal-progress metric-surface metric-surface--standard" aria-label={`${progressPct}% toward independence goal`}>
              <div className="stats-goal-progress-topline">
                <span>{progressPct}% to independence</span>
                <span>{fmt(independenceGoalSeconds)} goal</span>
              </div>
              <div className="stats-goal-progress-track" aria-hidden="true">
                <span className="stats-goal-progress-fill" style={{ width: `${Math.max(progressPct, 4)}%` }} />
              </div>
            </div>
          </StatsSection>

          <StatsSection className="stats-section-minimal stats-section-next-step">
            <div className="stats-next-step metric-surface metric-surface--standard" aria-live="polite">
              Next session: {fmt(nextSessionSeconds)}
            </div>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
