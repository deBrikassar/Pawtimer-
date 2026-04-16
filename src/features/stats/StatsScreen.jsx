import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, ProgressHero, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone }) {
  const target = recommendation?.duration ?? 0;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const riskSurfaceState = relapseTone?.surfaceState || "today";

  const emotionalMomentum = chartTrendLabel || `${name} is building consistency with each calm session.`;
  const progressDelta = Math.max(0, target - bestCalm);
  const nextTargetLabel = progressDelta > 0
    ? `Next milestone (+${fmt(progressDelta)})`
    : "Milestone met — hold this rhythm";
  const heroHeadline = progressDelta <= 0
    ? `${name} reached this milestone.`
    : progressDelta <= 60
      ? `${name} is one calm stretch from the next milestone.`
      : `${name} is building calm confidence.`;
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
            <ProgressHero
              name={name}
              headlineStatus={headlineStatus}
              headline={heroHeadline}
              headlineSurfaceState={headlineSurfaceState}
              currentValue={fmt(bestCalm)}
              currentLabel="Current calm window"
              currentSeconds={bestCalm}
              targetValue={fmt(target)}
              targetLabel={nextTargetLabel}
              targetSeconds={target}
              insight={emotionalMomentum}
            />
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
            <StatsChartSection chartData={chartData} goalSec={goalSec} setTab={setTab} name={name} fmt={fmt} insightLabel={chartTrendLabel} />
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
