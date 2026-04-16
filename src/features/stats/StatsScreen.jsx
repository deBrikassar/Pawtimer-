import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone }) {
  const target = recommendation?.duration ?? 0;
  const headlineMetricVariant = METRIC_VARIANTS.HEADLINE;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const riskSurfaceState = relapseTone?.surfaceState || "today";

  const emotionalMomentum = chartTrendLabel || `${name} is building consistency with each calm session.`;
  const cadenceLabel = avgSessionsPerDay != null
    ? avgSessionsPerDay >= 1
      ? `Strong cadence: ${avgSessionsPerDay.toFixed(1)} sessions/day.`
      : `Steady cadence: ${avgSessionsPerDay.toFixed(1)} sessions/day.`
    : "Cadence will appear after a few more sessions.";
  const walkSupportLabel = avgWalkDuration != null
    ? `Walks are averaging ${fmt(avgWalkDuration, { hoursMinutesOnly: true })}, helping emotional reset.`
    : "Add walks to strengthen recovery between sessions.";

  return (
    <div className="tab-content stats-tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Progress starts here" body={`Complete your first session and ${name}'s progress, streak, and chart will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection className="stats-section-hero stats-section-priority">
            <div
              className={`stats-headline-card stats-headline-card--hero metric-surface metric-surface--${headlineMetricVariant} surface-state--${headlineSurfaceState}`.trim()}
              data-metric-variant={headlineMetricVariant}
              aria-label="Current recommendation"
            >
              <div className="stats-headline-topline">
                <span className="stats-headline-label">{name}'s progress pulse</span>
                <span className="stats-headline-status">{headlineStatus}</span>
              </div>
              <div className="stats-headline-main stats-headline-main--hero">
                <span className="stats-headline-value">{fmt(target)}</span>
                <span className="stats-headline-sub">recommended solo stretch</span>
              </div>
              <p className="stats-hero-insight">{emotionalMomentum}</p>
            </div>
          </StatsSection>

          <StatsSection title="What is shaping today" className="stats-section-signals">
            <div className="stats-row stats-row-core stats-row-core-calm">
              <StatsMetricCard
                value={fmt(bestCalm)}
                label="Best calm window"
                detail="Your strongest moment so far"
                className="stat-card--key-metric"
                variant={standardMetricVariant}
              />
              <StatsMetricCard
                value={relapseTone.label}
                label="Recovery pressure"
                detail="How gently to pace the next step"
                className={`stat-card--key-metric stat-card-risk surface-state--${riskSurfaceState}`}
                variant={standardMetricVariant}
              />
            </div>
          </StatsSection>

          <StatsSection title="Journey curve" className="stats-section-journey">
            <StatsChartSection chartData={chartData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </StatsSection>

          <StatsSection title="Contextual insights" className="stats-section-supporting">
            <div className="stats-support-list stats-support-list--insights">
              <StatsSupportRow label="Weekly solo time" value={fmt(aloneLastWeek)} />
              <StatsSupportRow label="Session cadence" value={cadenceLabel} />
              <StatsSupportRow label="Walk support" value={walkSupportLabel} />
              <StatsSupportRow label="Daily walks" value={avgWalksPerDay != null ? `${avgWalksPerDay.toFixed(1)} walks/day` : "Tracking after more walk logs"} />
            </div>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
