import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { loadManifest } from "./data.ts";
import { t, dirOf } from "./i18n.ts";
import { navigate, type ScreenProps } from "./props.ts";
import { applyUpdate, registerServiceWorker } from "./pwa.ts";
import { parseRoute } from "./route.ts";
import { DEFAULT_PREFS, loadPrefs, setPref, type Prefs } from "./storage.ts";
import type { AppManifest } from "./types.ts";
import { Home } from "./screens/home.tsx";
import { Course } from "./screens/course.tsx";
import { Quiz } from "./screens/quiz.tsx";
import { Results } from "./screens/results.tsx";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [fatal, setFatal] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const hash = useHash();
  const route = useMemo(() => parseRoute(hash), [hash]);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
    void (async () => {
      try {
        setPrefsState(await loadPrefs());
      } catch {
        // Storage being unavailable must not block the manifest/content.
        setStorageError(true);
      }
      try {
        setManifest(await loadManifest());
      } catch {
        setFatal(true);
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.lang = prefs.lang;
    document.documentElement.dir = dirOf(prefs.lang);
    document.documentElement.dataset.theme = prefs.theme === "system" ? "" : prefs.theme;
  }, [prefs.lang, prefs.theme]);

  const updatePref = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]): void => {
      setPrefsState((current) => ({ ...current, [key]: value }));
      setPref(key, value).catch(() => setStorageError(true));
    },
    [],
  );

  const props: ScreenProps | null = manifest
    ? { manifest, prefs, updatePref, navigate }
    : null;

  return (
    <>
      <header class="app-header">
        <a class="brand" href="#/">
          {t(prefs.lang, "appName")}
        </a>
        <button
          type="button"
          class="ghost"
          onClick={() => updatePref("lang", prefs.lang === "ar" ? "tr" : "ar")}
        >
          {prefs.lang === "ar" ? "Türkçe" : "العربية"}
        </button>
      </header>

      {updateReady && (
        <div class="banner" role="status">
          <span>{t(prefs.lang, "updateReady")}</span>
          <span class="banner-actions">
            <button type="button" class="primary" onClick={() => applyUpdate()}>
              {t(prefs.lang, "updateReload")}
            </button>
            <button type="button" class="ghost" onClick={() => setUpdateReady(false)}>
              {t(prefs.lang, "later")}
            </button>
          </span>
        </div>
      )}

      {storageError && (
        <div class="banner banner-bad" role="alert">
          <span>{t(prefs.lang, "storageError")}</span>
          <button type="button" class="ghost" onClick={() => setStorageError(false)}>
            ×
          </button>
        </div>
      )}

      <main class="app-main">
        {fatal && <p class="notice">{t(prefs.lang, "notDownloaded")}</p>}
        {!fatal && !props && <p class="muted">{t(prefs.lang, "loading")}</p>}
        {props && route.kind === "course" && (
          <Course {...props} courseId={route.courseId} />
        )}
        {props && route.kind === "quiz" && (
          <Quiz {...props} examId={route.examId} mode={route.mode} />
        )}
        {props && route.kind === "combined" && (
          <Quiz
            {...props}
            courseId={route.courseId}
            scopeGroups={route.groups}
            mode={route.mode}
          />
        )}
        {props && route.kind === "results" && (
          <Results {...props} attemptId={route.attemptId} />
        )}
        {props && route.kind === "home" && <Home {...props} />}
        {props && route.kind === "unknown" && (
          <p class="notice">{t(prefs.lang, "error")}</p>
        )}
      </main>
    </>
  );
}
