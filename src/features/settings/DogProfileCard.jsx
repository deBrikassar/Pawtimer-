export default function DogProfileCard({
  dogName,
  reminderSummary,
  sessionsPerDayMax,
  customLabelCount,
  syncSummary,
  onOpenProfile,
}) {
  const syncTone = syncSummary?.badgeState || "neutral";
  const syncLabel = syncSummary?.label || "Status unavailable";
  const cardStatus = syncTone === "ok"
    ? "Steady"
    : syncTone === "warn"
      ? "Needs review"
      : "Attention needed";

  return (
    <button
      type="button"
      className="settings-dog-profile-card"
      aria-label={`Open ${dogName} profile settings`}
      onClick={onOpenProfile}
    >
      <div className="settings-dog-profile-card__identity">
        <div className="settings-dog-profile-avatar" aria-hidden="true">
          {String(dogName || "D").trim().charAt(0).toUpperCase()}
        </div>
        <div className="settings-dog-profile-card__titles">
          <div className="settings-simple-title">Active dog profile</div>
          <div className="settings-dog-profile-card__name">{dogName}</div>
          <div className="settings-dog-profile-card__state">
            <span className={`settings-dog-profile-card__state-dot settings-dog-profile-card__state-dot--${syncTone}`} aria-hidden="true" />
            <span>{cardStatus}</span>
            <span className="settings-dog-profile-card__divider" aria-hidden="true">•</span>
            <span>{syncLabel}</span>
          </div>
        </div>
        <span className="settings-dog-profile-card__chevron" aria-hidden="true">›</span>
      </div>

      <div className="settings-dog-profile-card__meta" aria-label="Dog status summary">
        <div className="settings-profile-chip">{reminderSummary} reminders</div>
        <div className="settings-profile-chip">Plan: max {sessionsPerDayMax} sessions/day</div>
        <div className="settings-profile-chip">{customLabelCount} custom labels</div>
      </div>
    </button>
  );
}
