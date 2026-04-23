import { useEffect, useId, useMemo, useState } from "react";
import EmptyState from "../../components/EmptyState";
import { TrendIcon } from "../app/ui";

export const METRIC_VARIANTS = Object.freeze({
  HEADLINE: "headline",
  STANDARD: "standard",
  RING: "ring",
});

const WAVE_CHART_WIDTH = 720;
const WAVE_CHART_HEIGHT = 220;
const WAVE_CHART_PADDING = { top: 18, right: 20, bottom: 32, left: 20 };
function buildSmoothPathThroughPoints(points = [], tension = 0.18) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;

    const c1x = current.x + ((next.x - previous.x) * tension);
    const c1y = current.y + ((next.y - previous.y) * tension);
    const c2x = next.x - ((afterNext.x - current.x) * tension);
    const c2y = next.y - ((afterNext.y - current.y) * tension);

    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`;
  }

  return path;
}

function useAnimatedValue(value, { duration = 180, round = false } = {}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setDisplayValue(value);
      return undefined;
    }

    let frameId = 0;
    let startTime = 0;

    setDisplayValue((previousValue) => {
      const fromValue = Number.isFinite(previousValue) ? previousValue : value;

      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = 1 - ((1 - progress) * (1 - progress));
        const nextValue = fromValue + ((value - fromValue) * eased);
        setDisplayValue(round ? Math.round(nextValue) : nextValue);
        if (progress < 1) frameId = window.requestAnimationFrame(animate);
      };

      frameId = window.requestAnimationFrame(animate);
      return fromValue;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [duration, round, value]);

  return displayValue;
}

export function StatsSection({ title, children, className = "" }) {
  return (
    <div className={`stats-section ${className}`.trim()}>
      <h2 className="stats-section-title">{title}</h2>
      {children}
    </div>
  );
}

export function StatsMetricCard({
  value,
  label,
  className = "",
  detail = null,
  variant = METRIC_VARIANTS.STANDARD,
}) {
  const Tag = "div";
  const variantClass = `metric-surface metric-surface--${variant}`;
  return (
    <div className="stats-metric-anchor">
      <Tag
        className={`stat-card ${variantClass} ${className}`.trim()}
        aria-label={label}
      >
        <div className="stat-val stats-metric-value">{value}</div>
        <div className="stat-lbl stats-metric-label">{label}</div>
        {detail ? <div className="stats-metric-detail">{detail}</div> : null}
      </Tag>
    </div>
  );
}

export function StatsSupportRow({ label, value }) {
  return (
    <div className="stats-support-row surface-row info-row">
      <div className="stats-support-label-wrap surface-row__label-wrap info-row__label-wrap">
        <span className="stats-support-label surface-row__label info-row__label">{label}</span>
      </div>
      <span className="stats-support-value surface-row__value info-row__value">{value}</span>
    </div>
  );
}

export function StatsInsightCard({ message, detail, tone = "neutral", index = 0 }) {
  const staggerIndex = Math.max(0, Math.min(index, 5));
  return (
    <article
      className={`stats-insight-card stats-insight-card--${tone} stats-insight-card--stagger-${staggerIndex}`.trim()}
      aria-live="polite"
    >
      <p className="stats-insight-message">{message}</p>
      {detail ? <p className="stats-insight-detail">{detail}</p> : null}
    </article>
  );
}

export function ProgressHero({
  name,
  headlineStatus,
  headline,
  headlineSurfaceState = "today",
  currentValue,
  currentLabel = "Current window",
  currentSeconds = null,
  targetValue,
  targetLabel = "Next target",
  targetSeconds = null,
  insight,
}) {
  const dogInitial = (name || "D").trim().charAt(0).toUpperCase();
  const progressRatio = Number.isFinite(currentSeconds) && Number.isFinite(targetSeconds) && targetSeconds > 0
    ? Math.max(0, Math.min(currentSeconds / targetSeconds, 1))
    : null;
  const progressPct = progressRatio != null ? Math.round(progressRatio * 100) : null;

  return (
    <div
      className={`stats-progress-hero metric-surface metric-surface--headline surface-state--${headlineSurfaceState}`.trim()}
      aria-label={`${name}'s progress hero`}
    >
      <span className="stats-progress-hero-aura" aria-hidden="true" />
      <div className="stats-progress-hero-topline">
        <div className="stats-progress-dog-chip">
          <span className="stats-progress-dog-mark" aria-hidden="true">{dogInitial}</span>
          <span className="stats-progress-dog-name">{name}</span>
        </div>
        <span className="stats-progress-headline-status">{headlineStatus}</span>
      </div>

      <h3 className="stats-progress-headline">{headline || headlineStatus}</h3>

      <div className="stats-progress-values" role="group" aria-label="Current value and next step">
        <div className="stats-progress-value-block">
          <div className="stats-progress-value">{currentValue}</div>
          <div className="stats-progress-label">{currentLabel}</div>
        </div>
        <div className="stats-progress-value-divider" aria-hidden="true" />
        <div className="stats-progress-value-block">
          <div className="stats-progress-value stats-progress-value--target">{targetValue}</div>
          <div className="stats-progress-label">{targetLabel}</div>
        </div>
      </div>

      {progressPct != null ? (
        <div className="stats-progress-rail-wrap" aria-label={`${progressPct}% toward next target`}>
          <svg className="stats-progress-rail" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true">
            <rect className="stats-progress-rail-track" x="0" y="0" width="100" height="7" rx="3.5" ry="3.5" />
            <rect className="stats-progress-rail-fill" x="0" y="0" width={Math.max(progressPct, 6)} height="7" rx="3.5" ry="3.5" />
          </svg>
          <span className="stats-progress-rail-text">{progressPct}% to next step</span>
        </div>
      ) : null}

      {insight ? <p className="stats-progress-insight">{insight}</p> : null}
    </div>
  );
}

