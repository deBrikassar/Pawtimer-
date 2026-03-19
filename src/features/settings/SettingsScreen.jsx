import { PATTERN_TYPES, fmt } from "../app/helpers";
import { PawIcon, Img } from "../app/ui";

export default function SettingsScreen(props) {
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
    settingsDisclosure,
    setSettingsDisclosure,
    syncDiagRunning,
    runSyncDiagnostics,
    SYNC_ENABLED,
    SB_URL,
    SB_KEY,
    SB_BASE_URL,
    syncDiagResult,
    nextTargetInfo,
    trainingSettingsOpen,
    setProtoWarnAck,
    protoWarnAck,
    protoOverride,
    setProtoOverride,
    setScreen,
    dogsState,
    setDogs,
    save,
    ACTIVE_DOG_KEY,
    setActiveDogId,
  } = props;

  return (
    <>
      <div className="tab-content">
        <div className="section">
          <div className="section-title">Settings</div>

          <div className="settings-section-label">Dog &amp; sync</div>
          <div className="share-card">
            <div className="share-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><PawIcon size={20} /> {name}'s Dog ID</div>
            <div className="share-sub">Share this ID to sync devices.</div>
            <div className="share-id-row">
              <div className="share-id-val" aria-label="Dog ID">{activeDogId}</div>
              <button className="copy-btn" onClick={copyDogId} aria-label="Copy dog ID">Copy</button>
            </div>
          </div>

          <div className="settings-section-label">Reminders</div>
          <div className="share-card">
            <div className="share-title">Daily training reminder</div>
            <div className="share-sub">Set a gentle daily prompt so sessions stay consistent.</div>
            <div className="settings-inline-row">
              <button className={`notif-toggle ${notifEnabled ? "on" : ""}`} onClick={handleToggleNotif}>{notifEnabled ? "On" : "Off"}</button>
              {notifEnabled && <input type="time" value={notifTime} onChange={(e) => { setNotifTime(e.target.value); scheduleNotif(e.target.value, dogs.find((d) => String(d.id || "").trim().toUpperCase() === String(activeDogId || "").trim().toUpperCase())?.dogName ?? "your dog"); }} className="notif-time-input" />}
            </div>
          </div>

          <div className="settings-section-label">Training settings</div>
          <div className="share-card">
            <div className="share-title">Training settings</div>
            <div className="settings-summary-list">
              <div className="settings-summary-row"><span className="settings-summary-label">Sessions per day</span><span className="settings-summary-value">Up to {activeProto.sessionsPerDayMax}/day</span></div>
              <div className="settings-summary-row"><span className="settings-summary-label">Max alone time</span><span className="settings-summary-value">{activeProto.maxDailyAloneMinutes} min/day</span></div>
              <div className="settings-summary-row"><span className="settings-summary-label">Next-target logic</span><span className="settings-summary-value">Adaptive from calm history, distress, and risk</span></div>
              <div className="settings-summary-row"><span className="settings-summary-label">Pattern breaks</span><span className="settings-summary-value">{pattern.recMin}–{pattern.recMax}/day</span></div>
            </div>
            <button className="settings-inline-btn" type="button" onClick={() => setTrainingSettingsOpen(true)}>Edit settings</button>
          </div>

          <div className="settings-section-label">Customisation</div>
          <div className="share-card">
            <div className="share-title">Customise Pattern Names</div>
            <div className="share-sub">Rename each pattern to match your own routine.</div>
            {PATTERN_TYPES.map((pt) => (
              <div key={pt.type} className="pat-edit-row">
                <Img src={pt.icon} size={28} alt={pt.label} />
                {editingPat === pt.type ? (
                  <input className="pat-edit-input" autoFocus aria-label={`Rename ${pt.label}`} defaultValue={patLabels[pt.type] || pt.label} onBlur={(e) => { const val = e.target.value.trim(); if (val) setPatLabels((prev) => ({ ...prev, [pt.type]: val })); setEditingPat(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingPat(null); }} />
                ) : (
                  <span className="pat-edit-label">{patLabels[pt.type] || pt.label}</span>
                )}
                <button className="pat-edit-btn" onClick={() => setEditingPat(pt.type)} aria-label={`Edit ${pt.label} name`}>✎</button>
                {patLabels[pt.type] && <button className="pat-edit-reset" onClick={() => setPatLabels((prev) => { const n = { ...prev }; delete n[pt.type]; return n; })} aria-label="Reset to default">↩</button>}
              </div>
            ))}
          </div>

          <div className="settings-section-label">Advanced</div>
          <div className="share-card settings-collapsible-card">
            <button className="settings-collapsible-toggle" type="button" aria-expanded={settingsDisclosure === "advanced"} onClick={() => setSettingsDisclosure((prev) => prev === "advanced" ? null : "advanced")}>
              <span className="share-title" style={{ marginBottom: 0 }}>Advanced</span>
              <span className="settings-collapsible-arrow">{settingsDisclosure === "advanced" ? "−" : "+"}</span>
            </button>
            <div className={`collapsible-body ${settingsDisclosure === "advanced" ? "open" : "closed"}`}>
              <div className="settings-collapsible-inner">
                <div className="diag-head">
                  <div className="share-title" style={{ marginBottom: 0 }}>Sync diagnostics</div>
                  <button className="diag-run-btn" type="button" disabled={syncDiagRunning} onClick={runSyncDiagnostics}>{syncDiagRunning ? "Running…" : "Run connection test"}</button>
                </div>
                <div className="share-sub" style={{ marginBottom: 10 }}>Use this if sync turns red. It checks env setup, read access, and write/delete permissions.</div>
                <div className="diag-grid">
                  <div>Sync enabled: <strong>{SYNC_ENABLED ? "Yes" : "No"}</strong></div>
                  <div>VITE_SUPABASE_URL: <strong>{SB_URL ? "Set" : "Missing"}</strong></div>
                  <div>VITE_SUPABASE_ANON_KEY: <strong>{SB_KEY ? "Set" : "Missing"}</strong></div>
                  <div>Supabase base URL: <code>{SB_BASE_URL || "(missing)"}</code></div>
                </div>
                {syncDiagResult && <><div className={`diag-summary ${syncDiagResult.checks?.summary?.ok ? "ok" : "err"}`}>{syncDiagResult.checks?.summary?.ok ? "✓ All checks passed" : "✕ Some checks failed"}</div><pre className="diag-json">{JSON.stringify(syncDiagResult, null, 2)}</pre></>}
              </div>
            </div>
          </div>

          <div className="settings-section-label">Help</div>
          <div className="share-card settings-collapsible-card">
            <button className="settings-collapsible-toggle" type="button" aria-expanded={settingsDisclosure === "help"} onClick={() => setSettingsDisclosure((prev) => prev === "help" ? null : "help")}>
              <span className="share-title" style={{ marginBottom: 0 }}>Help</span>
              <span className="settings-collapsible-arrow">{settingsDisclosure === "help" ? "−" : "+"}</span>
            </button>
            <div className={`collapsible-body ${settingsDisclosure === "help" ? "open" : "closed"}`}>
              <div className="settings-collapsible-inner">
                <div className="proto-section" style={{ marginTop: 0 }}><div className="proto-title">Sync devices</div><div className="proto-row">Copy the Dog ID, send it to your partner, then have them join with that ID in PawTimer.</div></div>
                <div className="proto-section"><div className="proto-title">How to run a session</div><div className="proto-row">Tap Start, leave calmly, come back when needed, then rate how {name} did so PawTimer can set the next target.</div></div>
                <div className="proto-section"><div className="proto-title">Progress rules</div><div className="proto-row">PawTimer starts from a weighted safe-alone estimate built from recent calm sessions. Five calm sessions in a row usually earn a +15% step. Subtle stress usually repeats the same duration, active distress shortens the next target, and severe distress triggers a deeper stabilization step.</div></div>
                <div className="proto-section"><div className="proto-title">Next target factors</div><div className="proto-row">{nextTargetInfo.summary} Right now it uses {nextTargetInfo.factors.join(" ")}</div></div>
                <div className="proto-section"><div className="proto-title">Daily rhythm</div><div className="proto-row">Aim for up to {activeProto.sessionsPerDayMax} sessions and {activeProto.maxDailyAloneMinutes} min alone/day, with {pattern.recMin}–{pattern.recMax} pattern breaks for about {pattern.normalizedLeaves} departures/day and {activeProto.restDaysPerWeekRecommended} rest days/week.</div></div>
                <div className="proto-section"><div className="proto-title">Walk buffer</div><div className="proto-row">Use walks plus a {pattern.walkBuffer}-minute buffer before counting a departure toward pattern-break practice.</div></div>
              </div>
            </div>
          </div>

          <div className="settings-section-label">Account</div>
          <button className="settings-btn" onClick={() => { if (window.confirm(`Re-run setup for ${name}? All sessions are kept.`)) { setDogs((prev) => prev.filter((d) => d.id !== activeDogId)); setScreen("onboard"); } }}>✎ Edit {name}'s settings</button>
          <button className="settings-btn" onClick={() => setScreen("select")} style={{ display: "flex", alignItems: "center", gap: 8 }}><PawIcon size={18} aria-hidden="true" /> Switch to another dog</button>

          <div className="settings-danger-sep" />
          <div className="settings-section-label" style={{ color: "var(--red)" }}>Danger zone</div>
          <button className="settings-btn danger" onClick={() => {
            if (window.confirm(`Remove ${name} from this device? Sessions stored elsewhere are unaffected.`)) {
              const newDogs = dogsState.filter((d) => d.id !== activeDogId);
              setDogs(newDogs);
              save(ACTIVE_DOG_KEY, null);
              setActiveDogId(null);
            }
          }}>✕ Remove {name} from this device</button>
        </div>
      </div>

      {trainingSettingsOpen && (
        <div className="quick-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="training-settings-title" onClick={() => setTrainingSettingsOpen(false)}>
          <div className="quick-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="quick-modal-title" id="training-settings-title">Training settings</div>
              <button className="quick-modal-close" type="button" onClick={() => setTrainingSettingsOpen(false)}>×</button>
            </div>
            <div className="share-sub">Adjust protocol values only if a trainer has advised you to. Full guidance is kept in Help.</div>
            {!protoWarnAck ? (
              <div className="proto-warn-banner">
                <div className="proto-warn-title">Editing is usually not recommended</div>
                <div className="proto-warn-body">These values are based on clinical separation anxiety protocols. Changing them may slow your dog's progress or cause regression.</div>
                <button onClick={() => setProtoWarnAck(true)} className="settings-inline-btn" type="button">I understand — let me edit</button>
              </div>
            ) : (
              <div>
                <div className="t-helper" style={{ color: "var(--amber)", marginBottom: 10 }}>Edit with caution.</div>
                {[
                  { key: "sessionsPerDayMax", label: "Max sessions/day", unit: "" },
                  { key: "maxDailyAloneMinutes", label: "Max alone time/day", unit: "min" },
                  { key: "desensitizationBlocksPerDayRecommendedMin", label: "Pattern breaks min/day", unit: "" },
                  { key: "desensitizationBlocksPerDayRecommendedMax", label: "Pattern breaks max/day", unit: "" },
                ].map(({ key, label, unit }) => (
                  <div key={key} className="proto-field-row">
                    <span className="proto-field-label">{label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" className="proto-field-input" aria-label={label} value={protoOverride[key] ?? activeProto[key]} onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v > 0) setProtoOverride((prev) => ({ ...prev, [key]: v })); }} />
                      {unit && <span className="t-helper">{unit}</span>}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setProtoOverride({}); setProtoWarnAck(false); }} className="t-helper" style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} type="button">Reset to defaults</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
