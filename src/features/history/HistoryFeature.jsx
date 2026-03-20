import { useState } from "react";
import EmptyState from "../../components/EmptyState";
import { buildEditedActivityIso, sortByDateAsc, toDateInputValue, toTimeInputValue } from "../../lib/activityDateTime";
import { normalizeDistressLevel } from "../../lib/protocol";
import { PATTERN_TYPES, fmt, fmtDate, parseDurationInput, sessionDetailBadges, walkTypeLabel } from "../app/helpers";
import { Img, ModalCloseButton } from "../app/ui";
import { mergeSessionWithDerivedFields, normalizeSession } from "../app/storage";

function HistoryActionGroup({ actions }) {
  return (
    <div className="h-actions" role="group" aria-label="Item actions">
      {actions.map(({ key, className = "", label, icon, onClick }) => (
        <button
          key={key}
          className={`h-action-btn ${className}`.trim()}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          title={label}
          aria-label={label}
        >
          <span className="h-action-icon" aria-hidden="true">{icon}</span>
          <span className="h-action-text">{label}</span>
        </button>
      ))}
    </div>
  );
}

function HistoryDetailGroup({ label, children }) {
  return (
    <div className="h-detail-group">
      <div className="h-detail-label">{label}</div>
      <div className="h-detail-body">{children}</div>
    </div>
  );
}

function HistoryChipList({ items }) {
  if (!items?.length) return <div className="h-detail-empty">No extra details recorded.</div>;
  return (
    <div className="h-chip-list">
      {items.map((item) => <span className="h-chip" key={item}>{item}</span>)}
    </div>
  );
}

