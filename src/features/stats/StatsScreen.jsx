import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow, ProgressHero, StatsInsightCard, BentoGrid, StatsBentoWidget } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";
import { ContextHint } from "../../components/primitives/Primitives";
import { useHint } from "../app/useHint";

export default function StatsScreen({ name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, goalSec, overallGoalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone, contextualInsights, streak, calmRate7 }) {
  const target = recommendation?.duration ?? 0;
  const hasValidBestCalm = Number.isFinite(bestCalm) && bestCalm >= 0;
  const hasOverallGoal = Number.isFinite(overallGoalSec) && overallGoalSec > 0;
  const progressRatio = hasValidBestCalm && hasOverallGoal
    ? Math.max(0, Math.min(bestCalm / overallGoalSec, 1))
    : null;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  
  const statsHint = useHint(`stats_${name}`);

  return (
    <div className="tab-content stats-tab-content" data-ring-metric-variant={ringMetricVariant}>
      <div className="section">
        {totalCount === 0 ? (
          <EmptyState media={<SproutIcon />} title="Progress starts here" body={`Complete your first session and ${name}'s progress, streak, and chart will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
        ) : <>
          {statsHint.isVisible && (
            <ContextHint
              title="Understanding your progress"
              body="The Journey curve shows the trend of your training. Small setbacks are normal! The 'Risk' signal warns you if you might be pushing too fast."
              action={<button type="button" className="secondary-control secondary-control--inline-text" onClick={statsHint.dismiss}>Got it</button>}
              className="mb-4"
            />
          )}
          
          <div className="stats-hero-wrap u-mb-section">
            <ProgressHero
              name={name}
              headlineStatus={headlineStatus}
              headline={hasValidBestCalm && hasOverallGoal ? `${Math.round(progressRatio * 100)}% to Overall Goal` : "Training Progress"}
              headlineSurfaceState={headlineSurfaceState}
              currentValue={fmt(bestCalm)}
              currentLabel="Best time"
              currentSeconds={bestCalm}
              targetValue={fmt(target)}
              targetLabel="Next target"
              targetSeconds={target}
              insight={relapseTone && relapseTone.label !== "Stable" ? `⚠️ Risk: ${relapseTone.label} - Consider slowing down` : null}
              overallGoalProgress={hasValidBestCalm && hasOverallGoal ? Math.round(progressRatio * 100) : 0}
            />
          </div>

          <div className="stats-hero-wrap u-mb-section">
            <StatsChartSection chartData={chartData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </div>

          <StatsSection title="Daily rhythm" className="stats-section-supporting">
            <BentoGrid>
              <StatsBentoWidget
                value={streak ?? 0}
                label="Calm streak"
                icon="🐾"
                accentColor="streak"
              />
              <StatsBentoWidget
                value={totalCount}
                label="Total sessions"
                icon="🦴"
                accentColor="streak"
              />
              <StatsBentoWidget
                value={avgWalkDuration != null ? fmt(avgWalkDuration, { hoursMinutesOnly: true }) : "—"}
                label="Avg walk"
                icon="🦮"
                accentColor="warm"
              />
              <StatsBentoWidget
                value={calmRate7 != null ? `${calmRate7}%` : "—"}
                label="Calm rate (7d)"
                icon="🎾"
                accentColor="calm"
              />
              <StatsBentoWidget
                value={fmt(aloneLastWeek)}
                label="Alone time/wk"
                icon="🏡"
                accentColor="warm"
              />
              <StatsBentoWidget
                value={avgSessionsPerDay != null ? avgSessionsPerDay.toFixed(1) : "—"}
                label="Sessions/day"
                icon="🔁"
                accentColor="calm"
              />
            </BentoGrid>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
