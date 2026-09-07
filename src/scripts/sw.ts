/** Registers the offline service worker in production only. */
export function initServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;

  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a bonus, never a hard requirement */
    });
  });
}
