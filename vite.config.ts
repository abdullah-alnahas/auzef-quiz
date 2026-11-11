import { defineConfig, type Plugin } from "vite";

/**
 * Emit the hand-written service worker with a precache list built from the
 * actual bundle. One version string per build; obsolete caches are removed on
 * activate.
 */
function serviceWorker(): Plugin {
  const version = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    name: "auzef-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => !name.endsWith(".map") && name !== "sw.js")
        .map((name) => `./${name}`);
      const source = `/* generated ${version} */
const VERSION = ${JSON.stringify(version)};
const SHELL = "shell-" + VERSION;
const CONTENT = "content-v1";
const PRECACHE = ${JSON.stringify(["./", "./index.html", "./data/manifest.json", ...assets])};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== CONTENT).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Exam JSON and assets are cached only by an explicit download.
  if (url.pathname.includes("/data/exams/") || url.pathname.includes("/data/assets/")) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((hit) => hit || fetch(request))
    );
    return;
  }

  // Manifest: network first, cache as offline fallback.
  if (url.pathname.endsWith("/data/manifest.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request, { ignoreVary: true }))
    );
    return;
  }

  // Navigations fall back to the cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html", { ignoreVary: true }).then((hit) => hit || fetch(request))
    );
    return;
  }

  // App shell assets: cache first.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
