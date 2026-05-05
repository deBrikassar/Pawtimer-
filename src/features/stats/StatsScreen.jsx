import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone }) {
  const target = recommendation?.duration ?? 0;
  const hasValidProgressDurations = Number.isFinite(bestCalm) && bestCalm >= 0 && Number.isFinite(target) && target > 0;
  const progressRatio = hasValidProgressDurations
    ? Math.max(0, Math.min(bestCalm / target, 1))
    : null;
  const headlineMetricVariant = METRIC_VARIANTS.HEADLINE;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const riskSurfaceState = relapseTone?.surfaceState || "today";

  return (
    <div className="tab-content stats-tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Progress starts here" body={`Complete your first session and ${name}'s progress, streak, and chart will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection title="Today’s feeling" className="stats-section-priority">
            <div className="stats-metric-anchor">
              <div
                className={`stats-headline-card metric-surface metric-surface--${headlineMetricVariant} surface-state--${headlineSurfaceState}`.trim()}
                data-metric-variant={headlineMetricVariant}
                aria-label="Current recommendation"
              >
                  <span className="stats-headline-label">Confidence recommendation</span>
                <div className="stats-headline-main">
                  <span className="stats-headline-value">{fmt(target)}</span>
                  <span className="stats-headline-status">{headlineStatus}</span>
                </div>
              </div>
            </div>
          </StatsSection>

          <StatsSection title="Confidence signals">
            <div className="stats-row stats-row-core stats-row-core-trimmed">
              <StatsMetricCard
                value={fmt(bestCalm)}
                label="Best time"
                className="stat-card--key-metric"
                variant={standardMetricVariant}
              />
              <StatsMetricCard
                value={fmt(target)}
                label="Next target"
                className="stat-card--key-metric"
                variant={standardMetricVariant}
              />
              <StatsMetricCard
                value={relapseTone.label}
                label="Risk"
                className={`stat-card--key-metric stat-card-risk surface-state--${riskSurfaceState}`}
                variant={standardMetricVariant}
              />
            </div>
          </StatsSection>

          <StatsSection title="Progress toward current goal" className="stats-section-goal-progress">
            <div className="stats-goal-progress" role="group" aria-label="Progress toward current goal">
              {hasValidProgressDurations ? (
                <>
                  <div className="stats-goal-progress-value">{fmt(bestCalm)} / {fmt(target, { hoursMinutesOnly: true })}</div>
                  <div className="stats-goal-progress-track" aria-hidden="true">
                    <span className="stats-goal-progress-fill" style={{ width: `${progressRatio * 100}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <div className="stats-goal-progress-empty">Start your first session to track progress</div>
                  <div className="stats-goal-progress-track" aria-hidden="true" />
                </>
              )}
            </div>
          </StatsSection>

          <StatsSection title="Journey curve">
            <StatsChartSection chartData={chartData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </StatsSection>

          <StatsSection title="Daily rhythm" className="stats-section-supporting">
            <div className="stats-support-list">
              <StatsSupportRow label="Alone time per week" value={fmt(aloneLastWeek)} />
              <StatsSupportRow label="Average walk duration" value={avgWalkDuration != null ? fmt(avgWalkDuration, { hoursMinutesOnly: true }) : "—"} />
              <StatsSupportRow label="Average sessions/day" value={avgSessionsPerDay != null ? avgSessionsPerDay.toFixed(1) : "—"} />
              <StatsSupportRow label="Average walks/day" value={avgWalksPerDay != null ? avgWalksPerDay.toFixed(1) : "—"} />
            </div>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