export function StatsProgressRing({
  value,
  numericValue = null,
  formatValue = null,
  label,
  progress,
  fillClassName,
  className = "",
  ringWrapClassName = "",
  showRecoveryPulse = false,
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const animatedValue = useAnimatedValue(
    Number.isFinite(numericValue) ? numericValue : null,
    { duration: 180, round: Number.isInteger(numericValue) },
  );
  const displayValue = useMemo(() => {
    if (!Number.isFinite(numericValue)) return value;
    if (typeof formatValue === "function") return formatValue(animatedValue);
    return Number.isInteger(numericValue) ? Math.round(animatedValue) : animatedValue.toFixed(1);
  }, [animatedValue, formatValue, numericValue, value]);

  return (
    <div className={`ring-col ${className}`.trim()}>
      <div className={`ring-wrap ${ringWrapClassName}`.trim()}>
        {showRecoveryPulse && (
          <span className="ring-recovery-pulse" aria-hidden="true">
            <span className="ring-recovery-pulse__core" />
            <span className="ring-recovery-pulse__bloom" />
          </span>
        )}
        <svg className="ring-svg" width={88} height={88} viewBox="0 0 88 88" aria-hidden="true">
          <circle cx={44} cy={44} r={radius} className="ring-bg" />
          <circle
            cx={44}
            cy={44}
            r={radius}
            className={fillClassName}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clampedProgress)}
          />
        </svg>
        <div className={`ring-inner ${showRecoveryPulse ? "ring-inner--recovery" : ""}`.trim()}>
          {showRecoveryPulse && (
            <span className="ring-inner-recovery-layers" aria-hidden="true">
              <span className="ring-inner-recovery-face" />
              <span className="ring-inner-recovery-wave" />
              <span className="ring-inner-recovery-core" />
            </span>
          )}
          <div className="ring-val stats-metric-value">
            <span className="ring-val-primary">{displayValue}</span>
          </div>
        </div>
      </div>
      <div className="ring-sub-btn surface-text-button stats-metric-label secondary-control secondary-control--inline-text">
        <span className="ring-sub-btn-text">{label}</span>
      </div>
    </div>
  );
}

