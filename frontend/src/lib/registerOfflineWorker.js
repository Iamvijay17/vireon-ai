// Registers public/sw.js, which swaps the browser's "This site can't be
// reached" for our own offline page (public/offline.html) when a page load
// fails. Service workers only exist on https or localhost, so a plain-http LAN
// address simply keeps the browser's own error page.
export function registerOfflineWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // After `load`, so it never competes with the app's own startup requests.
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // Not worth bothering the user: the app works fine without it.
        console.debug("[offline] service worker not registered", error);
      });
    },
    { once: true },
  );
}

export default registerOfflineWorker;
