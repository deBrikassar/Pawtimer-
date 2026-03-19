import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";

const dispatchPwaEvent = (type, detail = {}) => {
  window.dispatchEvent(new CustomEvent(type, { detail }));
};

let triggerUpdate = null;

if ("serviceWorker" in navigator) {
  triggerUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      dispatchPwaEvent("pawtimer:pwa-update", { available: true });
    },
    onOfflineReady() {
      dispatchPwaEvent("pawtimer:pwa-offline-ready");
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => registration.update().catch(() => {});

      checkForUpdate();
      window.setInterval(checkForUpdate, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });

      dispatchPwaEvent("pawtimer:pwa-registered", { swUrl });
    },
    onRegisterError(error) {
      console.error("PWA registration failed", error);
    },
  });
}

window.addEventListener("pawtimer:pwa-apply-update", () => {
  triggerUpdate?.(true);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
