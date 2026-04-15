import { feedingKey, patKey, sessKey, tombKey, walkKey } from "./storage";

export const formatStorageWriteError = (error, key) => {
  const message = error instanceof Error ? error.message : String(error || "Unknown local storage error");
  return `Unable to save local data (${key}): ${message}`;
};

export const markCollectionStorageError = (items, errorMessage) => items.map((item) => ({
  ...item,
  pendingSync: true,
  syncState: "error",
  syncError: errorMessage,
}));

export const persistValue = (key, value, saveFn) => {
  const writer = typeof saveFn === "function" ? saveFn : () => ({ ok: false, error: "Missing save function" });
  const result = writer(key, value);
  if (result?.ok) return { ok: true, error: "" };
  return { ok: false, error: formatStorageWriteError(result?.error, key) };
};

export const persistJoinedDogState = ({
  dogId,
  sessions,
  walks,
  patterns,
  feedings,
  tombstones,
  saveFn,
}) => {
  const writes = [
    { key: sessKey(dogId), value: sessions },
    { key: walkKey(dogId), value: walks },
    { key: patKey(dogId), value: patterns },
    { key: feedingKey(dogId), value: feedings },
    { key: tombKey(dogId), value: tombstones },
  ];

  for (const write of writes) {
    const result = persistValue(write.key, write.value, saveFn);
    if (!result.ok) return { ok: false, error: result.error, failedKey: write.key };
  }

  return { ok: true, error: "", failedKey: null };
};