export function useHistoryEditing({
  sessions,
  walks,
  patterns,
  feedings,
  patLabels,
  showToast,
  pushWithSyncStatus,
  syncDelete,
  syncDeleteSessionsForDog,
  commitSessions,
  setWalks,
  setPatterns,
  setFeedings,
  recomputeTarget,
  activeDogId,
  stampLocalEntry,
}) {
  const openHistoryDurationEditor = (kind, entry, setHistoryModal) => {
    if (!entry) return;
    const value = kind === "session" ? entry.actualDuration : entry.duration;
    setHistoryModal({ mode: "duration", kind, id: entry.id, value: Number.isFinite(value) ? String(value) : "" });
  };

  const openHistoryTimeEditor = (kind, entry, setHistoryModal) => {
    if (!entry) return;
    setHistoryModal({ mode: "datetime", kind, id: entry.id, date: toDateInputValue(entry.date), time: toTimeInputValue(entry.date) });
  };

  return {
    editWalkDuration: (walkId, setHistoryModal) => openHistoryDurationEditor("walk", walks.find((w) => w.id === walkId), setHistoryModal),
    editWalkTime: (walkId, setHistoryModal) => openHistoryTimeEditor("walk", walks.find((w) => w.id === walkId), setHistoryModal),
    editSessionTime: (sessionId, setHistoryModal) => openHistoryTimeEditor("session", sessions.find((s) => s.id === sessionId), setHistoryModal),
    editSessionDuration: (sessionId, setHistoryModal) => openHistoryDurationEditor("session", sessions.find((s) => s.id === sessionId), setHistoryModal),
    requestHistoryDelete: (kind, entry, setHistoryModal) => {
      if (!entry) return;
      setHistoryModal({
        mode: "delete",
        kind,
        id: entry.id,
        label: kind === "session"
          ? `Training session · ${fmtDate(entry.date)}`
          : kind === "walk"
            ? `${walkTypeLabel(entry.type)} · ${fmtDate(entry.date)}`
            : kind === "pattern"
              ? `${patLabels[entry.type] || (PATTERN_TYPES.find((item) => item.type === entry.type)?.label ?? "Pattern break")} · ${fmtDate(entry.date)}`
              : `${entry.foodType} feeding · ${fmtDate(entry.date)}`,
      });
    },
    saveEditedActivityTime: (historyModal, setHistoryModal) => {
      if (!historyModal?.date || !historyModal?.time) {
        showToast("⚠️ Please choose a valid date and time");
        return;
      }
      const updatedIso = buildEditedActivityIso(historyModal.date, historyModal.time);
      if (!updatedIso) {
        showToast("⚠️ Please choose a valid date and time");
        return;
      }
      if (historyModal.kind === "walk") {
        const currentWalk = walks.find((w) => w.id === historyModal.id);
        if (!currentWalk) return;
        const updatedWalk = stampLocalEntry({ ...currentWalk, date: updatedIso }, currentWalk);
        setWalks((prev) => sortByDateAsc(prev.map((w) => (w.id === historyModal.id ? updatedWalk : w))));
        pushWithSyncStatus("walk", updatedWalk).then(({ ok, error }) => {
          if (!ok) showToast(`⚠️ Sync failed: ${error}`);
        });
        showToast(`🕒 Walk date and time updated to ${fmtDate(updatedWalk.date)}`);
        setHistoryModal(null);
        return;
      }
      const currentSession = sessions.find((s) => s.id === historyModal.id);
      if (!currentSession) return;
      const updatedSession = stampLocalEntry(normalizeSession({ ...currentSession, date: updatedIso }), currentSession);
      commitSessions(sortByDateAsc(sessions.map((s) => (s.id === historyModal.id ? updatedSession : s))));
      pushWithSyncStatus("session", updatedSession).then(({ ok, error }) => {
        if (!ok) showToast(`⚠️ Sync failed: ${error}`);
      });
      showToast(`🕒 Session date and time updated to ${fmtDate(updatedSession.date)}`);
      setHistoryModal(null);
    },
    saveEditedActivityDuration: (historyModal, setHistoryModal) => {
      if (!historyModal) return;
      const parsedDuration = parseDurationInput(historyModal.value);
      const requiresPositive = historyModal.kind === "session";
      if (!Number.isFinite(parsedDuration) || (requiresPositive ? parsedDuration <= 0 : parsedDuration < 0)) {
        showToast(requiresPositive ? "⚠️ Invalid duration. Use a positive value (seconds or mm:ss)" : "⚠️ Invalid duration. Use seconds or mm:ss");
        return;
      }
      if (historyModal.kind === "walk") {
        const currentWalk = walks.find((w) => w.id === historyModal.id);
        if (!currentWalk) return;
        const updatedWalk = stampLocalEntry({ ...currentWalk, duration: parsedDuration }, currentWalk);
        setWalks((prev) => prev.map((w) => (w.id === historyModal.id ? updatedWalk : w)));
        pushWithSyncStatus("walk", updatedWalk).then(({ ok, error }) => {
          if (!ok) showToast(`⚠️ Sync failed: ${error}`);
        });
        showToast(`🚶 Walk updated to ${fmt(parsedDuration)}`);
        setHistoryModal(null);
        return;
      }
      const currentSession = sessions.find((s) => s.id === historyModal.id);
      if (!currentSession) return;
      const updatedSession = stampLocalEntry(mergeSessionWithDerivedFields(currentSession, { actualDuration: parsedDuration }), currentSession);
      commitSessions(sessions.map((s) => (s.id === historyModal.id ? updatedSession : s)));
      pushWithSyncStatus("session", updatedSession).then(({ ok, error }) => {
        if (!ok) showToast(`⚠️ Sync failed: ${error}`);
      });
      showToast(`⏱️ Session updated to ${fmt(parsedDuration)}`);
      setHistoryModal(null);
    },
    confirmHistoryDelete: (historyModal, setHistoryModal) => {
      if (!historyModal || historyModal.mode !== "delete") return;
      if (historyModal.kind === "session") {
        const nextSessions = sessions.filter((item) => item.id !== historyModal.id);
        commitSessions(nextSessions);
        syncDelete("session", historyModal.id).then((ok) => {
          if (!ok) showToast("⚠️ Session removed locally — remote delete failed");
        });
      } else if (historyModal.kind === "walk") {
        const nextWalks = walks.filter((item) => item.id !== historyModal.id);
        setWalks(nextWalks);
        syncDelete("walk", historyModal.id).then((ok) => {
          if (!ok) showToast("⚠️ Walk removed locally — remote delete failed");
        });
        recomputeTarget(sessions, nextWalks, patterns);
      } else if (historyModal.kind === "pattern") {
        const nextPatterns = patterns.filter((item) => item.id !== historyModal.id);
        setPatterns(nextPatterns);
        syncDelete("pattern", historyModal.id).then((ok) => {
          if (!ok) showToast("⚠️ Pattern break removed locally — remote delete failed");
        });
        recomputeTarget(sessions, walks, nextPatterns);
      } else if (historyModal.kind === "feeding") {
        setFeedings((prev) => prev.filter((item) => item.id !== historyModal.id));
        syncDelete("feeding", historyModal.id).then((ok) => {
          if (!ok) showToast("⚠️ Feeding removed locally — remote delete failed");
        });
      }
      showToast(`🗑️ ${historyModal.label} deleted`);
      setHistoryModal(null);
    },
    clearSessions: () => {
      if (window.confirm("Clear all training sessions?")) {
        commitSessions([]);
        syncDeleteSessionsForDog(activeDogId).then((ok) => {
          if (ok === null) showToast("⚠️ Sessions cleared locally — remote delete failed");
          else showToast("Sessions cleared");
        });
      }
    },
  };
}

