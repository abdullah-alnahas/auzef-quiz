import { useEffect, useState } from "preact/hooks";
import { ConfirmDialog } from "../components.tsx";
import { clearDownloads } from "../downloads.ts";
import { t } from "../i18n.ts";
import type { ScreenProps } from "../props.ts";
import {
  listSessions,
  resetProgress,
  type StoredSession,
} from "../storage.ts";

function fold(value: string): string {
  return value
    .replaceAll("İ", "i")
    .replaceAll("I", "ı")
    .toLowerCase();
}

export function Home({ manifest, prefs, updatePref, navigate }: ScreenProps) {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDownloads, setConfirmDownloads] = useState(false);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  const needle = fold(query.trim());
  const courses = manifest.courses.filter(
    (course) => !needle || fold(course.course).includes(needle),
  );
  const allExams = manifest.courses.flatMap((course) => course.exams);
  const examById = new Map(allExams.map((exam) => [exam.examId, exam]));

  const resume = sessions
    .filter((session) => !session.submitted && Object.keys(session.answers).length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const resumeExam = resume ? examById.get(resume.examId) : undefined;

  const touched = new Set(
    sessions.filter((s) => Object.keys(s.answers).length > 0).map((s) => s.examId),
  );

  return (
    <div class="stack">
      <section class="hero">
        <h1>{t(prefs.lang, "appName")}</h1>
        <p class="muted">{t(prefs.lang, "tagline")}</p>
      </section>

      {resume && resumeExam && (
        <button
          type="button"
          class="resume-card"
          onClick={() => navigate(`/quiz/${resume.examId}/${resume.mode}`)}
        >
          <span class="resume-label">{t(prefs.lang, "resume")}</span>
          <strong><bdi lang="tr">{resumeExam.exam}</bdi></strong>
          <span class="muted">
            <bdi lang="tr">{resumeExam.course}</bdi> ·{" "}
            {t(prefs.lang, resume.mode === "exam" ? "exam" : "practice")} ·{" "}
            {t(prefs.lang, "answeredCount", {
              a: Object.keys(resume.answers).length,
              n: resumeExam.questionCount,
            })}
          </span>
        </button>
      )}

      <label class="search">
        <span class="visually-hidden">{t(prefs.lang, "search")}</span>
        <input
          type="search"
          value={query}
          placeholder={t(prefs.lang, "search")}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
      </label>

      <section aria-labelledby="courses-title" class="stack-sm">
        <h2 id="courses-title">{t(prefs.lang, "courses")}</h2>
        {courses.length === 0 && <p class="muted">{t(prefs.lang, "noExams")}</p>}
        <ul class="course-list">
          {courses.map((course) => {
            const done = course.exams.filter((exam) => touched.has(exam.examId)).length;
            const total = course.exams.length;
            return (
              <li key={course.courseId}>
                <button
                  type="button"
                  class="course-row"
                  onClick={() => {
                    updatePref("lastCourse", course.courseId);
                    navigate(`/course/${course.courseId}`);
                  }}
                >
                  <span class="course-text">
                    <strong><bdi lang="tr">{course.course}</bdi></strong>
                    <span class="muted">
                      {total} {t(prefs.lang, "examUnit")} ·{" "}
                      {course.exams.reduce((n, exam) => n + exam.questionCount, 0)}{" "}
                      {t(prefs.lang, "questionUnit")}
                    </span>
                  </span>
                  <span class="course-progress" aria-hidden="true">
                    <span
                      class="course-progress-bar"
                      style={{ inlineSize: `${total ? Math.round((done / total) * 100) : 0}%` }}
                    />
                  </span>
                  <span class="visually-hidden">
                    {t(prefs.lang, "answeredCount", { a: done, n: total })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <footer class="home-footer">
        <label class="field">
          <span>{t(prefs.lang, "theme")}</span>
          <select
            value={prefs.theme}
            onChange={(event) =>
              updatePref(
                "theme",
                (event.target as HTMLSelectElement).value as typeof prefs.theme,
              )
            }
          >
            <option value="system">{t(prefs.lang, "themeSystem")}</option>
            <option value="light">{t(prefs.lang, "themeLight")}</option>
            <option value="dark">{t(prefs.lang, "themeDark")}</option>
          </select>
        </label>
        <span class="row-actions">
          <button type="button" class="ghost" onClick={() => setConfirmDownloads(true)}>
            {t(prefs.lang, "removeDownloads")}
          </button>
          <button type="button" class="ghost" onClick={() => setConfirmReset(true)}>
            {t(prefs.lang, "resetProgress")}
          </button>
        </span>
      </footer>

      {confirmDownloads && (
        <ConfirmDialog
          titleId="downloads-title"
          title={t(prefs.lang, "removeDownloads")}
          body={t(prefs.lang, "deleteConfirm")}
          cancelLabel={t(prefs.lang, "cancel")}
          confirmLabel={t(prefs.lang, "confirm")}
          onClose={() => setConfirmDownloads(false)}
          onConfirm={() => {
            void clearDownloads()
              .catch(() => undefined)
              .finally(() => setConfirmDownloads(false));
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          titleId="reset-title"
          title={t(prefs.lang, "resetProgress")}
          body={t(prefs.lang, "resetConfirm")}
          cancelLabel={t(prefs.lang, "cancel")}
          confirmLabel={t(prefs.lang, "confirm")}
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            void resetProgress()
              .then(() => setSessions([]))
              .catch(() => undefined)
              .finally(() => setConfirmReset(false));
          }}
        />
      )}
    </div>
  );
}
