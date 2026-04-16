import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, ProgressHero, StatsChartSection, StatsInsightCard, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone, contextualInsights = [] }) {
  const target = recommendation?.duration ?? 0;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const riskSurfaceState = relapseTone?.surfaceState || "today";

  const emotionalMomentum = chartTrendLabel || `${name} is building calm-alone resilience rep by rep.`;
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
      ? `Strong cadence: ${avgSessionsPerDay.toFixed(1)} calm-alone reps/day.`
      : `Steady cadence: ${avgSessionsPerDay.toFixed(1)} calm-alone reps/day.`
    : "Cadence appears after a few calm-alone reps.";
  const walkSupportLabel = avgWalkDuration != null
    ? `Walks average ${fmt(avgWalkDuration, { hoursMinutesOnly: true })}, supporting decompression between alone-time reps.`
    : "Add decompression walks to support recovery between alone-time reps.";

  return (
    <div className="tab-content stats-tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Calm-alone progress starts here" body={`Log your first calm-alone rep and ${name}&apos;s progress curve will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection className="stats-section-hero stats-section-priority">
            <ProgressHero
              name={name}
              headlineStatus={headlineStatus}
              headline={heroHeadline}
              headlineSurfaceState={headlineSurfaceState}
              currentValue={fmt(bestCalm)}
              currentLabel="Current calm-alone window"
              currentSeconds={bestCalm}
              targetValue={fmt(target)}
              targetLabel={nextTargetLabel}
              targetSeconds={target}
              insight={emotionalMomentum}
            />
          </StatsSection>

          <StatsSection title="What is shaping today&apos;s alone-time training" className="stats-section-signals">
            <div className="stats-row stats-row-core stats-row-core-calm">
              <StatsMetricCard
                value={fmt(bestCalm)}
                label="Best calm-alone window"
                detail="Longest settled alone-time rep so far"
                className="stat-card--key-metric"
                variant={standardMetricVariant}
              />
              <StatsMetricCard
                value={relapseTone.label}
                label="Recovery pressure"
                detail="How conservatively to pace the next alone-time rep"
                className={`stat-card--key-metric stat-card-risk surface-state--${riskSurfaceState}`}
                variant={standardMetricVariant}
              />
            </div>
          </StatsSection>

          <StatsSection title="Calm-alone journey curve" className="stats-section-journey">
            <StatsChartSection chartData={chartData} goalSec={goalSec} setTab={setTab} name={name} fmt={fmt} insightLabel={chartTrendLabel} />
          </StatsSection>

          <StatsSection title="Context around your dog&apos;s calm-alone trend" className="stats-section-supporting">
            {contextualInsights.length > 0 ? (
              <div className="stats-insight-stack" role="list" aria-label="Progress movement insights">
                {contextualInsights.map((insight, index) => (
                  <StatsInsightCard
                    key={insight.id || `${insight.message}-${index}`}
                    message={insight.message}
                    detail={insight.detail}
                    tone={insight.tone}
                    index={index}
                  />
                ))}
              </div>
            ) : null}
            <div className="stats-support-list stats-support-list--insights">
              <StatsSupportRow label="Weekly alone-time practice" value={fmt(aloneLastWeek)} />
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
