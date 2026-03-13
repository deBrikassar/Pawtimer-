export const canonicalDogId = (value) => String(value || "").trim().toUpperCase();

export function mergeRemoteFirst(localRows = [], remoteRows = []) {
  const index = new Map();
  remoteRows.forEach((row) => {
    if (!row?.id) return;
    index.set(String(row.id), row);
  });
  localRows.forEach((row) => {
    if (!row?.id) return;
    const id = String(row.id);
    if (!index.has(id)) index.set(id, row);
  });
  return [...index.values()].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

export function buildSupabaseUpsert(kind, dogId, row) {
  const id = canonicalDogId(dogId);
  if (!id) throw new Error("dog_id required");
  if (!row?.id) throw new Error("row id required");

  if (kind === "session") {
    return {
      table: "sessions",
      conflictTarget: "id",
      payload: {
        id: String(row.id),
        dog_id: id,
        date: row.date,
        planned_duration: row.plannedDuration,
        actual_duration: row.actualDuration,
        below_threshold: row.belowThreshold,
        latency_to_first_stress: row.latencyToFirstStress,
        distress_severity: row.distressSeverity,
        distress_type: row.distressType,
        rating_confidence: row.ratingConfidence,
        video_review: row.videoReview || null,
        stress_event_timestamps: row.stressEventTimestamps || null,
      },
    };
  }

  if (kind === "walk") {
    return {
      table: "walks",
      conflictTarget: "id",
      payload: {
        id: String(row.id),
        dog_id: id,
        date: row.date,
        walk_type: row.walkType,
        intensity: row.intensity,
        duration: row.duration,
        time_relative_to_session: row.timeRelativeToSession,
        notes: row.notes || null,
      },
    };
  }

  return {
    table: "patterns",
    conflictTarget: "id",
    payload: {
      id: String(row.id),
      dog_id: id,
      date: row.date,
      type: row.type,
      reaction_level: row.reactionLevel || "none",
    },
  };
}
