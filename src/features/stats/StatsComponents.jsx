import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import EmptyState from "../../components/EmptyState";

export function StatsSection({ title, children }) {
  return (
    <div className="stats-section">
      <p className="stats-section-title">{title}</p>
      {children}
    </div>
  );
}

export function StatsMetricCard({ value, label, className = "", valueStyle }) {
  return (
    <div className={`stat-card ${className}`.trim()}>
      <div className="stat-val stats-metric-value" style={valueStyle}>{value}</div>
      <div className="stat-lbl stats-metric-label">{label}</div>
    </div>
  );
}

function StatsMetricButton({ onClick, value, label, color }) {
  return (
    <button className="stat-card metric-btn" onClick={onClick} type="button">
      <div className="stat-val stats-metric-value" style={{ color }}>
        {value}
      </div>
      <div className="stat-lbl stats-metric-label">{label}</div>
    </button>
  );
}

export function StatsWideInfoCard({ value, label, icon }) {
  return (
    <div className="stat-wide">
      <div>
        <div className="stat-val stats-metric-value">{value}</div>
        <div className="stat-lbl stats-metric-label">{label}</div>
      </div>
      <div className="stat-icon">{icon}</div>
    </div>
  );
}

export function StatsInsightsGrid({
  totalCount,
  openMetricHelp,
  stabilityTone,
  momentumTone,
  adherenceTone,
  relapseTone,
  calmMedian,
  calmRate7,
  adherenceByDay,
  relapseRisk,
  fmt,
}) {
  if (totalCount <= 0) return null;
  return (
    <div className="insights-grid">
      <StatsMetricButton onClick={() => openMetricHelp("stability")} value={calmMedian != null ? fmt(calmMedian) : "—"} label="Stability" color={stabilityTone.color} />
      <StatsMetricButton onClick={() => openMetricHelp("momentum")} value={calmRate7 != null ? `${calmRate7}%` : "—"} label="Momentum" color={momentumTone.color} />
      <StatsMetricButton onClick={() => openMetricHelp("adherence")} value={adherenceByDay != null ? `${adherenceByDay}%` : "—"} label="Adherence" color={adherenceTone.color} />
      <StatsMetricButton onClick={() => openMetricHelp("relapseRisk")} value={relapseRisk ? "High" : "Low"} label="Relapse risk" color={relapseTone.color} />
    </div>
  );
}

export function StatsChartSection({ chartData, goalSec, CustomDot, setTab, name, distressLabel }) {
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
    <div className="chart-wrap">
      <div className="chart-title">Session duration over time (min)</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{top:5,right:24,left:-14,bottom:5}}>
          <CartesianGrid stroke="var(--surf-soft)" vertical={false}/>
          <XAxis dataKey="session" tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:"var(--text-sm)",fill:"var(--text-muted)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{background:"var(--brown)",border:"none",borderRadius:10,color:"white",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} labelStyle={{color:"var(--green-light)",fontSize:"var(--text-sm)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}} formatter={(v,n,p)=>[`${v}m — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
          <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={{value:"Goal",position:"right",fontSize:"var(--text-sm)",fill:"var(--green-dark)",fontWeight:"var(--type-secondary-weight)",fontFamily:"var(--font-main)"}}/>
          <Line type="monotone" dataKey="duration" stroke="var(--brown)" strokeWidth={2.5} dot={<CustomDot/>} activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
      <div className="t-helper" style={{display:"flex",gap:14,justifyContent:"center",marginTop:10,flexWrap:"wrap"}}>
        <span><span style={{color:"var(--green-dark)"}}>●</span> Calm</span>
        <span><span style={{color:"var(--orange)"}}>●</span> Mild</span>
        <span><span style={{color:"var(--red)"}}>●</span> Strong</span>
      </div>
    </div>
  );
}
