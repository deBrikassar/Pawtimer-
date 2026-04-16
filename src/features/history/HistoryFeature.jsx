import { useEffect, useState } from "react";
import EmptyState from "../../components/EmptyState";
import { InlineBanner } from "../../components/primitives";
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
  if (!items?.length) return <div className="h-detail-empty">No extra notes logged yet.</div>;
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
      commitSessions((prev) => {
        // Canonical bulk-clear sync contract:
        // clear locally and emit per-session tombstones for durable retry.
        prev.forEach((entry) => addTombstone("session", entry));
        return [];
      });
      showToast("Sessions cleared");
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
  const [sessionDetail, setSessionDetail] = useState(null);
  const [clearSessionsConfirmOpen, setClearSessionsConfirmOpen] = useState(false);
  const parsedDuration = historyModal?.mode === "duration" ? parseDurationInput(historyModal.value) : null;
  const requiresPositiveDuration = historyModal?.kind === "session";
  const durationHasInput = historyModal?.mode === "duration" && String(historyModal.value ?? "").trim().length > 0;
  const durationIsValid = historyModal?.mode === "duration"
    ? Number.isFinite(parsedDuration) && (requiresPositiveDuration ? parsedDuration > 0 : parsedDuration >= 0)
    : true;
  const recentCount = timeline.slice(0, 7).length;
  const sessionCount = timeline.filter((item) => item.kind === "session").length;
  const careCount = timeline.filter((item) => item.kind !== "session").length;
  const lastSession = timeline.find((item) => item.kind === "session");
  const timelineByDay = timeline.reduce((acc, item) => {
    const isoDate = item?.date;
    if (!isoDate) return acc;
    const dayKey = isoDate.slice(0, 10);
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(item);
    return acc;
  }, {});
  const dayGroups = Object.entries(timelineByDay).sort(([a], [b]) => (a < b ? 1 : -1));
  const recentTrend = (() => {
    const trendDays = 7;
    const today = new Date();
    const buckets = [];
    for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
      const bucketDate = new Date(today);
      bucketDate.setHours(0, 0, 0, 0);
      bucketDate.setDate(bucketDate.getDate() - offset);
      const dayKey = bucketDate.toISOString().slice(0, 10);
      const daySessions = timelineByDay[dayKey]?.filter((item) => item.kind === "session") ?? [];
      const calmSessions = daySessions.filter((item) => normalizeDistressLevel(item?.data?.distressLevel) === "none").length;
      buckets.push({
        dayKey,
        count: daySessions.length,
        calmCount: calmSessions,
        label: bucketDate.toLocaleDateString(undefined, { weekday: "short" }),
      });
    }
    return buckets;
  })();
  const historyInsights = (() => {
    const sessionItems = timeline
      .filter((item) => item.kind === "session")
      .map((item) => item.data)
      .filter((session) => session?.date)
      .sort((a, b) => (a.date > b.date ? 1 : -1));
    if (sessionItems.length < 2) return [];

    const scoreDistress = (session) => {
      const level = normalizeDistressLevel(
        session?.distressLevel
        ?? (session?.result === "success" ? "none" : (session?.result === "distress" ? "strong" : null)),
      );
      if (level === "none") return 0;
      if (level === "subtle") return 1;
      if (level === "active") return 2;
      return 3;
    };

    const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const latestSessions = sessionItems.slice(-6);
    const latestThree = latestSessions.slice(-3);
    const previousThree = latestSessions.slice(0, 3);
    const insightPool = [];

    if (latestThree.length === 3 && previousThree.length === 3) {
      const recentDistress = average(latestThree.map(scoreDistress));
      const priorDistress = average(previousThree.map(scoreDistress));
      if (recentDistress + 0.35 < priorDistress) {
        insightPool.push("Improving over recent sessions.");
      }
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const todaySessions = sessionItems.filter((session) => session.date.slice(0, 10) === todayKey);
    if (todaySessions.length >= 2) {
      const todayDurations = todaySessions
        .map((session) => (Number.isFinite(session.actualDuration) ? session.actualDuration : 0))
        .filter((duration) => duration > 0);
      const todayDistressAvg = average(todaySessions.map(scoreDistress));
      if (todayDurations.length >= 2 && todayDistressAvg <= 1) {
        const spread = Math.max(...todayDurations) - Math.min(...todayDurations);
        if (spread <= 120) insightPool.push("More stable today.");
      }
    }

    const distressScores = sessionItems.map(scoreDistress);
    const mostRecentStressIndex = distressScores.reduce((latestIndex, score, index) => (score >= 2 ? index : latestIndex), -1);
    if (mostRecentStressIndex >= 0 && mostRecentStressIndex + 2 < sessionItems.length) {
      const preStressDuration = sessionItems
        .slice(Math.max(0, mostRecentStressIndex - 2), mostRecentStressIndex)
        .map((session) => session.actualDuration)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      const postStressDuration = sessionItems
        .slice(mostRecentStressIndex + 1, mostRecentStressIndex + 3)
        .map((session) => session.actualDuration)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      if (preStressDuration.length && postStressDuration.length) {
        if (average(postStressDuration) <= average(preStressDuration) * 0.82) {
          insightPool.push("Shorter sessions after a stress event.");
        }
      }
    }

    if (sessionItems.length >= 4) {
      const lastTwoScores = sessionItems.slice(-2).map(scoreDistress);
      const priorScores = sessionItems.slice(-6, -2).map(scoreDistress);
      const hadStressBefore = priorScores.some((score) => score >= 2);
      const nowCalm = lastTwoScores.every((score) => score <= 1);
      if (hadStressBefore && nowCalm) {
        insightPool.push("Back on track.");
      }
    }

    if (!insightPool.length) {
      return ["Steady rhythm this week."];
    }
    return insightPool.slice(0, 2);
  })();
  const trendMax = Math.max(1, ...recentTrend.map((day) => day.count));
  const trendLevel = (count) => {
    if (count <= 0) return 0;
    const ratio = count / trendMax;
    if (ratio >= 0.8) return 4;
    if (ratio >= 0.6) return 3;
    if (ratio >= 0.35) return 2;
    if (ratio >= 0.15) return 1;
    return 0;
  };

  const toggleExpandedItem = (itemKey) => {
    setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey));
  };

  useEffect(() => {
    if (!sessionDetail) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSessionDetail(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sessionDetail]);

  const renderHistoryCard = ({ itemKey, title, date, value, badge, syncBadge, expandedContent, kindLabel, onActivate }) => {
    const isExpanded = expandedItemKey === itemKey;
    const detailsId = `history-details-${itemKey}`;
    const isInteractiveCard = typeof onActivate === "function" || Boolean(expandedContent);
    const cardClassName = `h-item ${isExpanded ? "is-expanded" : ""} ${typeof onActivate === "function" ? "is-tap-card" : ""}`.trim();

    const handleActivate = () => {
      if (typeof onActivate === "function") {
        onActivate();
        return;
      }
      if (expandedContent) toggleExpandedItem(itemKey);
    };

    return (
      <div
        className={cardClassName}
        key={itemKey}
        role={isInteractiveCard ? "button" : undefined}
        tabIndex={isInteractiveCard ? 0 : undefined}
        aria-expanded={expandedContent ? isExpanded : undefined}
        aria-controls={expandedContent ? detailsId : undefined}
        onClick={isInteractiveCard ? handleActivate : undefined}
        onKeyDown={(event) => {
          if (!isInteractiveCard) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          handleActivate();
        }}
      >
        <div className="h-body">
          <div className="h-content">
            <div className="h-marker" aria-hidden="true" />
            <div className="h-info">
              <div className="h-kind">{kindLabel}</div>
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
              <div className="section-title">History</div>
              <div className="t-helper">A timeline of {name}&rsquo;s calm-alone reps and support routine.</div>
            </div>
            {sessions.length > 0 && <button className="clear-btn surface-text-button secondary-control secondary-control--inline-text" onClick={() => setClearSessionsConfirmOpen((prev) => !prev)}>{clearSessionsConfirmOpen ? "Cancel" : "Clear sessions"}</button>}
          </div>
          {clearSessionsConfirmOpen && sessions.length > 0 ? (
            <InlineBanner
              className="history-clear-banner"
              tone="warning"
              title="Clear all calm-alone reps?"
              body="This clears session entries from this device and sync queue. Walks, feeding logs, and pattern breaks stay untouched."
              action={(
                <div className="history-clear-banner-actions">
                  <button className="button-base button-ghost button--sm button--pill" type="button" onClick={() => setClearSessionsConfirmOpen(false)}>Keep sessions</button>
                  <button
                    className="button-base button-danger button--sm button--pill"
                    type="button"
                    onClick={() => {
                      actions.clearSessions();
                      setClearSessionsConfirmOpen(false);
                    }}
                  >
                    Clear now
                  </button>
                </div>
              )}
            />
          ) : null}
          {timeline.length > 0 && (
            <div className="history-summary-surface">
              <div className="history-summary-grid">
                <div className="history-summary-item">
                  <div className="history-summary-value">{sessionCount}</div>
                  <div className="history-summary-label">Calm-alone reps</div>
                </div>
                <div className="history-summary-item">
                  <div className="history-summary-value">{careCount}</div>
                  <div className="history-summary-label">Support routine logs</div>
                </div>
                <div className="history-summary-item">
                  <div className="history-summary-value">{recentCount}</div>
                  <div className="history-summary-label">Recent training moments</div>
                </div>
              </div>
              <div className="history-mini-trend" aria-label="Last seven days of training sessions">
                <div className="history-mini-trend-head">
                  <span>7-day calm-alone rhythm</span>
                  <span>{recentTrend.reduce((sum, day) => sum + day.count, 0)} reps</span>
                </div>
                <div className="history-mini-trend-bars" role="img" aria-label="Each bar shows number of sessions completed each day">
                  {recentTrend.map((day) => (
                    <div className="history-mini-trend-day" key={day.dayKey}>
                      <div
                        className={`history-mini-trend-bar history-mini-trend-bar--level-${trendLevel(day.count)}`}
                        title={`${day.dayKey}: ${day.count} session${day.count === 1 ? "" : "s"}, ${day.calmCount} calm`}
                      />
                      <span>{day.label.slice(0, 1)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {historyInsights.length > 0 ? (
                <div className="history-insights" aria-label="History summary insights">
                  {historyInsights.map((insight) => (
                    <span className="history-insight-pill" key={insight}>{insight}</span>
                  ))}
                </div>
              ) : null}
              {lastSession ? <div className="history-summary-note">Latest calm-alone rep: {fmtDate(lastSession.date)}.</div> : null}
            </div>
          )}

          {timeline.length === 0 ? (
            <EmptyState media={<TrendIcon />} title="No logs yet" body={`Start ${name}&apos;s first rep to build a training history.`} ctaLabel="Go to Train →" onCta={() => setTab("home")} />
          ) : dayGroups.map(([dayKey, items]) => (
            <div className="history-day-group" key={dayKey}>
              <div className="history-day-label">{new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
              <div className="history-day-track">
                {items.map((item) => {
            if (item.kind === "session") {
              const s = item.data;
              const lv = normalizeDistressLevel(
                s.distressLevel
                ?? (s.result === "success" ? "none" : (s.result === "distress" ? "strong" : null)),
              );
              return renderHistoryCard({
                itemKey: `s-${s.id}`,
                title: "Calm-alone training rep",
                date: fmtDate(s.date),
                value: fmt(s.actualDuration),
                kindLabel: "Calm-alone",
                onActivate: () => setSessionDetail(s),
                badge: <span className={`h-badge badge-${lv}`}>{lv === "none" ? "No distress" : lv === "subtle" ? "Subtle stress" : lv === "active" ? "Active distress" : "Severe distress"}</span>,
                syncBadge: renderSyncBadge(s),
              });
            }
            if (item.kind === "walk") {
              const w = item.data;
              return renderHistoryCard({
                itemKey: `w-${w.id}`,
                title: `${walkTypeLabel(w.type)} with ${name}`,
                date: fmtDate(w.date),
                value: w.duration ? fmt(w.duration) : "—",
                kindLabel: "Support",
                badge: <span className="h-side-label">Duration</span>,
                syncBadge: renderSyncBadge(w),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Walk details">
                      <HistoryChipList items={["Walk logged for decompression support", `Type: ${walkTypeLabel(w.type)}`]} />
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
                kindLabel: "Support",
                badge: <span className="h-badge badge-pat">Pattern break</span>,
                syncBadge: renderSyncBadge(p),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Pattern details">
                      <HistoryChipList items={["Departure-cue support item", pt.desc]} />
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
                kindLabel: "Support",
                badge: <span className="h-badge badge-feed">Feeding</span>,
                syncBadge: renderSyncBadge(f),
                expandedContent: <>
                  <div className="h-expand-grid">
                    <HistoryDetailGroup label="Meal details">
                      <HistoryChipList items={["Meal recorded for routine consistency", `Amount: ${f.amount}`, `Type: ${f.foodType}`]} />
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
          })}</div></div>
          ))}
        </div>
      </div>

      {historyModal && (
        <div className="activity-time-overlay quick-modal-overlay--sheet" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" onClick={() => setHistoryModal(null)}>
          <div className="activity-time-card history-modal-card modal-card modal-card--dialog-sm modal-card--sheet" onClick={(e) => e.stopPropagation()}>
            <div className="history-session-sheet-grabber" aria-hidden="true" />
            <div className="quick-modal-head">
              <div className="section-title section-title--flush" id="history-modal-title">
                {historyModal.mode === "delete" ? `Delete ${historyModal.kind === "pattern" ? "pattern break" : historyModal.kind}` : `Edit ${historyModal.kind} ${historyModal.mode === "datetime" ? "date & time" : "duration"}`}
              </div>
              <ModalCloseButton onClick={() => setHistoryModal(null)} />
            </div>

            {historyModal.mode === "datetime" && <>
              <div className="t-helper activity-time-hint">Choose when this dog activity happened. Duration is edited separately.</div>
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
                <p>This removes the item from this dog&apos;s training timeline. You can’t undo it after confirmation.</p>
              </div>
              <div className="feeding-actions">
                <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={() => setHistoryModal(null)}>Keep item</button>
                <button className="history-delete-confirm button-base button-danger button--md button--pill" type="button" onClick={() => actions.confirmHistoryDelete(historyModal, setHistoryModal)}>Delete</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {sessionDetail && (
        <div
          className="history-session-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-session-sheet-title"
          onClick={() => setSessionDetail(null)}
        >
          <div className="history-session-sheet modal-card modal-card--dialog-md" onClick={(event) => event.stopPropagation()}>
            <div className="history-session-sheet-grabber" aria-hidden="true" />
            <div className="quick-modal-head">
              <div className="section-title section-title--flush" id="history-session-sheet-title">Calm-alone rep details</div>
              <ModalCloseButton onClick={() => setSessionDetail(null)} />
            </div>
            <div className="history-session-sheet-meta">
              <div className="history-session-sheet-value">{fmt(sessionDetail.actualDuration)}</div>
              <div className="history-session-sheet-date">{fmtDate(sessionDetail.date)}</div>
            </div>
            <HistoryDetailGroup label="Details">
              <HistoryChipList items={sessionDetailBadges(sessionDetail)} />
            </HistoryDetailGroup>
            <HistoryDetailGroup label="Actions">
              <HistoryActionGroup
                actions={[
                  {
                    key: "time",
                    className: "h-edit",
                    label: "Edit session time",
                    icon: <ClockIcon />,
                    onClick: () => {
                      actions.editSessionTime(sessionDetail.id, setHistoryModal);
                      setSessionDetail(null);
                    },
                  },
                  {
                    key: "duration",
                    className: "h-edit",
                    label: "Edit session duration",
                    icon: <EditIcon />,
                    onClick: () => {
                      actions.editSessionDuration(sessionDetail.id, setHistoryModal);
                      setSessionDetail(null);
                    },
                  },
                  {
                    key: "delete",
                    className: "h-del",
                    label: "Delete session",
                    icon: <DeleteIcon />,
                    onClick: () => {
                      actions.requestHistoryDelete("session", sessionDetail, setHistoryModal);
                      setSessionDetail(null);
                    },
                  },
                ]}
              />
            </HistoryDetailGroup>
          </div>
        </div>
      )}
    </>
  );
}
