import { PATTERN_TYPES } from "../app/helpers";
import { DeleteIcon, ModalCloseButton } from "../app/ui";
import { useState } from "react";

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

export default function SettingsScreen(props) {
  const [activePanel, setActivePanel] = useState(null);
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [diagDetailsOpen, setDiagDetailsOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
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

          <section className="surface-card settings-profile-card" aria-label={`${name} profile`}>
            <div className="settings-profile-card__head">
              <div>
                <div className="settings-simple-title">Active dog</div>
                <div className="settings-profile-card__name">{name}</div>
              </div>
              <button className="settings-inline-btn button-size-secondary-pill secondary-control secondary-control--compact-button" onClick={() => setActivePanel(SETTINGS_PANEL.PROFILE)} type="button">
                View profile
              </button>
            </div>
            <div className="settings-profile-card__meta">
              <div className="settings-profile-chip">{reminderSummary} reminders</div>
              <div className="settings-profile-chip">Max {activeProto.sessionsPerDayMax} sessions/day</div>
              <div className="settings-profile-chip">{Object.keys(patLabels).length} custom labels</div>
            </div>
          </section>

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
              {notifEnabled && reminderEditorOpen && (
                <input type="time" value={notifTime} onChange={async (e) => {
                  const nextTime = e.target.value;
                  const dogName = dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase())?.dogName ?? "your dog";
                  const ok = await scheduleNotif(nextTime, dogName);
                  if (ok) setNotifTime(nextTime);
                }} className="notif-time-input settings-time-input" />
              )}
              {!notifEnabled && reminderEditorOpen && (
                <div className="settings-secondary-text">Turn reminders on first, then choose a time.</div>
              )}
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
                <SettingsNavRow label={`Remove ${name} from this device`} danger onClick={() => {
                  if (window.confirm(`Remove ${name} from this device? This deletes local sessions, walks, feeding history, labels, and photo for this dog on this device. Synced/shared data elsewhere is unaffected.`)) {
                    clearDogActivityState(activeDogId);
                    const newDogs = dogsState.filter((d) => d.id !== activeDogId);
                    setDogs(newDogs);
                    save(ACTIVE_DOG_KEY, null);
                    setActiveDogId(null);
                  }
                }} />
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {activePanel === SETTINGS_PANEL.PROFILE && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-profile-title" onClick={() => setActivePanel(null)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-profile-title">Dog profile</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
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
            </div>
          </div>
        </div>
      )}

      {activePanel === SETTINGS_PANEL.LABELS && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-labels-title" onClick={() => setActivePanel(null)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-labels-title">Custom labels</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
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
            </div>
          </div>
        </div>
      )}

      {activePanel === SETTINGS_PANEL.HELP && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-help-title" onClick={() => setActivePanel(null)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-help-title">Help</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
              <div className="proto-section u-mt-none"><div className="proto-title">Sync devices</div><div className="proto-row">Share your Dog ID, then join with the same ID on the other device.</div></div>
              <div className="proto-section"><div className="proto-title">Session flow</div><div className="proto-row">Start a session, return before distress escalates, then rate how {name} did.</div></div>
              <div className="proto-section"><div className="proto-title">Current recommendation state</div><div className="proto-row">Now: <strong>{recommendationType}</strong>. {recommendationSummary} It currently weighs {(recommendation?.details?.factors || []).join(" ")}</div></div>
              <div className="proto-section"><div className="proto-title">Recommendation states emitted</div><div className="proto-row">baseline_start, keep_same_duration, repeat_current_duration, departure_cues_first, recovery_mode_active, recovery_mode_resume.</div></div>
              <div className="proto-section"><div className="proto-title">Recovery behavior</div><div className="proto-row">Any subtle/active/severe distress can activate recovery. While recovery_mode_active, targets use short fixed steps (typically 60s then 120s; severe can add a third 120s step). Subtle recovery accepts any calm follow-up duration; active/severe count calm sessions at short recovery lengths. After enough calm sessions, recovery_mode_resume emits once, then normal progression continues.</div></div>
              <div className="proto-section"><div className="proto-title">Daily rhythm</div><div className="proto-row">Aim for up to {activeProto.sessionsPerDayMax} sessions, {activeProto.maxDailyAloneMinutes} min/day, and {pattern.recMin}–{pattern.recMax} pattern breaks.</div></div>
            </div>
          </div>
        </div>
      )}

      {activePanel === SETTINGS_PANEL.ADVANCED && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-advanced-title" onClick={() => setActivePanel(null)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-advanced-title">Advanced</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
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
            </div>
          </div>
        </div>
      )}

      {activePanel === SETTINGS_PANEL.ACCOUNT && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-account-title" onClick={() => setActivePanel(null)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-account-title">Account</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
              <button
                className="settings-btn button-size-secondary-pill"
                onClick={() => {
                  if (window.confirm(`Re-run setup for ${name}? All sessions are kept.`)) {
                    setOnboardingState({ mode: "claim", dogId: activeDogId });
                    setScreen("onboard");
                  }
                }}
              >
                Edit {name}&rsquo;s profile
              </button>
              <button className="settings-btn button-size-secondary-pill" onClick={() => setScreen("select")}>
                <span className="settings-btn__label">Switch dog</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {trainingSettingsOpen && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="training-settings-title" onClick={() => setTrainingSettingsOpen(false)}>
          <div className="quick-modal-card modal-card modal-card--dialog-md" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="training-settings-title">Edit training plan</div>
              <ModalCloseButton onClick={() => setTrainingSettingsOpen(false)} />
            </div>
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
          </div>
        </div>
      )}
    </>
  );
}
