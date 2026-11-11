import { useEffect, useState } from "preact/hooks";
import { Dialog } from "../components.tsx";
import { t } from "../i18n.ts";
import type { ScreenProps } from "../props.ts";
import {
  courseStatus,
  downloadExam,
  removeExam,
  type DownloadState,
  type Progress,
} from "../downloads.ts";
import type { ExamSummary } from "../types.ts";

function periodOf(exam: string): string {
  const match = /^(\d{4}(?:-\d{4})?)/.exec(exam);
  return match ? match[1] : "—";
}

function statusLabel(
  lang: "ar" | "tr",
  status: DownloadState,
): string {
  if (status === "complete") return t(lang, "downloaded");
  if (status === "partial") return t(lang, "incompleteDownload");
  if (status === "update") return t(lang, "updateAvailable");
  return "";
}

export function Course({ manifest, prefs, navigate, courseId }: ScreenProps & {
  courseId: string;
}) {
  const course = manifest.courses.find((entry) => entry.courseId === courseId);
  const [statuses, setStatuses] = useState<Record<string, DownloadState>>({});
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ExamSummary | null>(null);

  const refresh = async (): Promise<void> => {
    if (!course) return;
    setStatuses(await courseStatus(course.exams));
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  if (!course) {
    return <p class="notice">{t(prefs.lang, "error")}</p>;
  }

  const groups = new Map<string, ExamSummary[]>();
  for (const exam of course.exams) {
    const key = periodOf(exam.exam);
    groups.set(key, [...(groups.get(key) ?? []), exam]);
  }

  const download = async (exam: ExamSummary): Promise<void> => {
    setError(false);
    try {
      await downloadExam(exam, (value) =>
        setProgress((current) => ({ ...current, [exam.examId]: value })),
      );
    } catch {
      setError(true);
    } finally {
      setProgress((current) => {
        const next = { ...current };
        delete next[exam.examId];
        return next;
      });
      await refresh();
    }
  };

  const downloadAll = async (): Promise<void> => {
    setBusy(true);
    for (const exam of course.exams) {
      if ((await courseStatus([exam]))[exam.examId] === "complete") continue;
      await download(exam);
    }
    setBusy(false);
  };

  return (
    <div class="stack">
      <button type="button" class="ghost back" onClick={() => navigate("/")}>
        ← {t(prefs.lang, "back")}
      </button>
      <h1>{course.course}</h1>
      <div class="row-actions">
        <button type="button" class="secondary" disabled={busy} onClick={() => void downloadAll()}>
          {t(prefs.lang, "downloadCourse")}
        </button>
      </div>
      {error && <p class="notice notice-bad">{t(prefs.lang, "downloadFailed")}</p>}

      {[...groups.entries()].map(([period, exams]) => (
        <section key={period} class="stack-sm" aria-labelledby={`p-${period}`}>
          <h2 id={`p-${period}`} class="period-title">
            {period}
          </h2>
          <ul class="exam-list">
            {exams.map((exam) => {
              const status = statuses[exam.examId] ?? "none";
              const running = progress[exam.examId];
              return (
                <li key={exam.examId} class="exam-card" data-exam-id={exam.examId}>
                  <div class="exam-head">
                    <strong>{exam.exam.replace(periodOf(exam.exam), "").trim() || exam.exam}</strong>
                    <span class="muted">
                      {exam.questionCount} {t(prefs.lang, "questionUnit")}
                    </span>
                    {status !== "none" && (
                      <span class={`pill pill-${status}`}>
                        {statusLabel(prefs.lang, status)}
                      </span>
                    )}
                  </div>
                  <div class="exam-actions">
                    <button
                      type="button"
                      class="primary"
                      onClick={() => navigate(`/quiz/${exam.examId}/practice`)}
                    >
                      {t(prefs.lang, "practice")}
                    </button>
                    <button
                      type="button"
                      class="secondary"
                      onClick={() => navigate(`/quiz/${exam.examId}/exam`)}
                    >
                      {t(prefs.lang, "exam")}
                    </button>
                    {status === "none" || status === "partial" || status === "update" ? (
                      <button
                        type="button"
                        class="ghost"
                        disabled={Boolean(running)}
                        onClick={() => void download(exam)}
                      >
                        {running
                          ? `${t(prefs.lang, "downloading")} ${running.done}/${running.total}`
                          : status === "update"
                            ? t(prefs.lang, "retry")
                            : t(prefs.lang, "downloadExam")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        class="ghost"
                        onClick={() => setRemoveTarget(exam)}
                      >
                        {t(prefs.lang, "remove")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {removeTarget && (
        <Dialog titleId="remove-title" onClose={() => setRemoveTarget(null)}>
          <h2 id="remove-title">{t(prefs.lang, "remove")}</h2>
          <p>{t(prefs.lang, "deleteConfirm")}</p>
          <div class="dialog-actions">
            <button type="button" class="ghost" onClick={() => setRemoveTarget(null)}>
              {t(prefs.lang, "cancel")}
            </button>
            <button
              type="button"
              class="danger"
              onClick={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target) void removeExam(target).then(refresh);
              }}
            >
              {t(prefs.lang, "confirm")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
