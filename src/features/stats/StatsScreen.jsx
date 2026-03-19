import EmptyState from "../../components/EmptyState";
import { StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, target, relapseTone, openMetricHelp, chartData, goalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, currentThreshold, headlineStatus, headlineStatusColor }) {
  return (
    <div className="tab-content">
      <div className="section">
        <div className="section-title">{name}'s Progress</div>
        {totalCount === 0 ? (
          <EmptyState icon="🌱" title="Progress starts here" body={`Complete your first session and ${name}'s stats, streak, and progress chart will appear here.`} ctaLabel="Start first session →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection title="Overview" className="stats-section-priority">
            <div className="stats-headline-card">
              <span className="stats-headline-label">Current threshold</span>
              <div className="stats-headline-main">
                <span className="stats-headline-value">{fmt(currentThreshold)}</span>
                <span className="stats-headline-status" style={{ color: headlineStatusColor }}>{headlineStatus}</span>
              </div>
            </div>
          </StatsSection>

          <StatsSection title="Core metrics">
            <div className="stats-row stats-row-core stats-row-core-trimmed">
              <StatsMetricCard value={fmt(bestCalm)} label="Best calm time" />
              <StatsMetricCard value={fmt(target)} label="Next target" detail="Tap for factors" onClick={() => openMetricHelp("nextTarget")} buttonLabel="Open Next target explanation" />
              <StatsMetricCard value={relapseTone.label} label="Risk" valueStyle={{ color: relapseTone.color }} />
            </div>
          </StatsSection>

          <StatsSection title="Progression">
            <StatsChartSection chartData={chartData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </StatsSection>

          <StatsSection title="Supporting metrics" className="stats-section-supporting">
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