const renderSyncBadge = (entry) => {
  const state = entry?.syncState ?? (entry?.pendingSync ? "local" : "synced");
  if (state === "synced") return null;
  const label = state === "error" ? "Sync failed" : state === "syncing" ? "Syncing" : "Local only";
  return (
    <span className={`h-sync-meta h-sync-${state}`}>
      <span className="h-sync-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};

export function HistoryScreen({ timeline, sessions, name, setTab, patLabels, historyModal, setHistoryModal, actions }) {
  const [expandedItemKey, setExpandedItemKey] = useState(null);

  const toggleExpandedItem = (itemKey) => {
    setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey));
  };

  const renderHistoryCard = ({ itemKey, iconClassName, icon, title, date, value, badge, syncBadge, expandedContent }) => {
    const isExpanded = expandedItemKey === itemKey;
    const detailsId = `history-details-${itemKey}`;

    return (
      <div
        className={`h-item ${isExpanded ? "is-expanded" : ""}`.trim()}
        key={itemKey}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => toggleExpandedItem(itemKey)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleExpandedItem(itemKey);
        }}
      >
        <div className={`h-dot ${iconClassName}`.trim()}>{icon}</div>
        <div className="h-body">
          <div className="h-content">
            <div className="h-info">
              <div className="h-main">{title}</div>
              <div className="h-meta-line">
                <span className="h-date">{date}</span>
                {syncBadge}
              </div>
            </div>
            <div className="h-side">
              {value ? <div className="h-value">{value}</div> : null}
              {badge}
            </div>
          </div>
          {isExpanded ? (
            <div className="h-expand" id={detailsId}>
              {expandedContent}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="tab-content">
        <div className="section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <div className="section-title">Activity Log</div>
            {sessions.length > 0 && <button className="clear-btn" onClick={actions.clearSessions}>Clear sessions</button>}
          </div>

          {timeline.length === 0 ? (
            <EmptyState icon="🐾" title="No activity yet" body={`Start ${name}'s first session and your training history will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
          ) : timeline.map((item) => {
            if (item.kind === "session") {
              const s = item.data;
              const lv = normalizeDistressLevel(s.distressLevel ?? (s.result === "success" ? "none" : "strong"));
              const icon = lv === "none" ? "result-calm.png" : lv === "subtle" ? "result-mild.png" : "result-strong.png";
              const detailBadges = sessionDetailBadges(s);
              return renderHistoryCard({
                itemKey: `s-${s.id}`,
                iconClassName: `dot-${lv}`,
                icon: <Img src={icon} size={22} />,
                title: "Training session",
                date: fmtDate(s.date),
                value: fmt(s.actualDuration),
                badge: <span className={`h-badge badge-${lv}`}>{lv === "none" ? "No distress" : lv === "subtle" ? "Subtle stress" : lv === "active" ? "Active distress" : "Severe distress"}</span>,
                syncBadge: renderSyncBadge(s),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Session details">
                      <HistoryChipList items={detailBadges} />
                    </HistoryDetailGroup>
                  </div>
                  <div className="h-expand-footer">
                    <HistoryDetailGroup label="Actions">
                      <HistoryActionGroup
                        actions={[
                          { key: "time", className: "h-edit", label: "Edit session time", icon: "🕒", onClick: () => actions.editSessionTime(s.id, setHistoryModal) },
                          { key: "duration", className: "h-edit", label: "Edit session duration", icon: "✎", onClick: () => actions.editSessionDuration(s.id, setHistoryModal) },
                          { key: "delete", className: "h-del", label: "Delete session", icon: "✕", onClick: () => actions.requestHistoryDelete("session", s, setHistoryModal) },
                        ]}
                      />
                    </HistoryDetailGroup>
                  </div>
                </>,
              });
            }
            if (item.kind === "walk") {
              const w = item.data;
              return renderHistoryCard({
                itemKey: `w-${w.id}`,
                iconClassName: "dot-walk",
                icon: <Img src="walk.png" size={22} />,
                title: `${walkTypeLabel(w.type)} with ${name}`,
                date: fmtDate(w.date),
                value: w.duration ? fmt(w.duration) : "—",
                badge: <span className="h-side-label">Duration</span>,
                syncBadge: renderSyncBadge(w),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Walk details">
                      <HistoryChipList items={["Walk logged", `Type: ${walkTypeLabel(w.type)}`]} />
                    </HistoryDetailGroup>
                  </div>
                  <div className="h-expand-footer">
                    <HistoryDetailGroup label="Actions">
                      <HistoryActionGroup
                        actions={[
                          { key: "time", className: "h-edit", label: "Edit walk time", icon: "🕒", onClick: () => actions.editWalkTime(w.id, setHistoryModal) },
                          { key: "duration", className: "h-edit", label: "Edit walk duration", icon: "✎", onClick: () => actions.editWalkDuration(w.id, setHistoryModal) },
                          { key: "delete", className: "h-del", label: "Delete walk", icon: "✕", onClick: () => actions.requestHistoryDelete("walk", w, setHistoryModal) },
                        ]}
                      />
                    </HistoryDetailGroup>
                  </div>
                </>,
              });
            }
            if (item.kind === "pat") {
              const p = item.data;
              const pt = PATTERN_TYPES.find((x) => x.type === p.type) ?? PATTERN_TYPES[0];
              return renderHistoryCard({
                itemKey: `p-${p.id}`,
                iconClassName: "dot-pat",
                icon: <Img src={pt.icon} size={22} />,
                title: patLabels[pt.type] || pt.label,
                date: fmtDate(p.date),
                badge: <span className="h-badge badge-pat">Pattern break</span>,
                syncBadge: renderSyncBadge(p),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Pattern details">
                      <HistoryChipList items={["Routine support item", pt.desc]} />
                    </HistoryDetailGroup>
                  </div>
                  <div className="h-expand-footer">
                    <HistoryDetailGroup label="Actions">
                      <HistoryActionGroup
                        actions={[
                          { key: "delete", className: "h-del", label: "Delete pattern break", icon: "✕", onClick: () => actions.requestHistoryDelete("pattern", p, setHistoryModal) },
                        ]}
                      />
                    </HistoryDetailGroup>
                  </div>
                </>,
              });
            }
            if (item.kind === "feeding") {
              const f = item.data;
              return renderHistoryCard({
                itemKey: `f-${f.id}`,
                iconClassName: "dot-feed",
                icon: "🍽️",
                title: <span style={{ textTransform: "capitalize" }}>{f.foodType}</span>,
                date: fmtDate(f.date),
                value: f.amount,
                badge: <span className="h-badge badge-feed">Feeding</span>,
                syncBadge: renderSyncBadge(f),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Meal details">
                      <HistoryChipList items={["Meal recorded", `Amount: ${f.amount}`, `Type: ${f.foodType}`]} />
                    </HistoryDetailGroup>
                  </div>
                  <div className="h-expand-footer">
                    <HistoryDetailGroup label="Actions">
                      <HistoryActionGroup
                        actions={[
                          { key: "delete", className: "h-del", label: "Delete feeding", icon: "✕", onClick: () => actions.requestHistoryDelete("feeding", f, setHistoryModal) },
                        ]}
                      />
                    </HistoryDetailGroup>
                  </div>
                </>,
              });
            }
            return null;
          })}
        </div>
      </div>

      {historyModal && (
        <div className="activity-time-overlay" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" onClick={() => setHistoryModal(null)}>
          <div className="activity-time-card history-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="section-title" id="history-modal-title" style={{ marginBottom: 0 }}>
                {historyModal.mode === "delete" ? `Delete ${historyModal.kind === "pattern" ? "pattern break" : historyModal.kind}` : `Edit ${historyModal.kind} ${historyModal.mode === "datetime" ? "date & time" : "duration"}`}
              </div>
              <ModalCloseButton onClick={() => setHistoryModal(null)} />
            </div>

            {historyModal.mode === "datetime" && <>
              <div className="t-helper" style={{ marginBottom: 10 }}>Choose a date and time. Duration is edited separately.</div>
              <label className="activity-time-field">
                <span className="t-helper">Date</span>
                <input type="date" value={historyModal.date} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, date: e.target.value } : prev))} />
              </label>
              <label className="activity-time-field">
                <span className="t-helper">Time of day</span>
                <input type="time" step="60" value={historyModal.time} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, time: e.target.value } : prev))} />
              </label>
              <div className="feeding-actions">
                <button className="walk-cancel-btn" type="button" onClick={() => setHistoryModal(null)}>Cancel</button>
                <button className="walk-end-btn" type="button" onClick={() => actions.saveEditedActivityTime(historyModal, setHistoryModal)}>Save</button>
              </div>
            </>}

            {historyModal.mode === "duration" && <>
              <div className="t-helper" style={{ marginBottom: 10 }}>Enter seconds or <code>mm:ss</code>.</div>
              <label className="activity-time-field">
                <span className="t-helper">Duration</span>
                <input type="text" inputMode="numeric" placeholder="e.g. 90 or 1:30" value={historyModal.value} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, value: e.target.value } : prev))} />
              </label>
              <div className="feeding-actions">
                <button className="walk-cancel-btn" type="button" onClick={() => setHistoryModal(null)}>Cancel</button>
                <button className="walk-end-btn" type="button" onClick={() => actions.saveEditedActivityDuration(historyModal, setHistoryModal)}>Save</button>
              </div>
            </>}

            {historyModal.mode === "delete" && <>
              <div className="history-delete-copy">
                <div className="history-delete-label">{historyModal.label}</div>
                <p>This action removes the item from the timeline for this dog. You can’t undo it after confirmation.</p>
              </div>
              <div className="feeding-actions">
                <button className="walk-cancel-btn" type="button" onClick={() => setHistoryModal(null)}>Keep item</button>
                <button className="history-delete-confirm" type="button" onClick={() => actions.confirmHistoryDelete(historyModal, setHistoryModal)}>Delete</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
