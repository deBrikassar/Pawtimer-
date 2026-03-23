import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import EmptyState from "../../components/EmptyState";


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
      <p className="stats-section-title">{title}</p>
      {children}
    </div>
  );
}

export function StatsMetricCard({ value, label, className = "", valueStyle, detail = null, onClick = null, buttonLabel = null }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`stat-card ${className}`.trim()}
      onClick={onClick || undefined}
      type={onClick ? "button" : undefined}
      aria-label={buttonLabel || label}
    >
      <div className="stat-val stats-metric-value" style={valueStyle}>{value}</div>
      <div className="stat-lbl stats-metric-label">{label}</div>
      {detail ? <div className="stats-metric-detail">{detail}</div> : null}
    </Tag>
  );
}

export function StatsSupportRow({ label, value }) {
  return (
    <div className="stats-support-row">
      <div className="stats-support-label-wrap">
        <span className="stats-support-label">{label}</span>
      </div>
      <span className="stats-support-value">{value}</span>
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
          <div className="ring-val">
            <span className="ring-val-primary">{displayValue}</span>
          </div>
        </div>
      </div>
      <div className="ring-sub-btn" aria-label={label}>
        <span className="ring-sub-btn-text">{label}</span>
      </div>
    </div>
  );
}

export function StatsChartSection({ chartData, goalSec, CustomDot, setTab, name, distressLabel, fmt, insightLabel }) {
  if (chartData.length <= 1) {
    return (
      <EmptyState
        icon="📈"
        title="Almost there"
        body={`Complete 2 more sessions to see ${name}'s progress chart and trends.`}
        ctaLabel="Start training →"
        onCta={() => setTab("home")}
      />
    );
  }

  return (
    <div className="chart-wrap chart-wrap-full">
      {insightLabel ? <div className="chart-insight">{insightLabel}</div> : null}
      <div className="chart-title">Session duration over time (min)</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{top:5,right:24,left:-14,bottom:5}}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false}/>
          <XAxis dataKey="session" tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{background:"#111827",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,color:"white",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)",boxShadow:"0 16px 30px rgba(15,23,42,0.20)"}} labelStyle={{color:"var(--green-light)",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} formatter={(_v,_n,p)=>[`${fmt(p.payload.durationSeconds)} — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
          <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={{value:"Goal",position:"right",fontSize:"var(--text-sm)",fill:"var(--green-dark)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}}/>
          <Line type="monotone" dataKey="durationMinutes" stroke="var(--brown)" strokeWidth={2.5} dot={<CustomDot/>} activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
