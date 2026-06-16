import { useEffect, useId, useMemo, useState, useRef } from "react";
import EmptyState from "../../components/EmptyState";
import { TrendIcon } from "../app/ui";

export const METRIC_VARIANTS = Object.freeze({
  HEADLINE: "headline",
  STANDARD: "standard",
  RING: "ring",
});

const WAVE_CHART_WIDTH = 720;
const WAVE_CHART_HEIGHT = 220;
const WAVE_CHART_PADDING = { top: 18, right: 20, bottom: 32, left: 48 };

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

export function StatsSection({ title, children, className = "", centerTitle = false }) {
  return (
    <div className={`stats-section ${className}`.trim()}>
      <h2 className={`stats-section-title ${centerTitle ? "stats-section-title--centered" : ""}`}>{title}</h2>
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

export function StatsSupportRow({ label, value, progress = null }) {
  const hasProgress = progress !== null && Number.isFinite(progress);
  return (
    <div className={`stats-support-row surface-row info-row ${hasProgress ? "stats-support-row--with-progress" : ""}`.trim()}>
      <div className="stats-support-row-top">
        <div className="stats-support-label-wrap surface-row__label-wrap info-row__label-wrap">
          <span className="stats-support-label surface-row__label info-row__label">{label}</span>
        </div>
        <span className="stats-support-value surface-row__value info-row__value">{value}</span>
      </div>
      {hasProgress && (
        <div className="stats-support-progress-track">
          <div
            className="stats-support-progress-fill"
            style={ { width: `${Math.max(0, Math.min(progress, 1)) * 100}%` } }
          />
        </div>
      )}
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
  overallGoalProgress = null,
}) {
  const dogInitial = (name || "D").trim().charAt(0).toUpperCase();
  const progressRatio = Number.isFinite(currentSeconds) && Number.isFinite(targetSeconds) && targetSeconds > 0
    ? Math.max(0, Math.min(currentSeconds / targetSeconds, 1))
    : null;
  const progressPct = progressRatio != null ? Math.round(progressRatio * 100) : null;

  // Resolve overall goal progress percentage from prop or parsed from headline text
  const overallGoalPct = overallGoalProgress ?? (
    headline && headline.match(/(\d+)%/) ? parseInt(headline.match(/(\d+)%/)[1], 10) : 0
  );

  const heroRadius = 42;
  const heroCircumference = 2 * Math.PI * heroRadius;
  const heroStrokeDashoffset = heroCircumference - (Math.min(overallGoalPct, 100) / 100) * heroCircumference;

  return (
    <div className="surface-card surface-card--chart progress-hero-card">
      
      {/* Panel 1 (Left Inset Well) */}
      <div className="progress-hero-inset-panel">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark, #4D7C0F)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="progress-hero-icon">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span className="progress-hero-stat-value">{currentValue}</span>
        <span className="progress-hero-stat-label">{currentLabel}</span>
      </div>
      
      {/* Panel 2 (Center Inset Well) */}
      <div className="progress-hero-inset-panel">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark, #4D7C0F)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="progress-hero-icon">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="6"></circle>
          <circle cx="12" cy="12" r="2"></circle>
        </svg>
        <span className="progress-hero-stat-value">{targetValue}</span>
        <span className="progress-hero-stat-label">{targetLabel}</span>
      </div>

      {/* Panel 3 (Right Progress Ring) */}
      <div className="progress-hero-ring-container">
        {/* SVG Progress Ring */}
        <svg className="progress-hero-ring-svg" viewBox="0 0 100 100">
          {/* Background Track */}
          <circle cx="50" cy="50" r="42" stroke="#F5F5F4" strokeWidth="8" fill="none" />
          {/* Active Progress Line */}
          <circle 
            cx="50" cy="50" r="42" 
            stroke="#4D7C0F" strokeWidth="8" fill="none" 
            strokeDasharray={heroCircumference} strokeDashoffset={heroStrokeDashoffset} 
            strokeLinecap="round" 
          />
        </svg>
        
        {/* Centered Text */}
        <div className="progress-hero-ring-text">
          <span className="progress-hero-ring-pct">{overallGoalPct}%</span>
          <span className="progress-hero-ring-lbl">of goal</span>
        </div>
      </div>
      
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

export function StatsChartSection({ distributionData, setTab, name }) {
  if (!distributionData || distributionData.length === 0 || distributionData.every(d => d.total === 0)) {
    return (
      <EmptyState
        media={<TrendIcon />}
        title="Almost there"
        body={`Complete your first session to see ${name}'s progress chart.`}
        ctaLabel="Start training →"
        onCta={() => setTab("home")}
      />
    );
  }

  const maxTotal = Math.max(...distributionData.map(d => d.total));
  const maxAxisValue = Math.max(4, maxTotal + (maxTotal % 2 === 0 ? 2 : 1));

  return (
    <div className="chart-wrap chart-wrap-full surface-card surface-card--chart" style={{ overflow: "hidden", position: "relative", padding: "20px 20px 16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", zIndex: 2, position: "relative" }}>
        <div className="chart-title" style={{ fontWeight: "var(--font-semibold)", color: "#4A4A4A", margin: 0, paddingTop: "4px" }}>Session duration distribution</div>
        
        {/* Legend */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surf)", padding: "4px 12px", borderRadius: "99px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--green-light)", boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.6)" }}></div>
            <span style={{ fontSize: "var(--text-sm)", color: "#4A4A4A", fontWeight: "var(--font-medium)" }}>Successful</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surf)", padding: "4px 12px", borderRadius: "99px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "color-mix(in srgb, var(--surface-muted) 80%, #D8D3CC)", boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.6)" }}></div>
            <span style={{ fontSize: "var(--text-sm)", color: "#4A4A4A", fontWeight: "var(--font-medium)" }}>Unsuccessful</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: "12px", position: "relative", paddingLeft: "28px", paddingBottom: "24px", minHeight: "220px", marginTop: "8px" }}>
        
        {/* Y-axis Labels */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: "24px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#888", fontSize: "12px", fontWeight: "600", paddingBottom: "4px" }}>
          <span>{maxAxisValue}</span>
          <span>{Math.round(maxAxisValue / 2)}</span>
          <span>0</span>
        </div>

        {/* Y-axis Lines */}
        <div style={{ position: "absolute", left: "24px", right: 0, top: "8px", borderTop: "1px dashed color-mix(in srgb, var(--border) 60%, transparent)", zIndex: 0 }}></div>
        <div style={{ position: "absolute", left: "24px", right: 0, top: "calc(50% - 8px)", borderTop: "1px dashed color-mix(in srgb, var(--border) 60%, transparent)", zIndex: 0 }}></div>
        <div style={{ position: "absolute", left: "24px", right: 0, bottom: "24px", borderTop: "1px solid color-mix(in srgb, var(--border) 80%, transparent)", zIndex: 0 }}></div>

        {distributionData.map((bin, i) => {
          const heightPercent = maxAxisValue > 0 ? (bin.total / maxAxisValue) * 100 : 0;
          const successfulPercent = bin.total > 0 ? (bin.successful / bin.total) * 100 : 0;
          const unsuccessfulPercent = bin.total > 0 ? (bin.unsuccessful / bin.total) * 100 : 0;

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, position: "relative" }}>
              
              {/* Bar track (Concave Neumorphic Inset) */}
              <div style={{ 
                flex: 1, 
                width: "100%", 
                maxWidth: "44px", 
                background: "var(--surf)", 
                boxShadow: "var(--neu-shadow-in, inset 3px 3px 6px color-mix(in srgb, var(--border) 40%, transparent), inset -3px -3px 6px rgba(255, 255, 255, 0.7))",
                borderRadius: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                position: "relative",
                padding: "4px"
              }}>
                {/* Bar fills wrapper */}
                <div style={{ height: `${heightPercent}%`, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: bin.total > 0 ? "8px" : "0" }}>
                  
                  {/* Unsuccessful (top of stack) */}
                  {bin.unsuccessful > 0 && (
                    <div style={{ 
                      height: `${unsuccessfulPercent}%`, 
                      width: "100%", 
                      background: "color-mix(in srgb, var(--surface-muted) 80%, #D8D3CC)", 
                      boxShadow: "var(--shadow-sm)", 
                      borderTopLeftRadius: "12px", 
                      borderTopRightRadius: "12px",
                      borderBottomLeftRadius: bin.successful === 0 ? "12px" : "3px",
                      borderBottomRightRadius: bin.successful === 0 ? "12px" : "3px",
                      marginBottom: bin.successful > 0 ? "2px" : "0",
                      transition: "height 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                      position: "relative"
                    }}></div>
                  )}
                  
                  {/* Successful (bottom of stack) */}
                  {bin.successful > 0 && (
                    <div style={{ 
                      height: `${successfulPercent}%`, 
                      width: "100%", 
                      background: "var(--green-light)", 
                      boxShadow: "var(--shadow-sm)", 
                      borderTopLeftRadius: bin.unsuccessful === 0 ? "12px" : "3px",
                      borderTopRightRadius: bin.unsuccessful === 0 ? "12px" : "3px",
                      borderBottomLeftRadius: "12px",
                      borderBottomRightRadius: "12px",
                      transition: "height 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                      position: "relative"
                    }}></div>
                  )}
                  
                </div>
              </div>

              {/* X-axis Label */}
              <div style={{ 
                position: "absolute",
                bottom: "-20px",
                fontSize: "11px", 
                fontWeight: "600", 
                color: "#7A7A7A",
                textAlign: "center",
                whiteSpace: "nowrap",
                transform: "scale(0.95)"
              }}>
                {bin.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Bento Grid Components ─────────────────────────────────────────────── */

export function BentoGrid({ children, className = "" }) {
  return (
    <div className={`bento-grid ${className}`.trim()}>
      {children}
    </div>
  );
}

export function StatsBentoWidget({
  value,
  label,
  icon = null,
  shape = "circle",
  accentColor = "streak",
  className = "",
}) {
  return (
    <div className={`stats-bento-widget ${className}`.trim()}>
      <div className="stats-bento-icon-wrap glass-panel">
        {icon && (
          <div className="stats-bento-icon-inner">
            {typeof icon === "string" ? <span className="stats-bento-icon-emoji">{icon}</span> : icon}
          </div>
        )}
        <span className="stats-bento-value">{value}</span>
      </div>
      <span className="stats-bento-label">{label}</span>
    </div>
  );
}
