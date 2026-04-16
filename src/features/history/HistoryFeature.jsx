import { useState } from "react";
import EmptyState from "../../components/EmptyState";
import { buildEditedActivityIso, sortByDateAsc, toDateInputValue, toTimeInputValue } from "../../lib/activityDateTime";
import { normalizeDistressLevel } from "../../lib/protocol";
import { PATTERN_TYPES, fmt, fmtDate, parseDurationInput, sessionDetailBadges, walkTypeLabel } from "../app/helpers";
import { ClockIcon, DeleteIcon, EditIcon, ModalCloseButton, TrendIcon } from "../app/ui";
import { logSyncDebug, mergeSessionWithDerivedFields, normalizeSession } from "../app/storage";

function HistoryActionGroup({ actions }) {
  return (
    <div className="h-actions" role="group" aria-label="Item actions">
      {actions.map(({ key, className = "", label, icon, onClick }) => (
        <button
          key={key}
          className={`h-action-btn secondary-control secondary-control--icon ${className}`.trim()}
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
  pushTombstoneWithSyncStatus,
  addTombstone,
  commitSessions,
  setWalks,
  setPatterns,
  setFeedings,
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
      logSyncDebug("history:delete:request", {
        kind,
        id: entry.id,
        date: entry.date ?? null,
        actualDuration: entry.actualDuration ?? null,
        plannedDuration: entry.plannedDuration ?? null,
        revision: entry.revision ?? null,
        updatedAt: entry.updatedAt ?? null,
        entry,
      });
      setHistoryModal({
        mode: "delete",
        kind,
        id: entry.id,
        targetDate: entry.date ?? null,
        targetActualDuration: Number.isFinite(entry.actualDuration) ? entry.actualDuration : null,
        targetPlannedDuration: Number.isFinite(entry.plannedDuration) ? entry.plannedDuration : null,
        targetRevision: Number.isFinite(entry.revision) ? entry.revision : null,
        targetUpdatedAt: entry.updatedAt ?? null,
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
        showToast("Please choose a valid date and time");
        return;
      }
      const updatedIso = buildEditedActivityIso(historyModal.date, historyModal.time);
      if (!updatedIso) {
        showToast("Please choose a valid date and time");
        return;
      }
      if (historyModal.kind === "walk") {
        let updatedWalk = null;
        setWalks((prev) => {
          const currentWalk = prev.find((w) => w.id === historyModal.id);
          if (!currentWalk) return prev;
          updatedWalk = stampLocalEntry({ ...currentWalk, date: updatedIso }, currentWalk);
          return sortByDateAsc(prev.map((w) => (w.id === historyModal.id ? updatedWalk : w)));
        });
        if (!updatedWalk) return;
        pushWithSyncStatus("walk", updatedWalk).then(({ ok, error }) => {
          if (!ok) showToast(`Sync failed: ${error}`);
        });
        showToast(`Walk date and time updated to ${fmtDate(updatedWalk.date)}`);
        setHistoryModal(null);
        return;
      }
      let updatedSession = null;
      commitSessions((prev) => {
        const currentSession = prev.find((s) => s.id === historyModal.id);
        if (!currentSession) return prev;
        updatedSession = stampLocalEntry(normalizeSession({ ...currentSession, date: updatedIso }), currentSession);
        return sortByDateAsc(prev.map((s) => (s.id === historyModal.id ? updatedSession : s)));
      });
      if (!updatedSession) return;
      pushWithSyncStatus("session", updatedSession).then(({ ok, error }) => {
        if (!ok) showToast(`Sync failed: ${error}`);
      });
      showToast(`Session date and time updated to ${fmtDate(updatedSession.date)}`);
      setHistoryModal(null);
    },
    saveEditedActivityDuration: (historyModal, setHistoryModal) => {
      if (!historyModal) return;
      const parsedDuration = parseDurationInput(historyModal.value);
      const requiresPositive = historyModal.kind === "session";
      if (!Number.isFinite(parsedDuration) || (requiresPositive ? parsedDuration <= 0 : parsedDuration < 0)) {
        showToast(requiresPositive ? "Invalid duration. Use a positive value (seconds, m:ss, or h:mm:ss)" : "Invalid duration. Use seconds, m:ss, or h:mm:ss");
        return;
      }
      if (historyModal.kind === "walk") {
        let updatedWalk = null;
        setWalks((prev) => {
          const currentWalk = prev.find((w) => w.id === historyModal.id);
          if (!currentWalk) return prev;
          updatedWalk = stampLocalEntry({ ...currentWalk, duration: parsedDuration }, currentWalk);
          return prev.map((w) => (w.id === historyModal.id ? updatedWalk : w));
        });
        if (!updatedWalk) return;
        pushWithSyncStatus("walk", updatedWalk).then(({ ok, error }) => {
          if (!ok) showToast(`Sync failed: ${error}`);
        });
        showToast(`Walk updated to ${fmt(parsedDuration)}`);
        setHistoryModal(null);
        return;
      }
      let updatedSession = null;
      commitSessions((prev) => {
        const currentSession = prev.find((s) => s.id === historyModal.id);
        if (!currentSession) return prev;
        updatedSession = stampLocalEntry(
          mergeSessionWithDerivedFields(currentSession, { actualDuration: parsedDuration }),
          currentSession,
        );
        return prev.map((s) => (s.id === historyModal.id ? updatedSession : s));
      });
      if (!updatedSession) return;
      pushWithSyncStatus("session", updatedSession).then(({ ok, error }) => {
        if (!ok) showToast(`Sync failed: ${error}`);
      });
      showToast(`Session updated to ${fmt(parsedDuration)}`);
      setHistoryModal(null);
    },
    confirmHistoryDelete: (historyModal, setHistoryModal) => {
      if (!historyModal || historyModal.mode !== "delete") return;
      if (historyModal.kind === "session") {
        let tombstoneToPush = null;
        commitSessions((prev) => {
          const matchingById = prev.filter((item) => item.id === historyModal.id);
          const hasDetailedIdentity = Boolean(
            historyModal.targetDate
            || Number.isFinite(historyModal.targetActualDuration)
            || Number.isFinite(historyModal.targetPlannedDuration)
            || Number.isFinite(historyModal.targetRevision)
            || historyModal.targetUpdatedAt,
          );
          const matching = hasDetailedIdentity
            ? prev.filter((item) => (
              item.id === historyModal.id
              && (historyModal.targetDate ? item.date === historyModal.targetDate : true)
              && (Number.isFinite(historyModal.targetActualDuration) ? item.actualDuration === historyModal.targetActualDuration : true)
              && (Number.isFinite(historyModal.targetPlannedDuration) ? item.plannedDuration === historyModal.targetPlannedDuration : true)
              && (Number.isFinite(historyModal.targetRevision) ? item.revision === historyModal.targetRevision : true)
              && (historyModal.targetUpdatedAt ? item.updatedAt === historyModal.targetUpdatedAt : true)
            ))
            : matchingById;
          const existing = matching[0] ?? null;
          logSyncDebug("history:delete:session", {
            targetId: historyModal.id,
            targetDate: historyModal.targetDate ?? null,
            targetActualDuration: historyModal.targetActualDuration ?? null,
            targetPlannedDuration: historyModal.targetPlannedDuration ?? null,
            targetRevision: historyModal.targetRevision ?? null,
            targetUpdatedAt: historyModal.targetUpdatedAt ?? null,
            matchingByIdCount: matchingById.length,
            matchingCount: matching.length,
            beforeCount: prev.length,
            beforeRows: prev.map((item) => ({
              id: item.id,
              date: item.date,
              actualDuration: item.actualDuration ?? null,
              plannedDuration: item.plannedDuration ?? null,
              revision: item.revision ?? null,
              updatedAt: item.updatedAt ?? null,
            })),
          });
          const hasUncertainRemotePersistence = Boolean(
            existing
            && (existing.syncState === "syncing" || existing.syncState === "error"),
          );
          const shouldCreateDeleteTombstone = Boolean(
            existing
            && matchingById.length <= 1
            && (!existing.pendingSync || hasUncertainRemotePersistence),
          );
          if (shouldCreateDeleteTombstone) {
            tombstoneToPush = addTombstone("session", existing);
          }
          const next = hasDetailedIdentity
            ? prev.filter((item) => !(
              item.id === historyModal.id
              && (historyModal.targetDate ? item.date === historyModal.targetDate : true)
              && (Number.isFinite(historyModal.targetActualDuration) ? item.actualDuration === historyModal.targetActualDuration : true)
              && (Number.isFinite(historyModal.targetPlannedDuration) ? item.plannedDuration === historyModal.targetPlannedDuration : true)
              && (Number.isFinite(historyModal.targetRevision) ? item.revision === historyModal.targetRevision : true)
              && (historyModal.targetUpdatedAt ? item.updatedAt === historyModal.targetUpdatedAt : true)
            ))
            : prev.filter((item) => item.id !== historyModal.id);
          logSyncDebug("history:delete:session:result", {
            targetId: historyModal.id,
            afterCount: next.length,
            removedRows: prev.filter((item) => !next.includes(item)).map((item) => ({
              id: item.id,
              date: item.date,
              actualDuration: item.actualDuration ?? null,
              plannedDuration: item.plannedDuration ?? null,
              revision: item.revision ?? null,
              updatedAt: item.updatedAt ?? null,
            })),
            keptRows: next.map((item) => ({
              id: item.id,
              date: item.date,
              actualDuration: item.actualDuration ?? null,
              plannedDuration: item.plannedDuration ?? null,
              revision: item.revision ?? null,
              updatedAt: item.updatedAt ?? null,
            })),
            tombstoneSkippedDueToDuplicateId: Boolean(existing && matchingById.length > 1),
            tombstoneSkippedAsLocalOnly: Boolean(existing && !shouldCreateDeleteTombstone),
          });
          return next;
        });
        if (tombstoneToPush && typeof pushTombstoneWithSyncStatus === "function") {
          pushTombstoneWithSyncStatus(tombstoneToPush).then(({ ok, error }) => {
            if (!ok && error) showToast(`Delete sync failed: ${error}`);
          });
        }
      } else if (historyModal.kind === "walk") {
        setWalks((prev) => {
          const existing = prev.find((item) => item.id === historyModal.id);
          if (existing) addTombstone("walk", existing);
          return prev.filter((item) => item.id !== historyModal.id);
        });
      } else if (historyModal.kind === "pattern") {
        setPatterns((prev) => {
          const existing = prev.find((item) => item.id === historyModal.id);
          if (existing) addTombstone("pattern", existing);
          return prev.filter((item) => item.id !== historyModal.id);
        });
      } else if (historyModal.kind === "feeding") {
        setFeedings((prev) => {
          const existing = prev.find((item) => item.id === historyModal.id);
          if (existing) addTombstone("feeding", existing);
          return prev.filter((item) => item.id !== historyModal.id);
        });
      }
      showToast(`${historyModal.label} deleted`);
      setHistoryModal(null);
    },
    clearSessions: () => {
      if (window.confirm("Clear all training sessions?")) {
        commitSessions((prev) => {
          // Canonical bulk-clear sync contract:
          // clear locally and emit per-session tombstones for durable retry.
          prev.forEach((entry) => addTombstone("session", entry));
          return [];
        });
        showToast("Sessions cleared");
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
  const parsedDuration = historyModal?.mode === "duration" ? parseDurationInput(historyModal.value) : null;
  const requiresPositiveDuration = historyModal?.kind === "session";
  const durationHasInput = historyModal?.mode === "duration" && String(historyModal.value ?? "").trim().length > 0;
  const durationIsValid = historyModal?.mode === "duration"
    ? Number.isFinite(parsedDuration) && (requiresPositiveDuration ? parsedDuration > 0 : parsedDuration >= 0)
    : true;
  const recentCount = timeline.slice(0, 7).length;
  const sessionCount = timeline.filter((item) => item.kind === "session").length;
  const careCount = timeline.filter((item) => item.kind !== "session").length;

  const toggleExpandedItem = (itemKey) => {
    setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey));
  };

  const renderHistoryCard = ({ itemKey, title, date, value, badge, syncBadge, expandedContent }) => {
    const isExpanded = expandedItemKey === itemKey;
    const detailsId = `history-details-${itemKey}`;

    return (
      <div
        className={`h-item surface-row--interactive interactive-row-card ${isExpanded ? "is-expanded" : ""}`.trim()}
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
          <div className="history-section-head">
            <div>
              <div className="section-title">Story timeline</div>
              <div className="t-helper">A narrative of {name}'s training and support routines over time.</div>
            </div>
            {sessions.length > 0 && <button className="clear-btn surface-text-button secondary-control secondary-control--inline-text" onClick={actions.clearSessions}>Clear sessions</button>}
          </div>
          {timeline.length > 0 && (
            <div className="history-story-summary">
              <span>{recentCount} recent moments</span>
              <span>{sessionCount} training sessions</span>
              <span>{careCount} support routine logs</span>
            </div>
          )}

          {timeline.length === 0 ? (
            <EmptyState media={<TrendIcon />} title="No activity yet" body={`Start ${name}'s first session and your training history will appear here.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
          ) : timeline.map((item) => {
            if (item.kind === "session") {
              const s = item.data;
              const lv = normalizeDistressLevel(
                s.distressLevel
                ?? (s.result === "success" ? "none" : (s.result === "distress" ? "strong" : null)),
              );
              const detailBadges = sessionDetailBadges(s);
              return renderHistoryCard({
                itemKey: `s-${s.id}`,
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
                          { key: "time", className: "h-edit", label: "Edit session time", icon: <ClockIcon />, onClick: () => actions.editSessionTime(s.id, setHistoryModal) },
                          { key: "duration", className: "h-edit", label: "Edit session duration", icon: <EditIcon />, onClick: () => actions.editSessionDuration(s.id, setHistoryModal) },
                          { key: "delete", className: "h-del", label: "Delete session", icon: <DeleteIcon />, onClick: () => actions.requestHistoryDelete("session", s, setHistoryModal) },
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
                          { key: "time", className: "h-edit", label: "Edit walk time", icon: <ClockIcon />, onClick: () => actions.editWalkTime(w.id, setHistoryModal) },
                          { key: "duration", className: "h-edit", label: "Edit walk duration", icon: <EditIcon />, onClick: () => actions.editWalkDuration(w.id, setHistoryModal) },
                          { key: "delete", className: "h-del", label: "Delete walk", icon: <DeleteIcon />, onClick: () => actions.requestHistoryDelete("walk", w, setHistoryModal) },
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
                          { key: "delete", className: "h-del", label: "Delete pattern break", icon: <DeleteIcon />, onClick: () => actions.requestHistoryDelete("pattern", p, setHistoryModal) },
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
                title: <span className="history-food-type">{f.foodType}</span>,
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
                          { key: "delete", className: "h-del", label: "Delete feeding", icon: <DeleteIcon />, onClick: () => actions.requestHistoryDelete("feeding", f, setHistoryModal) },
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
          <div className="activity-time-card history-modal-card modal-card modal-card--dialog-sm" onClick={(e) => e.stopPropagation()}>
            <div className="quick-modal-head">
              <div className="section-title section-title--flush" id="history-modal-title">
                {historyModal.mode === "delete" ? `Delete ${historyModal.kind === "pattern" ? "pattern break" : historyModal.kind}` : `Edit ${historyModal.kind} ${historyModal.mode === "datetime" ? "date & time" : "duration"}`}
              </div>
              <ModalCloseButton onClick={() => setHistoryModal(null)} />
            </div>

            {historyModal.mode === "datetime" && <>
              <div className="t-helper activity-time-hint">Choose a date and time. Duration is edited separately.</div>
              <label className="activity-time-field">
                <span className="t-helper">Date</span>
                <input type="date" value={historyModal.date} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, date: e.target.value } : prev))} />
              </label>
              <label className="activity-time-field">
                <span className="t-helper">Time of day</span>
                <input type="time" step="60" value={historyModal.time} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, time: e.target.value } : prev))} />
              </label>
              <div className="feeding-actions">
                <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={() => setHistoryModal(null)}>Cancel</button>
                <button className="walk-end-btn button-base button-primary button--md button--pill" type="button" onClick={() => actions.saveEditedActivityTime(historyModal, setHistoryModal)}>Save</button>
              </div>
            </>}

            {historyModal.mode === "duration" && <>
              <div className="t-helper activity-time-hint">Enter seconds, <code>m:ss</code>, or <code>h:mm:ss</code>.</div>
              <label className="activity-time-field">
                <span className="t-helper">Duration</span>
                <input type="text" inputMode="text" placeholder="e.g. 90, 1:37, or 0:22:57" value={historyModal.value} onChange={(e) => setHistoryModal((prev) => (prev ? { ...prev, value: e.target.value } : prev))} />
              </label>
              {durationHasInput && !durationIsValid ? (
                <div className="t-helper" role="alert">
                  Invalid duration. Use seconds, m:ss, or h:mm:ss.
                </div>
              ) : null}
              <div className="feeding-actions">
                <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={() => setHistoryModal(null)}>Cancel</button>
                <button className="walk-end-btn button-base button-primary button--md button--pill" type="button" disabled={!durationIsValid} onClick={() => actions.saveEditedActivityDuration(historyModal, setHistoryModal)}>Save</button>
              </div>
            </>}

            {historyModal.mode === "delete" && <>
              <div className="history-delete-copy">
                <div className="history-delete-label">{historyModal.label}</div>
                <p>This action removes the item from the timeline for this dog. You can’t undo it after confirmation.</p>
              </div>
              <div className="feeding-actions">
                <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={() => setHistoryModal(null)}>Keep item</button>
                <button className="history-delete-confirm button-base button-danger button--md button--pill" type="button" onClick={() => actions.confirmHistoryDelete(historyModal, setHistoryModal)}>Delete</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
