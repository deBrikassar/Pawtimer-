import { useEffect, useId, useMemo, useState, useRef } from "react";
import EmptyState from "../../components/EmptyState";
import { TrendIcon } from "../app/ui";
import "./StatsComponents.css";

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
    <div className="progress-hero-card">
      
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
    <div className="chart-wrap chart-wrap-full surface-card surface-card--chart stat-chart-container">
      <div className="stat-chart-header">
        <div className="chart-title stat-chart-title">Session duration distribution</div>
        
        {/* Legend */}
        <div className="stat-chart-legend">
          <div className="stat-chart-legend-item">
            <div className="stat-chart-legend-dot stat-chart-legend-dot--success"></div>
            <span className="stat-chart-legend-label">Successful</span>
          </div>
          <div className="stat-chart-legend-item">
            <div className="stat-chart-legend-dot stat-chart-legend-dot--unsuccess"></div>
            <span className="stat-chart-legend-label">Unsuccessful</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="stat-chart-canvas-wrap">
        
        {/* Y-axis Labels */}
        <div className="stat-chart-y-axis-labels">
          <span>{maxAxisValue}</span>
          <span>{Math.round(maxAxisValue / 2)}</span>
          <span>0</span>
        </div>

        {/* Y-axis Lines */}
        <div className="stat-chart-y-axis-line stat-chart-y-axis-line--top"></div>
        <div className="stat-chart-y-axis-line stat-chart-y-axis-line--mid"></div>
        <div className="stat-chart-y-axis-line stat-chart-y-axis-line--bottom"></div>

        {distributionData.map((bin, i) => {
          const heightPercent = maxAxisValue > 0 ? (bin.total / maxAxisValue) * 100 : 0;
          const successfulPercent = bin.total > 0 ? (bin.successful / bin.total) * 100 : 0;
          const unsuccessfulPercent = bin.total > 0 ? (bin.unsuccessful / bin.total) * 100 : 0;

          return (
            <div key={i} className="stat-chart-bar-wrap">
              
              {/* Bar track */}
              <div className="stat-chart-bar-track">
                {/* Bar fills wrapper */}
                <div className="stat-chart-bar-stack" style={{ height: `${heightPercent}%`, minHeight: bin.total > 0 ? "8px" : "0" }}>
                  
                  {/* Unsuccessful (top of stack) */}
                  {bin.unsuccessful > 0 && (
                    <div 
                      className="stat-chart-bar-segment stat-chart-bar-segment--unsuccessful"
                      style={{ 
                        height: `${unsuccessfulPercent}%`, 
                        borderBottomLeftRadius: bin.successful === 0 ? "12px" : "3px",
                        borderBottomRightRadius: bin.successful === 0 ? "12px" : "3px",
                        marginBottom: bin.successful > 0 ? "2px" : "0"
                      }}
                    ></div>
                  )}
                  
                  {/* Successful (bottom of stack) */}
                  {bin.successful > 0 && (
                    <div 
                      className="stat-chart-bar-segment stat-chart-bar-segment--successful"
                      style={{ 
                        height: `${successfulPercent}%`, 
                        borderTopLeftRadius: bin.unsuccessful === 0 ? "12px" : "3px",
                        borderTopRightRadius: bin.unsuccessful === 0 ? "12px" : "3px"
                      }}
                    ></div>
                  )}
                  
                </div>
              </div>

              {/* X-axis Label */}
              <div className="stat-chart-x-axis-label">
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
