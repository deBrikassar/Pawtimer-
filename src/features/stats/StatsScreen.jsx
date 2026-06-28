import EmptyState from "../../components/EmptyState";
import { METRIC_VARIANTS, StatsChartSection, StatsMetricCard, StatsSection, StatsSupportRow, ProgressHero, StatsInsightCard, BentoGrid, StatsBentoWidget } from "./StatsComponents";
import { fmt } from "../app/helpers";
import { SproutIcon } from "../app/ui";
import { ContextHint } from "../../components/primitives/Primitives";
import { useHint } from "../app/useHint";

import { useApp } from "../app/AppContext";

export default function StatsScreen() {
  const { name, totalCount, setTab, bestCalm, recommendation, relapseTone, chartData, distributionData, goalSec, overallGoalSec, CustomDot, distressLabel, chartTrendLabel, aloneLastWeek, avgWalkDuration, avgSessionsPerDay, avgWalksPerDay, headlineStatus, headlineStatusTone, contextualInsights, streak, calmRate7, sessions } = useApp();
  const target = recommendation?.duration ?? 0;
  const hasValidBestCalm = Number.isFinite(bestCalm) && bestCalm >= 0;
  const hasOverallGoal = Number.isFinite(goalSec) && goalSec > 0;
  const progressRatio = hasOverallGoal
    ? Math.max(0, Math.min(bestCalm / goalSec, 1))
    : null;
  const ringMetricVariant = METRIC_VARIANTS.RING;
  const headlineSurfaceState = headlineStatusTone?.surfaceState || "today";
  
  const statsHint = useHint(`stats_${name}`);

  const fmtMinutes = (seconds, options) => {
    if (seconds == null || Number.isNaN(Number(seconds))) return "—";
    const mins = Math.round(seconds / 60);
    return fmt(mins * 60, { ...options, hoursMinutesOnly: true });
  };

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
              headline={progressRatio !== null ? `${Math.round(progressRatio * 100)}% to Overall Goal` : "Training Progress"}
              headlineSurfaceState={headlineSurfaceState}
              currentValue={fmtMinutes(bestCalm)}
              currentLabel="Best time"
              currentSeconds={bestCalm}
              targetValue={fmtMinutes(target)}
              targetLabel="Next target"
              targetSeconds={target}
              insight={relapseTone && relapseTone.label !== "Stable" ? `⚠️ Risk: ${relapseTone.label} - Consider slowing down` : null}
              overallGoalProgress={progressRatio !== null ? Math.round(progressRatio * 100) : 0}
            />
          </div>

          <div className="stats-hero-wrap u-mb-section">
            <StatsChartSection chartData={chartData} distributionData={distributionData} goalSec={goalSec} CustomDot={CustomDot} setTab={setTab} name={name} distressLabel={distressLabel} fmt={fmt} insightLabel={chartTrendLabel} />
          </div>

          <StatsSection title="Daily rhythm" className="stats-section-supporting" centerTitle={true}>
            <BentoGrid>
              <StatsBentoWidget
                value={streak ?? 0}
                label="Calm streak"
                icon={<img src="/icons/icon-calm-streak.webp" alt="Calm streak" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="streak"
              />
              <StatsBentoWidget
                value={totalCount}
                label="Sessions"
                icon={<img src="/icons/icon-total-sessions.webp" alt="Total sessions" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="streak"
              />
              <StatsBentoWidget
                value={avgWalkDuration != null ? fmtMinutes(avgWalkDuration, { hoursMinutesOnly: true }) : "—"}
                label="Avg walk"
                icon={<img src="/icons/icon-avg-walk.webp" alt="Avg walk" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="warm"
              />
              <StatsBentoWidget
                value={calmRate7 != null ? `${calmRate7}%` : "—"}
                label="Calm rate"
                icon={<img src="/icons/icon-calm-rate.webp" alt="Calm rate" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="calm"
              />
              <StatsBentoWidget
                value={fmtMinutes(aloneLastWeek)}
                label="Alone time"
                icon={<img src="/icons/icon-alone-time.webp" alt="Alone time" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="warm"
              />
              <StatsBentoWidget
                value={avgSessionsPerDay != null ? avgSessionsPerDay.toFixed(1) : "—"}
                label="Daily avg"
                icon={<img src="/icons/icon-sessions-day.webp" alt="Sessions/day" width="48" height="48" className="stats-bento-icon-img" />}
                accentColor="calm"
              />
            </BentoGrid>
          </StatsSection>
        </>}
      </div>
    </div>
  );
}
