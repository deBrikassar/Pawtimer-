import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, target, relapseTone, openMetricHelp, chartData, goalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, currentThreshold, headlineStatus, headlineStatusTone }) {
  const headlineMetricVariant = METRIC_VARIANTS.HEADLINE;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;

  return (
    <div className="tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        <div className="section-title">Progress</div>
        {totalCount === 0 ? (
          <EmptyState icon={<SproutIcon />} title="Progress starts here" body={`Complete your first session and ${name}'s progress, streak, and chart will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection title="Today" className="stats-section-priority">
            <div className={`stats-headline-card metric-surface metric-surface--${headlineMetricVariant}`} data-metric-variant={headlineMetricVariant}>
              <span className="stats-headline-label">Current threshold</span>
              <div className="stats-headline-main">
                <span className="stats-headline-value">{fmt(currentThreshold)}</span>
                <span className="stats-headline-status" style={{ color: headlineStatusTone.color }}>{headlineStatus}</span>
              </div>
            </div>
          </StatsSection>

          <StatsSection title="Key metrics">
            <div className="stats-row stats-row-core stats-row-core-trimmed">
              <StatsMetricCard value={fmt(bestCalm)} label="Best calm time" detail="Longest calm session" variant={standardMetricVariant} />
              <StatsMetricCard value={fmt(target)} label="Next target" detail="Recommended next session" onClick={() => openMetricHelp("nextTarget")} buttonLabel="Open Next target explanation" variant={standardMetricVariant} />
              <StatsMetricCard value={relapseTone.label} label="Risk" detail="From recent distress signals" className="stat-card-risk" valueStyle={{ color: relapseTone.color }} variant={standardMetricVariant} />
            </div>
          </StatsSection>

          <StatsSection title="Progress chart">
            <StatsChartSection chartData={chartData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </StatsSection>

          <StatsSection title="Daily patterns" className="stats-section-supporting">
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
