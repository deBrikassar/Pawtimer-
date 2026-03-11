const CACHE_NAME = "pawtimer-v3";
const ASSETS = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
  scheduleNextCheck();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SCHEDULE_NOTIF") {
    saveAlarm({ ...e.data, enabled: true });
    scheduleNextCheck();
  }
  if (e.data?.type === "CANCEL_NOTIF") {
    saveAlarm({ enabled: false });
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      if (list.length) return list[0].focus();
      return clients.openWindow("/");
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
          self.registration.showNotification("PawTimer", {
            body: `Time for ${alarm.dogName}'s training session! Tap to start.`,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: "pawtimer-daily",
            renotify: true,
          });
        }
      }
    }
  } catch {}
  scheduleNextCheck();
}

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("pawtimer_sw", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function saveAlarm(val) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, "alarm");
    tx.oncomplete = res;
    tx.onerror = () => rej();
  });
}
async function loadAlarm() {
  const db = await openDB();
  return new Promise((res) => {
    const req = db.transaction("kv").objectStore("kv").get("alarm");
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => res(null);
  });
}
