/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

const DB_NAME = "pawtimer-reminders";
const DB_VERSION = 1;
const STORE_NAME = "config";
const CONFIG_KEY = "daily-reminder";
const NOTIF_TAG = "pawtimer-daily-reminder";

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

const openReminderDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error("Failed to open reminder storage"));
});

const readReminderConfig = async () => {
  const db = await openReminderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(CONFIG_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Failed to read reminder config"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const writeReminderConfig = async (config) => {
  const db = await openReminderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(config, CONFIG_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve(config);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to persist reminder config"));
    };
  });
};

const deleteReminderConfig = async () => {
  const db = await openReminderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(CONFIG_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to clear reminder config"));
    };
  });
};

const computeWindowStart = ({ hour, minute }, nowMs) => {
  const now = new Date(nowMs);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() > nowMs) {
    target.setDate(target.getDate() - 1);
  }
  return target.getTime();
};

const maybeDispatchReminder = async ({ source = "manual-check" } = {}) => {
  if (!("Notification" in self)) {
    return { ok: false, reason: "notification-unsupported" };
  }
  const config = await readReminderConfig();
  if (!config?.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, reason: "permission-denied" };
  }

  const nowMs = Date.now();
  const windowStartMs = computeWindowStart(config, nowMs);
  if (nowMs < windowStartMs) {
    return { ok: false, reason: "not-due" };
  }

  const lastTriggeredAt = Number(config.lastTriggeredAt || 0);
  if (lastTriggeredAt >= windowStartMs) {
    return { ok: true, reason: "already-triggered", triggered: false };
  }

  await self.registration.showNotification("PawTimer reminder", {
    body: `Time for ${config.dogName || "your dog"}'s training check-in.`,
    tag: NOTIF_TAG,
    renotify: false,
  });

  await writeReminderConfig({
    ...config,
    lastTriggeredAt: nowMs,
    lastTriggerSource: source,
  });

  return { ok: true, triggered: true, dueAt: new Date(windowStartMs).toISOString() };
};

const reply = (event, payload) => {
  const port = event.ports?.[0];
  if (port) {
    port.postMessage(payload);
  }
};

self.addEventListener("message", (event) => {
  const handle = async () => {
    const data = event?.data || {};
    if (data.type === "SKIP_WAITING") {
      self.skipWaiting();
      reply(event, { ok: true });
      return;
    }

    if (data.type === "SCHEDULE_NOTIF") {
      const hour = Number(data.hour);
      const minute = Number(data.minute);
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        reply(event, { ok: false, error: "invalid-time" });
        return;
      }
      await writeReminderConfig({
        enabled: true,
        hour,
        minute,
        dogName: String(data.dogName || "your dog"),
        updatedAt: Date.now(),
      });
      const check = await maybeDispatchReminder({ source: "schedule" });
      reply(event, { ok: true, configSaved: true, check });
      return;
    }

    if (data.type === "CANCEL_NOTIF") {
      await deleteReminderConfig();
      const existing = await self.registration.getNotifications({ tag: NOTIF_TAG });
      existing.forEach((notif) => notif.close());
      reply(event, { ok: true, cancelled: true });
      return;
    }

    if (data.type === "CHECK_NOTIF") {
      const check = await maybeDispatchReminder({ source: data.source || "manual-check" });
      reply(event, check);
    }
  };

  event.waitUntil(handle().catch((error) => {
    reply(event, { ok: false, error: error?.message || "unknown-error" });
  }));
});
