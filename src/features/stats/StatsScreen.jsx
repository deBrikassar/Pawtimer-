import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsMetricExplainer, StatsSection, StatsSupportRow } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, target, relapseTone, openMetricHelp, closeMetricHelp, advanceMetricHelp, metricHelpKey, metricExplainers, metricHelpInAutoSequence, metricHelpIsLastStep, chartData, goalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, currentThreshold, headlineStatus, headlineStatusTone }) {
  const headlineMetricVariant = METRIC_VARIANTS.HEADLINE;
  const standardMetricVariant = METRIC_VARIANTS.STANDARD;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  const riskSurfaceState = relapseTone?.surfaceState || "today";

  return (
    <div className="tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Progress starts here" body={`Complete your first session and ${name}'s progress, streak, and chart will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          <StatsSection title="Today" className="stats-section-priority">
            <div className={`stats-metric-anchor ${metricHelpKey === "currentThreshold" ? "is-explainer-open" : ""}`.trim()}>
              <button
                className={`stats-headline-card metric-surface metric-surface--${headlineMetricVariant} surface-state--${headlineSurfaceState}`.trim()}
                data-metric-variant={headlineMetricVariant}
                type="button"
                onClick={() => openMetricHelp("currentThreshold")}
                aria-label="Open Current threshold explanation"
              >
                <span className="stats-headline-label">Current threshold</span>
                <div className="stats-headline-main">
                  <span className="stats-headline-value">{fmt(currentThreshold)}</span>
                  <span className="stats-headline-status">{headlineStatus}</span>
                </div>
              </button>
              {metricHelpKey === "currentThreshold" && metricExplainers.currentThreshold ? (
                <StatsMetricExplainer
                  title={metricExplainers.currentThreshold.title}
                  body={metricExplainers.currentThreshold.body}
                  onClose={closeMetricHelp}
                  onAdvance={advanceMetricHelp}
                  isAutoSequence={metricHelpInAutoSequence}
                  isSequenceComplete={metricHelpIsLastStep}
                />
              ) : null}
            </div>
          </StatsSection>

          <StatsSection title="Key metrics">
            <div className="stats-row stats-row-core stats-row-core-trimmed">
              <StatsMetricCard
                value={fmt(bestCalm)}
                label="Best calm time"
                onClick={() => openMetricHelp("bestCalm")}
                buttonLabel="Open Best calm time explanation"
                variant={standardMetricVariant}
                explainer={metricExplainers.bestCalm}
                isExplainerOpen={metricHelpKey === "bestCalm"}
                onCloseExplainer={closeMetricHelp}
                onAdvanceExplainer={advanceMetricHelp}
                isAutoSequence={metricHelpInAutoSequence}
                isSequenceComplete={metricHelpIsLastStep}
              />
              <StatsMetricCard
                value={fmt(target)}
                label="Next target"
                onClick={() => openMetricHelp("nextTarget")}
                buttonLabel="Open Next target explanation"
                variant={standardMetricVariant}
                explainer={metricExplainers.nextTarget}
                isExplainerOpen={metricHelpKey === "nextTarget"}
                onCloseExplainer={closeMetricHelp}
                onAdvanceExplainer={advanceMetricHelp}
                isAutoSequence={metricHelpInAutoSequence}
                isSequenceComplete={metricHelpIsLastStep}
              />
              <StatsMetricCard
                value={relapseTone.label}
                label="Risk"
                className={`stat-card-risk surface-state--${riskSurfaceState}`}
                onClick={() => openMetricHelp("risk")}
                buttonLabel="Open Risk explanation"
                variant={standardMetricVariant}
                explainer={metricExplainers.risk}
                isExplainerOpen={metricHelpKey === "risk"}
                onCloseExplainer={closeMetricHelp}
                onAdvanceExplainer={advanceMetricHelp}
                isAutoSequence={metricHelpInAutoSequence}
                isSequenceComplete={metricHelpIsLastStep}
              />
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
