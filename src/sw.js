/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ request, url }) =>
    request.destination === "style"
    || request.destination === "script"
    || request.destination === "worker"
    || request.destination === "image"
    || request.destination === "font",
  new StaleWhileRevalidate({
    cacheName: "app-static-runtime",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => /^https:\/\/fonts\.googleapis\.com\/.*/i.test(url.href),
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => /^https:\/\/fonts\.gstatic\.com\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

const appShellHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  ({ request }) => request.mode === "navigate",
  async ({ event }) => {
    try {
      const response = await new NetworkFirst({
        cacheName: "app-navigation",
        networkTimeoutSeconds: 5,
      }).handle({ event, request: event.request });

      return response || appShellHandler({ event, request: event.request });
    } catch {
      return appShellHandler({ event, request: event.request });
    }
  }
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "SCHEDULE_NOTIF") {
    saveAlarm({ ...event.data, enabled: true });
    scheduleNextCheck();
    return;
  }

  if (event.data?.type === "CANCEL_NOTIF") {
    saveAlarm({ enabled: false });
  }
});

self.addEventListener("activate", () => {
  scheduleNextCheck();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow("/");
    })
  );
});

let alarmTimer = null;

function scheduleNextCheck() {
  if (alarmTimer) clearTimeout(alarmTimer);
  alarmTimer = setTimeout(checkAlarm, 60_000);
}

async function checkAlarm() {
  try {
    const alarm = await loadAlarm();
    if (alarm?.enabled) {
      const now = new Date();
      if (now.getHours() === alarm.hour && now.getMinutes() === alarm.minute) {
        const today = now.toDateString();
        if (alarm.lastFired !== today) {
          await saveAlarm({ ...alarm, lastFired: today });
          await self.registration.showNotification("PawTimer", {
            body: `Time for ${alarm.dogName}'s training session! Tap to start.`,
            icon: "/icons/app-logo.png",
            badge: "/icons/app-logo.png",
            tag: "pawtimer-daily",
            renotify: true,
          });
        }
      }
    }
  } catch {
    // Ignore notification scheduling errors so cache/app-shell behavior stays intact.
  }

  scheduleNextCheck();
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pawtimer_sw", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveAlarm(value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, "alarm");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAlarm() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction("kv").objectStore("kv").get("alarm");
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}
