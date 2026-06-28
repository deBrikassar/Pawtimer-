import { useApp } from "../app/AppContext";
import { PATTERN_TYPES } from "../app/helpers";
import { CameraIcon, DeleteIcon, ModalCloseButton, ViewportModal } from "../app/ui";
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

function SettingsNavRow({ label, value, icon, onClick, danger = false }) {
  return (
    <button
      type="button"
      className={`settings-nav-row ${danger ? "settings-nav-row--danger" : ""}`}
      onClick={onClick}
    >
      <div className="settings-nav-row__start">
        {icon && (
          <div className="settings-nav-icon">
            {icon}
          </div>
        )}
        <span className="settings-nav-row__label">{label}</span>
      </div>
      <span className="settings-nav-row__meta">
        {value ? <span className="settings-nav-row__value">{value}</span> : null}
        <span className="settings-nav-row__chevron" aria-hidden="true">›</span>
      </span>
    </button>
  );
}


export default function SettingsScreen() {
  const [activePanel, setActivePanel] = useState(null);
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [diagDetailsOpen, setDiagDetailsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
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
    dogPhoto,
    handlePhotoUpload,
    handleNameChange,
  } = useApp();

  const reminderSummary = notifEnabled ? `On · ${notifTime}` : "Off";
  const recommendationType = recommendation?.details?.recommendationType || "baseline_start";
  const recommendationSummary = recommendation?.details?.summary || recommendation?.explanation;

  return (
    <>
      <div className="tab-content">
        <div className="section">
          <div className="section-title">Calm control</div>

          <div className="settings-container-neumorphic">
            <div className="settings-nav-list settings-neumorphic-card" role="list" aria-label="Settings destinations">
              <SettingsNavRow label="Dog profile" value={name} icon={<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 0-8 8v1h16v-1a8 8 0 0 0-8-8zm0 2a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6zM5 14v4h14v-4H5zm2 1h10v2H7v-2z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.PROFILE)} />
              <SettingsNavRow label="Reminders" value={reminderSummary} icon={<svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.REMINDERS)} />
              <SettingsNavRow label="Training settings" value={`Up to ${activeProto.sessionsPerDayMax}/day`} icon={<svg viewBox="0 0 24 24"><path d="M22 6h-6V4h-2v2h-2c-1.1 0-2 .9-2 2v1h-2v4h2v2c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM12 15h-2v-4h2v4zm10-2h-8v-2h8v2z" fill="currentColor"/></svg>} onClick={() => setTrainingSettingsOpen(true)} />
              <SettingsNavRow label="Custom labels" value={`${Object.keys(patLabels).length} custom`} icon={<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.LABELS)} />
            </div>

            <div className="settings-section-label">Guidance + diagnostics</div>
            <div className="settings-nav-list settings-neumorphic-card" role="list" aria-label="Support destinations">
              <SettingsNavRow label="Help" value="Guidance" icon={<svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.HELP)} />
              <SettingsNavRow label="Advanced" value="Diagnostics" icon={<svg viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.1L7.6 4.8 5.4 7 2.5 4.1c-1.3 2.4-.9 5.4 1.1 7.4 1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l1.7-1.7c.4-.4.4-1 0-1.4z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.ADVANCED)} />
            </div>

            <div className="settings-section-label">Account + device</div>
            <div className="settings-nav-list settings-neumorphic-card" role="list" aria-label="Account destinations">
              <SettingsNavRow label="Account" value="Profile & device" icon={<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>} onClick={() => setActivePanel(SETTINGS_PANEL.ACCOUNT)} />
            </div>

            <div className="settings-danger-sep" />
            <div className="settings-section-label settings-section-label--danger">Danger zone</div>
            <div className="settings-nav-list settings-nav-list--danger settings-neumorphic-card settings-neumorphic-card--danger" role="list" aria-label="Danger zone">
              <SettingsNavRow label={`Remove ${name} from this device`} danger icon={<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>} onClick={() => {
                if (window.confirm(`Remove ${name} from this device? This deletes local sessions, walks, feeding history, labels, and photo for this dog on this device. Synced/shared data elsewhere is unaffected.`)) {
                  clearDogActivityState(activeDogId);
                  const newDogs = dogsState.filter((d) => d.id !== activeDogId);
                  setDogs(newDogs);
                  save(ACTIVE_DOG_KEY, null);
                  setActiveDogId(null);
                }
              }} />
            </div>
          </div>
        </div>
      </div>

      {activePanel === SETTINGS_PANEL.PROFILE && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-profile-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-profile-title">Dog profile</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">

              {/* ── Dog profile editing ── */}
              <div className="pat-edit-row">
                {editingName ? (
                  <input
                    className="pat-edit-input"
                    autoFocus
                    aria-label="Dog name"
                    defaultValue={name}
                    onBlur={(e) => { const val = e.target.value.trim(); if (val) handleNameChange(val); setEditingName(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingName(false); }}
                  />
                ) : (
                  <span className="pat-edit-label" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{name}</span>
                )}
                <div className="pat-edit-actions">
                  <button className="pat-edit-btn t-helper secondary-control secondary-control--inline-text" onClick={() => setEditingName(true)} aria-label="Edit name">Edit name</button>
                </div>
              </div>

              {/* ── Dog photo ── */}
              <div className="settings-photo-row">
                <div className="settings-photo-preview" aria-label="Dog photo">
                  {dogPhoto
                    ? <img src={dogPhoto} alt={name} className="settings-photo-preview__img" />
                    : <span className="settings-photo-preview__placeholder" aria-hidden="true">{String(name || "D").trim().charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="settings-photo-actions">
                  <label className="settings-photo-upload-btn button-size-secondary-pill secondary-control secondary-control--compact-button" role="button" tabIndex={0}>
                    <CameraIcon />
                    <span>{dogPhoto ? "Change photo" : "Add photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="settings-photo-input"
                      onChange={handlePhotoUpload}
                      aria-label="Upload dog photo"
                    />
                  </label>
                  {dogPhoto && (
                    <button
                      type="button"
                      className="settings-inline-reset-btn t-helper secondary-control secondary-control--inline-text"
                      onClick={() => handlePhotoUpload({ target: { files: [] } })}
                      aria-label="Remove dog photo"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* ── Dog ID & sync ── */}
              <div className="settings-profile-id-row" aria-label="Dog ID">
                <div>
                  <div className="settings-simple-title">Dog ID</div>
                  <div className="settings-id-value">{activeDogId}</div>
                </div>
                <button type="button" className="copy-btn button-size-secondary-pill secondary-control secondary-control--compact-button" onClick={copyDogId} aria-label="Copy dog ID">Copy</button>
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
        </ViewportModal>
      )}

      {activePanel === SETTINGS_PANEL.REMINDERS && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-reminders-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-reminders-title">Reminders</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
              <div className="settings-native-control-row">
                <span>Daily reminder</span>
                <button className={`notif-toggle secondary-control secondary-control--toggle ${notifEnabled ? "on" : ""}`} onClick={handleToggleNotif}>{notifEnabled ? "On" : "Off"}</button>
              </div>
              <div className="settings-native-control-row">
                <span>Reminder time</span>
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
                }} className="notif-time-input" />
              )}
              {!notifEnabled && reminderEditorOpen && (
                <div className="settings-secondary-text">Turn reminders on first, then choose a time.</div>
              )}
            </div>
          </div>
        </ViewportModal>
      )}

      {activePanel === SETTINGS_PANEL.LABELS && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-labels-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
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
        </ViewportModal>
      )}

      {activePanel === SETTINGS_PANEL.HELP && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-help-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="settings-help-title">Help</div>
              <ModalCloseButton onClick={() => setActivePanel(null)} />
            </div>
            <div className="settings-modal-stack">
              <div className="proto-section u-mt-none">
                <div className="proto-title">Sync devices</div>
                <div className="proto-row">Share your Dog ID, then enter it on your other device to link them.</div>
              </div>
              <div className="proto-section">
                <div className="proto-title">Session flow</div>
                <div className="proto-row">Start a session, return before your dog gets anxious, and then rate how they did.</div>
              </div>
              <div className="proto-section">
                <div className="proto-title">Current progress</div>
                <div className="proto-row">Your current goal is to gradually increase the time you spend away. Target times will automatically nudge upward after successful, calm sessions.</div>
                <ul className="help-stats-list proto-row" style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  <li>Safe-alone estimate: 30 seconds</li>
                  <li>Calm streak: 2 sessions (Stability: 50%)</li>
                  <li>Relapse risk: Low (32%)</li>
                </ul>
              </div>
              <div className="proto-section">
                <div className="proto-title">Algorithm history</div>
                <div className="proto-row">System events for your dog:</div>
                <ul className="help-stats-list proto-row" style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  <li>Baseline started</li>
                  <li>Kept duration</li>
                  <li>Repeated duration</li>
                  <li>Practiced departure cues</li>
                  <li>Activated recovery mode</li>
                  <li>Resumed normal progression</li>
                </ul>
              </div>
              <div className="proto-section">
                <div className="proto-title">How recovery works</div>
                <div className="proto-row">If your dog shows signs of distress, the app enters Recovery Mode to help them rebuild confidence. Target times will drop to short, fixed steps (like 1 to 2 minutes). Once your dog successfully completes enough calm sessions at these easier levels, normal training will automatically resume.</div>
              </div>
              <div className="proto-section">
                <div className="proto-title">Daily goals</div>
                <div className="proto-row">For the best results, aim for up to 5 sessions (totaling about 30 minutes a day) and do 2–4 pattern breaks.</div>
              </div>
            </div>
          </div>
        </ViewportModal>
      )}

      {activePanel === SETTINGS_PANEL.ADVANCED && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-advanced-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
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
        </ViewportModal>
      )}

      {activePanel === SETTINGS_PANEL.ACCOUNT && (
        <ViewportModal open onClose={() => setActivePanel(null)} labelledBy="settings-account-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
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
        </ViewportModal>
      )}

      {trainingSettingsOpen && (
        <ViewportModal open onClose={() => setTrainingSettingsOpen(false)} labelledBy="training-settings-title">
          <div className="quick-modal-card modal-card modal-card--dialog-md">
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
        </ViewportModal>
      )}
    </>
  );
}
