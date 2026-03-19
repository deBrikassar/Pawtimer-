import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import EmptyState from "../../components/EmptyState";

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

export function StatsProgressRing({ value, label, progress, fillClassName, onLabelClick }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(progress, 1));

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
            <span className="ring-val-primary">{value}</span>
          </div>
        </div>
      </div>
      <button className="ring-sub-btn" onClick={onLabelClick}>{label}</button>
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
          <CartesianGrid stroke="rgba(75,60,48,0.08)" vertical={false}/>
          <XAxis dataKey="session" tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{background:"var(--brown)",border:"none",borderRadius:10,color:"white",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} labelStyle={{color:"var(--green-light)",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} formatter={(_v,_n,p)=>[`${fmt(p.payload.durationSeconds)} — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
          <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={{value:"Goal",position:"right",fontSize:"var(--text-sm)",fill:"var(--green-dark)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}}/>
          <Line type="monotone" dataKey="durationMinutes" stroke="var(--brown)" strokeWidth={2.5} dot={<CustomDot/>} activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
