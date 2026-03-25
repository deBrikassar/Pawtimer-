import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import EmptyState from "../../components/EmptyState";
import { TrendIcon } from "../app/ui";

export const METRIC_VARIANTS = Object.freeze({
  HEADLINE: "headline",
  STANDARD: "standard",
  RING: "ring",
});

const chartTypography = {
  helperText: {
    fontFamily: "var(--font-main)",
    fontSize: "var(--type-helper-text-size)",
    lineHeight: "var(--type-helper-text-line)",
    fontWeight: "var(--type-helper-text-weight)",
    letterSpacing: "var(--type-helper-text-track)",
  },
  axisTick: {
    fill: "var(--text-muted)",
  },
  tooltipContent: {
    background: "var(--chart-tooltip-bg)",
    border: "1px solid var(--chart-tooltip-border)",
    borderRadius: 12,
    color: "white",
    boxShadow: "var(--chart-tooltip-shadow)",
  },
  tooltipLabel: {
    color: "var(--green-light)",
  },
  referenceLabel: {
    fill: "var(--green-dark)",
  },
};

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
  onClick = null,
  buttonLabel = null,
  variant = METRIC_VARIANTS.STANDARD,
}) {
  const Tag = onClick ? "button" : "div";
  const variantClass = `metric-surface metric-surface--${variant}`;
  return (
    <Tag
      className={`stat-card ${variantClass} ${className}`.trim()}
      onClick={onClick || undefined}
      type={onClick ? "button" : undefined}
      aria-label={buttonLabel || label}
    >
      <div className="stat-val stats-metric-value">{value}</div>
      <div className="stat-lbl stats-metric-label">{label}</div>
      {detail ? <div className="stats-metric-detail">{detail}</div> : null}
    </Tag>
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

export function StatsProgressRing({
  value,
  numericValue = null,
  formatValue = null,
  label,
  progress,
  fillClassName,
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
    <div className="ring-col">
      <div className="ring-wrap">
        <svg className="ring-svg" width={84} height={84} viewBox="0 0 88 88" aria-hidden="true">
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
        <div className="ring-inner">
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

export function StatsChartSection({ chartData, goalSec, CustomDot, setTab, name, distressLabel, fmt, insightLabel }) {
  if (chartData.length <= 1) {
    return (
      <EmptyState
        media={<TrendIcon />}
        title="Almost there"
        body={`Complete 2 more sessions to see ${name}'s progress chart and trends.`}
        ctaLabel="Start training →"
        onCta={() => setTab("home")}
      />
    );
  }

  return (
    <div className="chart-wrap chart-wrap-full surface-card surface-card--chart">
      {insightLabel ? <div className="chart-insight">{insightLabel}</div> : null}
      <div className="chart-title">Session duration over time (min)</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{top:5,right:24,left:-14,bottom:5}}>
          <CartesianGrid stroke="var(--chart-grid-stroke)" vertical={false}/>
          <XAxis dataKey="session" tick={{ ...chartTypography.helperText, ...chartTypography.axisTick }} tickLine={false} axisLine={false}/>
          <YAxis tick={{ ...chartTypography.helperText, ...chartTypography.axisTick }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{ ...chartTypography.helperText, ...chartTypography.tooltipContent }} labelStyle={{ ...chartTypography.helperText, ...chartTypography.tooltipLabel }} formatter={(_v,_n,p)=>[`${fmt(p.payload.durationSeconds)} — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
          <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={{ value:"Goal", position:"right", ...chartTypography.helperText, ...chartTypography.referenceLabel }}/>
          <Line type="monotone" dataKey="durationMinutes" stroke="var(--brown)" strokeWidth={2.5} dot={<CustomDot/>} activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