export function StatsChartSection({ chartData, goalSec, setTab, name, fmt, insightLabel }) {
  if (chartData.length <= 1) {
    return (
      <EmptyState
        media={<TrendIcon />}
        title="Almost there"
        body={`Complete 2 more reps to see ${name}'s progress chart.`}
        ctaLabel="Start training →"
        onCta={() => setTab("home")}
      />
    );
  }

  const areaGradientId = useId();
  const hasGoal = Number.isFinite(goalSec) && goalSec > 0;
  const goalMinutes = hasGoal ? goalSec / 60 : null;
  const renderableChartData = chartData.filter((entry) => Number.isFinite(Number(entry.durationMinutes)));
  if (renderableChartData.length <= 1) {
    return (
      <EmptyState
        media={<TrendIcon />}
        title="Almost there"
        body={`Complete 2 more reps to see ${name}'s progress chart.`}
        ctaLabel="Start training →"
        onCta={() => setTab("home")}
      />
    );
  }
  const values = renderableChartData.map((entry) => Number(entry.durationMinutes));
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const range = Math.max(1, maxY - minY);
  const chartBottom = WAVE_CHART_HEIGHT - WAVE_CHART_PADDING.bottom;
  const chartTop = WAVE_CHART_PADDING.top;
  const chartWidth = WAVE_CHART_WIDTH - WAVE_CHART_PADDING.left - WAVE_CHART_PADDING.right;

  const points = renderableChartData.map((entry, index) => {
    const ratioX = renderableChartData.length === 1 ? 0 : index / (renderableChartData.length - 1);
    const x = WAVE_CHART_PADDING.left + (ratioX * chartWidth);
    const y = chartBottom - ((values[index] - minY) / range) * (chartBottom - chartTop);
    return { x, y, entry, index };
  });

  const wavePath = buildSmoothPathThroughPoints(points);

  const areaPath = `${wavePath} L ${points.at(-1).x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`;
  const latestPoint = points.at(-1);
  const goalY = hasGoal
    ? chartBottom - ((Math.min(Math.max(goalMinutes, minY), maxY) - minY) / range) * (chartBottom - chartTop)
    : null;
  const midPoint = points[Math.floor(points.length / 2)];
  const tickPoints = [points[0], midPoint, points.at(-1)];

  return (
    <div className="chart-wrap chart-wrap-full surface-card surface-card--chart">
      {insightLabel ? <div className="chart-insight">{insightLabel}</div> : null}
      <div className="chart-title">Rep duration over time (min)</div>
      <div className="stats-progress-wave" role="img" aria-label={`${name}'s recent session durations`}>
        <svg viewBox={`0 0 ${WAVE_CHART_WIDTH} ${WAVE_CHART_HEIGHT}`} className="stats-progress-wave-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id={areaGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--green-light) 30%, transparent)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          <line
            x1={WAVE_CHART_PADDING.left}
            x2={WAVE_CHART_WIDTH - WAVE_CHART_PADDING.right}
            y1={chartBottom}
            y2={chartBottom}
            className="stats-progress-wave-baseline"
          />
          {goalY != null ? (
            <line
              x1={WAVE_CHART_PADDING.left}
              x2={WAVE_CHART_WIDTH - WAVE_CHART_PADDING.right}
              y1={goalY}
              y2={goalY}
              className="stats-progress-wave-goal"
            />
          ) : null}

          <path d={areaPath} fill={`url(#${areaGradientId})`} opacity="0.45" />
          <path
            d={wavePath}
            fill="none"
            stroke="var(--green-dark)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point) => (
            <circle
              key={`point-${point.index}`}
              cx={point.x}
              cy={point.y}
              r="2.4"
              fill="var(--green-dark)"
            />
          ))}

          {latestPoint ? (
            <g transform={`translate(${latestPoint.x} ${latestPoint.y})`} className="stats-progress-wave-latest">
              <circle r="8" className="stats-progress-wave-latest-halo" />
              <circle r="4.25" className="stats-progress-wave-latest-core" />
            </g>
          ) : null}
        </svg>

        <div className="stats-progress-wave-meta">
          {tickPoints.map((point) => (
            <div key={`tick-${point.index}`} className="stats-progress-wave-meta-col">
              <span className="stats-progress-wave-meta-session">Session {point.entry.session}</span>
              <span className="stats-progress-wave-meta-value">{fmt(point.entry.durationSeconds)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
