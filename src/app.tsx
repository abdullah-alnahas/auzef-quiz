import { useCallback, useEffect, useState } from "preact/hooks";
import { loadManifest } from "./data.ts";
import { t, dirOf } from "./i18n.ts";
import { navigate, type ScreenProps } from "./props.ts";
import { applyUpdate, registerServiceWorker } from "./pwa.ts";
import { DEFAULT_PREFS, loadPrefs, setPref, type Prefs } from "./storage.ts";
import type { AppManifest } from "./types.ts";
import { Home } from "./screens/home.tsx";
import { Course } from "./screens/course.tsx";
import { Quiz } from "./screens/quiz.tsx";
import { Results } from "./screens/results.tsx";

function useRoute(): string[] {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [fatal, setFatal] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const route = useRoute();

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
    void (async () => {
      setPrefsState(await loadPrefs());
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
        {props && route[0] === "course" && (
          <Course {...props} courseId={route[1] ?? ""} />
        )}
        {props && route[0] === "quiz" && (
          <Quiz
            {...props}
            examId={route[1] ?? ""}
            mode={route[2] === "exam" ? "exam" : "practice"}
          />
        )}
        {props && route[0] === "results" && (
          <Results {...props} attemptId={Number(route[1])} />
        )}
        {props && route.length === 0 && <Home {...props} />}
        {props && !["course", "quiz", "results"].includes(route[0]) && route.length > 0 && (
          <p class="notice">{t(prefs.lang, "error")}</p>
        )}
      </main>
    </>
  );
}
