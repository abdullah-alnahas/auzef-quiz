let waiting: ServiceWorker | null = null;

export function registerServiceWorker(onUpdate: () => void): void {
  if (!("serviceWorker" in navigator)) return;
  const start = (): void => {
    const url = new URL("sw.js", document.baseURI).toString();
    navigator.serviceWorker
      .register(url, { updateViaCache: "none" })
      .then((registration) => {
        const check = (): void => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            waiting = registration.waiting;
            onUpdate();
          }
        };
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") check();
          });
        });
        check();
      })
      .catch(() => {
        /* the app still works online without a service worker */
      });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

export function applyUpdate(): void {
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
}
