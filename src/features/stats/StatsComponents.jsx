import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import EmptyState from "../../components/EmptyState";

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
      <button className="stat-card metric-btn" onClick={() => openMetricHelp("stability")} type="button">
        <div className="stat-val stats-metric-value" style={{ color: stabilityTone.color }}>
          {calmMedian != null ? fmt(calmMedian) : "—"}
        </div>
        <div className="stat-lbl stats-metric-label">Stability</div>
      </button>
      <button className="stat-card metric-btn" onClick={() => openMetricHelp("momentum")} type="button">
        <div className="stat-val stats-metric-value" style={{ color: momentumTone.color }}>
          {calmRate7 != null ? `${calmRate7}%` : "—"}
        </div>
        <div className="stat-lbl stats-metric-label">Momentum</div>
      </button>
      <button className="stat-card metric-btn" onClick={() => openMetricHelp("adherence")} type="button">
        <div className="stat-val stats-metric-value" style={{ color: adherenceTone.color }}>
          {adherenceByDay != null ? `${adherenceByDay}%` : "—"}
        </div>
        <div className="stat-lbl stats-metric-label">Adherence</div>
      </button>
      <button className="stat-card metric-btn" onClick={() => openMetricHelp("relapseRisk")} type="button">
        <div className="stat-val stats-metric-value" style={{ color: relapseTone.color }}>
          {relapseRisk ? "High" : "Low"}
        </div>
        <div className="stat-lbl stats-metric-label">Relapse risk</div>
      </button>
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
          <XAxis dataKey="session" tick={{fontSize:13,fill:"var(--text-muted)",fontWeight:400,fontFamily:"SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:13,fill:"var(--text-muted)",fontWeight:400,fontFamily:"SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{background:"var(--brown)",border:"none",borderRadius:10,color:"white",fontSize:13,fontWeight:400,fontFamily:"SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}} labelStyle={{color:"var(--green-light)",fontSize:13,fontWeight:400,fontFamily:"SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}} formatter={(v,n,p)=>[`${v}m — ${distressLabel(p.payload.distressLevel)}`,"Duration"]}/>
          <ReferenceLine y={goalSec/60} stroke="var(--green-dark)" strokeDasharray="4 4" label={{value:"Goal",position:"right",fontSize:13,fill:"var(--green-dark)",fontWeight:400,fontFamily:"SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}}/>
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
