import { PATTERN_TYPES } from "../app/helpers";
import { ModalCloseButton } from "../app/ui";
import { useState } from "react";
import DogProfileCard from "./DogProfileCard";

const SETTINGS_PANEL = {
  PROFILE: "profile",
  REMINDERS: "reminders",
  TRAINING: "training",
  LABELS: "labels",
  HELP: "help",
  ADVANCED: "advanced",
  ACCOUNT: "account",
};

function SettingsNavRow({ label, value, onClick, danger = false }) {
  return (
    <button
      type="button"
      className={`settings-nav-row ${danger ? "settings-nav-row--danger" : ""}`}
      onClick={onClick}
    >
      <span className="settings-nav-row__label">{label}</span>
      <span className="settings-nav-row__meta">
        {value ? <span className="settings-nav-row__value">{value}</span> : null}
        <span className="settings-nav-row__chevron" aria-hidden="true">›</span>
      </span>
    </button>
  );
}

function SettingsSheet({ title, titleId, onClose, children, compact = false }) {
  return (
    <div className="quick-modal-overlay quick-modal-overlay--sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className={`quick-modal-card modal-card modal-card--dialog-md quick-modal-card--sheet ${compact ? "quick-modal-card--sheet-compact" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="quick-modal-head">
          <div className="quick-modal-title" id={titleId}>{title}</div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="settings-modal-stack">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SettingsScreen(props) {
  const [activePanel, setActivePanel] = useState(null);
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [diagDetailsOpen, setDiagDetailsOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const {
    name,
    activeDogId,
    copyDogId,
    notifEnabled,
    handleToggleNotif,
    notifTime,
    setNotifTime,
    scheduleNotif,
    dogs,
    activeProto,
    pattern,
    setTrainingSettingsOpen,
    patLabels,
    editingPat,
    setEditingPat,
    setPatLabels,
    syncDiagRunning,
    runSyncDiagnostics,
    SYNC_ENABLED,
    SB_URL,
    SB_KEY,
    SB_BASE_URL,
    syncDiagResult,
    syncSummary,
    syncDegradation,
    recommendation,
    trainingSettingsOpen,
    setProtoWarnAck,
    protoWarnAck,
    protoOverride,
    setProtoOverride,
    setScreen,
    setOnboardingState,
    dogsState,
    setDogs,
    save,
    ACTIVE_DOG_KEY,
    setActiveDogId,
    clearDogActivityState,
  } = props;

  const reminderSummary = notifEnabled ? `On · ${notifTime}` : "Off";
  const recommendationType = recommendation?.details?.recommendationType || "baseline_start";
  const recommendationSummary = recommendation?.details?.summary || recommendation?.explanation;

  return (
    <>
      <div className="tab-content">
        <div className="section settings-shell">
          <div className="section-title">Calm control</div>
          <div className="t-helper">Elegant control for {name}&rsquo;s training rhythm, routine, and account.</div>

          <DogProfileCard
            dogName={name}
            reminderSummary={reminderSummary}
            sessionsPerDayMax={activeProto.sessionsPerDayMax}
            customLabelCount={Object.keys(patLabels).length}
            syncSummary={syncSummary}
            onOpenProfile={() => setActivePanel(SETTINGS_PANEL.PROFILE)}
          />

          <div className="settings-group" role="list" aria-label="Training routine settings">
            <div className="settings-section-label">Training routine</div>
            <div className="settings-inline-card">
              <div className="settings-row-head">
                <span className="settings-inline-title">Daily reminder</span>
                <button className={`notif-toggle secondary-control secondary-control--toggle ${notifEnabled ? "on" : ""}`} onClick={handleToggleNotif} type="button">{notifEnabled ? "On" : "Off"}</button>
              </div>
              <div className="settings-inline-row">
                <span className="settings-secondary-text">Reminder time</span>
                <button
                  type="button"
                  className="settings-inline-btn button-size-secondary-pill secondary-control secondary-control--compact-button"
                  onClick={() => setReminderEditorOpen((prev) => !prev)}
                >
                  {reminderEditorOpen ? "Done" : notifTime}
                </button>
              </div>
              <div className={`settings-inline-reveal ${reminderEditorOpen ? "is-open" : ""}`} aria-hidden={!reminderEditorOpen}>
                {notifEnabled ? (
                  <input type="time" value={notifTime} onChange={async (e) => {
                    const nextTime = e.target.value;
                    const dogName = dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase())?.dogName ?? "your dog";
                    const ok = await scheduleNotif(nextTime, dogName);
                    if (ok) setNotifTime(nextTime);
                  }} className="notif-time-input settings-time-input" />
                ) : (
                  <div className="settings-secondary-text">Turn reminders on first, then choose a time.</div>
                )}
              </div>
            </div>
            <SettingsNavRow label="Training settings" value={`Up to ${activeProto.sessionsPerDayMax}/day`} onClick={() => setTrainingSettingsOpen(true)} />
            <SettingsNavRow label="Custom labels" value={`${Object.keys(patLabels).length} custom`} onClick={() => setActivePanel(SETTINGS_PANEL.LABELS)} />
          </div>

          <div className="settings-group settings-group--muted" role="list" aria-label="Support destinations">
            <div className="settings-section-label">Help + diagnostics</div>
            <SettingsNavRow label="Help" value="Guidance" onClick={() => setActivePanel(SETTINGS_PANEL.HELP)} />
            <SettingsNavRow label="Advanced" value="Diagnostics" onClick={() => setActivePanel(SETTINGS_PANEL.ADVANCED)} />
          </div>

          <div className="settings-group" role="list" aria-label="Account destinations">
            <div className="settings-section-label">Account + device</div>
            <SettingsNavRow label="Account" value="Profile & device" onClick={() => setActivePanel(SETTINGS_PANEL.ACCOUNT)} />
          </div>

          <section className="settings-collapsible-card settings-collapsible-card--quiet settings-danger-zone" aria-label="Danger zone">
            <button
              className="settings-collapsible-toggle secondary-control--toggle"
              type="button"
              onClick={() => setDangerOpen((prev) => !prev)}
              aria-expanded={dangerOpen}
              aria-controls="settings-danger-content"
            >
              <span className="settings-section-label settings-section-label--danger">Danger zone</span>
              <span className="settings-collapsible-arrow" aria-hidden="true">{dangerOpen ? "−" : "+"}</span>
            </button>
            {dangerOpen ? (
              <div className="settings-collapsible-inner" id="settings-danger-content">
                <button className="settings-nav-row settings-nav-row--danger" type="button" onClick={() => setRemoveConfirmOpen((prev) => !prev)}>
                  <span className="settings-nav-row__label">{`Remove ${name} from this device`}</span>
                  <span className="settings-nav-row__meta">
                    <span className="settings-nav-row__chevron" aria-hidden="true">{removeConfirmOpen ? "−" : "›"}</span>
                  </span>
                </button>
                <div className={`settings-inline-reveal ${removeConfirmOpen ? "is-open" : ""}`} aria-hidden={!removeConfirmOpen}>
                  <div className="settings-danger-confirm">
                    <div className="settings-secondary-text">
                      This removes local sessions, walks, feeding history, labels, and photo for this dog on this device. Synced/shared data elsewhere is unaffected.
                    </div>
                    <div className="settings-danger-actions">
                      <button type="button" className="settings-inline-btn button-size-secondary-pill secondary-control secondary-control--compact-button" onClick={() => setRemoveConfirmOpen(false)}>Cancel</button>
                      <button type="button" className="settings-inline-btn button-size-secondary-pill button-danger" onClick={() => {
                        clearDogActivityState(activeDogId);
                        const newDogs = dogsState.filter((d) => d.id !== activeDogId);
                        setDogs(newDogs);
                        save(ACTIVE_DOG_KEY, null);
                        setActiveDogId(null);
                      }}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {activePanel === SETTINGS_PANEL.PROFILE && (
        <SettingsSheet title="Dog profile" titleId="settings-profile-title" onClose={() => setActivePanel(null)} compact>
          <div className="settings-profile-id-row" aria-label="Dog ID">
            <div>
              <div className="settings-simple-title">Dog ID</div>
              <div className="settings-id-value">{activeDogId}</div>
            </div>
            <button className="copy-btn button-size-secondary-pill secondary-control secondary-control--compact-button" onClick={copyDogId} aria-label="Copy dog ID">Copy</button>
          </div>
          <div className="settings-sync-summary" aria-live="polite">
            <div className={`sync-badge sync-state-${syncSummary.badgeState}`} title={syncSummary.detail}>
              <span className={`sync-dot sync-${syncSummary.badgeState}`} />
              <span>{syncSummary.label}</span>
            </div>
            <div className="settings-sync-copy">{syncSummary.detail}</div>
          </div>
        </SettingsSheet>
      )}

      {activePanel === SETTINGS_PANEL.LABELS && (
        <SettingsSheet title="Custom labels" titleId="settings-labels-title" onClose={() => setActivePanel(null)}>
          {PATTERN_TYPES.map((pt) => (
            <div key={pt.type} className="pat-edit-row">
              {editingPat === pt.type ? (
                <input className="pat-edit-input" autoFocus aria-label={`Rename ${pt.label}`} defaultValue={patLabels[pt.type] || pt.label} onBlur={(e) => { const val = e.target.value.trim(); if (val) setPatLabels((prev) => ({ ...prev, [pt.type]: val })); setEditingPat(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingPat(null); }} />
              ) : (
                <span className="pat-edit-label">{patLabels[pt.type] || pt.label}</span>
              )}
              <div className="pat-edit-actions">
                <button className="pat-edit-btn t-helper secondary-control secondary-control--inline-text" onClick={() => setEditingPat(pt.type)} aria-label={`Edit ${pt.label} name`}>Edit</button>
                {editingPat === pt.type && patLabels[pt.type] && <button className="settings-inline-reset-btn t-helper secondary-control secondary-control--inline-text" onMouseDown={(e) => e.preventDefault()} onClick={() => setPatLabels((prev) => { const n = { ...prev }; delete n[pt.type]; return n; })} aria-label="Reset to default">Reset</button>}
              </div>
            </div>
          ))}
        </SettingsSheet>
      )}

      {activePanel === SETTINGS_PANEL.HELP && (
        <SettingsSheet title="Help" titleId="settings-help-title" onClose={() => setActivePanel(null)}>
              <div className="proto-section u-mt-none"><div className="proto-title">Sync devices</div><div className="proto-row">Share your Dog ID, then join with the same ID on the other device.</div></div>
              <div className="proto-section"><div className="proto-title">Session flow</div><div className="proto-row">Start a session, return before distress escalates, then rate how {name} did.</div></div>
              <div className="proto-section"><div className="proto-title">Current recommendation state</div><div className="proto-row">Now: <strong>{recommendationType}</strong>. {recommendationSummary} It currently weighs {(recommendation?.details?.factors || []).join(" ")}</div></div>
              <div className="proto-section"><div className="proto-title">Recommendation states emitted</div><div className="proto-row">baseline_start, keep_same_duration, repeat_current_duration, departure_cues_first, recovery_mode_active, recovery_mode_resume.</div></div>
              <div className="proto-section"><div className="proto-title">Recovery behavior</div><div className="proto-row">Any subtle/active/severe distress can activate recovery. While recovery_mode_active, targets use short fixed steps (typically 60s then 120s; severe can add a third 120s step). Subtle recovery accepts any calm follow-up duration; active/severe count calm sessions at short recovery lengths. After enough calm sessions, recovery_mode_resume emits once, then normal progression continues.</div></div>
              <div className="proto-section"><div className="proto-title">Daily rhythm</div><div className="proto-row">Aim for up to {activeProto.sessionsPerDayMax} sessions, {activeProto.maxDailyAloneMinutes} min/day, and {pattern.recMin}–{pattern.recMax} pattern breaks.</div></div>
        </SettingsSheet>
      )}

      {activePanel === SETTINGS_PANEL.ADVANCED && (
        <SettingsSheet title="Advanced" titleId="settings-advanced-title" onClose={() => setActivePanel(null)}>
              <div className="settings-advanced-group">
                <div className="diag-head">
                  <button className="diag-run-btn button-size-compact-tertiary secondary-control secondary-control--compact-button" type="button" disabled={syncDiagRunning} onClick={runSyncDiagnostics}>{syncDiagRunning ? "Running…" : "Run connection test"}</button>
                </div>
                <div className="settings-secondary-text">Check sync availability and connection readiness.</div>
              </div>
              <div className="settings-advanced-group">
                <div className="settings-simple-title">Status</div>
                <div className="diag-grid diag-grid--kv">
                  <div className="diag-kv-row"><span>Account sync</span><strong>{SYNC_ENABLED ? "Available" : "Unavailable"}</strong></div>
                  <div className="diag-kv-row"><span>Connection test</span><strong>{syncDiagResult?.checks?.summary?.ok ? "Passing" : "Not run yet"}</strong></div>
                  <div className="diag-kv-row"><span>Schema compatibility</span><strong>{syncDegradation?.isDegraded ? "Partial sync mode" : "Healthy"}</strong></div>
                </div>
                {syncDegradation?.isDegraded && (
                  <div className="settings-secondary-text" role="status" aria-live="polite">
                    Sync is working in compatibility mode. Some fields are being skipped until your server schema is updated.
                  </div>
                )}
              </div>
              <div className="settings-advanced-group">
                <button type="button" className="settings-inline-reset-btn t-helper secondary-control secondary-control--inline-text" onClick={() => setDiagDetailsOpen((prev) => !prev)}>{diagDetailsOpen ? "Hide technical details" : "Show technical details"}</button>
              </div>
              {diagDetailsOpen && <div className="settings-advanced-group">
                <div className="settings-simple-title">Technical details</div>
                <div className="diag-grid diag-grid--kv">
                  <div className="diag-kv-row"><span>Sync enabled</span><strong>{SYNC_ENABLED ? "Yes" : "No"}</strong></div>
                  <div className="diag-kv-row"><span>VITE_SUPABASE_URL</span><strong>{SB_URL ? "Set" : "Missing"}</strong></div>
                  <div className="diag-kv-row"><span>VITE_SUPABASE_ANON_KEY</span><strong>{SB_KEY ? "Set" : "Missing"}</strong></div>
                  <div className="diag-kv-row diag-kv-row--code"><span>Supabase base URL</span><code>{SB_BASE_URL || "(missing)"}</code></div>
                  <div className="diag-kv-row"><span>Degradation flags</span><code>{(syncDegradation?.flags || []).join(", ") || "(none)"}</code></div>
                </div>
                {syncDegradation?.messages?.length > 0 && (
                  <ul className="settings-secondary-text">
                    {syncDegradation.messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
              </div>}
              {diagDetailsOpen && syncDiagResult && <div className="settings-advanced-group settings-advanced-group--technical"><div className={`diag-summary ${syncDiagResult.checks?.summary?.ok ? "ok" : "err"}`}>{syncDiagResult.checks?.summary?.ok ? "All checks passed" : "Some checks failed"}</div><pre className="diag-json">{JSON.stringify(syncDiagResult, null, 2)}</pre></div>}
        </SettingsSheet>
      )}

      {activePanel === SETTINGS_PANEL.ACCOUNT && (
        <SettingsSheet title="Account" titleId="settings-account-title" onClose={() => setActivePanel(null)} compact>
          <SettingsNavRow
            label={`Edit ${name}’s profile`}
            value="Re-run setup"
            onClick={() => {
              if (window.confirm(`Re-run setup for ${name}? All sessions are kept.`)) {
                setOnboardingState({ mode: "claim", dogId: activeDogId });
                setScreen("onboard");
              }
            }}
          />
          <SettingsNavRow label="Switch dog" onClick={() => setScreen("select")} />
        </SettingsSheet>
      )}

      {trainingSettingsOpen && (
        <SettingsSheet title="Edit training plan" titleId="training-settings-title" onClose={() => setTrainingSettingsOpen(false)}>
            <div className="share-sub">Adjust protocol values only if a trainer has advised you to. Full guidance is kept in Help.</div>
            {!protoWarnAck ? (
              <div className="proto-warn-banner">
                <div className="proto-warn-title">Editing is usually not recommended</div>
                <div className="proto-warn-body">These values are based on clinical separation anxiety protocols. Changing them may slow your dog's progress or cause regression.</div>
                <button onClick={() => setProtoWarnAck(true)} className="settings-inline-btn button-size-secondary-pill secondary-control secondary-control--compact-button" type="button">I understand — let me edit</button>
              </div>
            ) : (
              <div>
                <div className="t-helper u-color-amber u-mb-card-row">Edit with caution.</div>
                {[
                  { key: "sessionsPerDayMax", label: "Max sessions/day", unit: "" },
                  { key: "maxDailyAloneMinutes", label: "Max alone time/day", unit: "min" },
                  { key: "desensitizationBlocksPerDayRecommendedMin", label: "Pattern breaks min/day", unit: "" },
                  { key: "desensitizationBlocksPerDayRecommendedMax", label: "Pattern breaks max/day", unit: "" },
                ].map(({ key, label, unit }) => (
                  <div key={key} className="proto-field-row">
                    <span className="proto-field-label">{label}</span>
                    <div className="u-gap-compact">
                      <input type="number" className="proto-field-input" aria-label={label} value={protoOverride[key] ?? activeProto[key]} onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v > 0) setProtoOverride((prev) => ({ ...prev, [key]: v })); }} />
                      {unit && <span className="t-helper">{unit}</span>}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setProtoOverride({}); setProtoWarnAck(false); }} className="settings-inline-reset-btn t-helper u-mt-row secondary-control secondary-control--inline-text" type="button">Reset to defaults</button>
              </div>
            )}
        </SettingsSheet>
      )}
    </>
  );
}
