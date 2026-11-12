import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
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
      // Blocked storage (private mode, quota, policy) must not stop the app from
      // loading: fall back to defaults and tell the user progress won't persist.
      try {
        setPrefsState(await loadPrefs());
      } catch {
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

  // Hash routing keeps one document: give every route a distinct title so the
  // tab, history and screen-reader context describe the current screen.
  useEffect(() => {
    const app = t(prefs.lang, "appName");
    const courseId =
      route.kind === "course" || route.kind === "combined" ? route.courseId : null;
    const course = courseId
      ? manifest?.courses.find((entry) => entry.courseId === courseId)
      : undefined;
    const exam =
      route.kind === "quiz"
        ? manifest?.courses
            .flatMap((entry) => entry.exams)
            .find((entry) => entry.examId === route.examId)
        : undefined;
    let page = "";
    if (route.kind === "course" && course) page = course.course;
    else if (route.kind === "quiz" && exam) page = exam.exam;
    else if (route.kind === "combined" && course) page = course.course;
    else if (route.kind === "results") page = t(prefs.lang, "results");
    document.title = page ? `${page} — ${app}` : `${app} AUZEF`;
  }, [prefs.lang, manifest, route]);

  // A hash route change swaps the whole view: move focus to the new screen so
  // keyboard and screen-reader users are not left at the top of the old one.
  const mainRef = useRef<HTMLElement>(null);
  const previousHash = useRef(hash);
  useEffect(() => {
    if (previousHash.current === hash) return;
    previousHash.current = hash;
    mainRef.current?.focus({ preventScroll: true });
  }, [hash]);

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
          <span class="visually-hidden">
            {" "}
            — {t(prefs.lang, "switchLanguage")}
          </span>
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
          <button
            type="button"
            class="ghost"
            onClick={() => setStorageError(false)}
          >
            ×<span class="visually-hidden"> {t(prefs.lang, "dismiss")}</span>
          </button>
        </div>
      )}

      <main class="app-main" ref={mainRef} tabIndex={-1}>
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
