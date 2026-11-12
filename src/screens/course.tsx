import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_SCOPE_GROUPS,
  examsForScope,
  SCOPE_GROUPS,
  scopeCode,
} from "../combine.ts";
import { ConfirmDialog } from "../components.tsx";
import { backArrow, scopeGroupKey, t, type Key, type Lang } from "../i18n.ts";
import type { ScreenProps } from "../props.ts";
import {
  courseStatus,
  downloadExam,
  removeExam,
  type DownloadState,
  type Progress,
} from "../downloads.ts";
import type { ExamSummary, ScopeGroup } from "../types.ts";

function periodOf(exam: string): string {
  const match = /^(\d{4}(?:-\d{4})?)/.exec(exam);
  return match ? match[1] : "—";
}

const STATUS_LABEL_KEYS: Record<DownloadState, Key | null> = {
  none: null,
  complete: "downloaded",
  partial: "incompleteDownload",
  update: "updateAvailable",
};

function statusLabel(lang: Lang, status: DownloadState): string {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(lang, key) : "";
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
  const [selectedGroups, setSelectedGroups] = useState<ScopeGroup[]>(DEFAULT_SCOPE_GROUPS);

  const refresh = async (): Promise<void> => {
    if (!course) return;
    try {
      setStatuses(await courseStatus(course.exams));
    } catch {
      // Cache storage unavailable: keep the current labels instead of crashing.
    }
  };

  useEffect(() => {
    void refresh();
  }, [courseId]);

  if (!course) {
    return <p class="notice">{t(prefs.lang, "error")}</p>;
  }

  const scoped = examsForScope(course, selectedGroups);
  const scopedQuestions = scoped.reduce((n, exam) => n + exam.questionCount, 0);

  const groups = new Map<string, ExamSummary[]>();
  for (const exam of course.exams) {
    const key =
      exam.type === "unite" ? t(prefs.lang, "unitBadge") : periodOf(exam.exam);
    groups.set(key, [...(groups.get(key) ?? []), exam]);
  }

  /** Returns false when this exam failed, so a bulk run can report it. */
  const download = async (exam: ExamSummary): Promise<boolean> => {
    setError(false);
    // Mark the row as in flight before the first await so the button reacts
    // immediately and cannot be triggered twice.
    setProgress((current) => ({ ...current, [exam.examId]: { done: 0, total: 0 } }));
    try {
      await downloadExam(exam, (value) =>
        setProgress((current) => ({ ...current, [exam.examId]: value })),
      );
      return true;
    } catch {
      setError(true);
      return false;
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
    setError(false);
    let failed = false;
    try {
      for (const exam of course.exams) {
        if ((await courseStatus([exam]))[exam.examId] === "complete") continue;
        failed = !(await download(exam)) || failed;
      }
    } catch {
      failed = true;
    }
    setError(failed);
    setBusy(false);
  };

  const inFlight = Object.entries(progress)
    .map(([examId, value]) => ({
      exam: course.exams.find((entry) => entry.examId === examId),
      value,
    }))
    .filter((entry) => entry.exam);

  return (
    <div class="stack">
      <button type="button" class="ghost back" onClick={() => navigate("/")}>
        {backArrow(prefs.lang)} {t(prefs.lang, "back")}
      </button>
      <h1><bdi lang="tr">{course.course}</bdi></h1>
      <div class="row-actions">
        <button type="button" class="secondary" disabled={busy} onClick={() => void downloadAll()}>
          {t(prefs.lang, "downloadCourse")}
        </button>
      </div>
      {error && <p class="notice notice-bad">{t(prefs.lang, "downloadFailed")}</p>}
      <p class="visually-hidden" role="status" aria-live="polite">
        {inFlight.length > 0 && (
          <>
            {t(prefs.lang, "downloading")}{" "}
            <bdi lang="tr">{inFlight[0].exam!.exam}</bdi>
            {inFlight[0].value.total
              ? ` ${inFlight[0].value.done}/${inFlight[0].value.total}`
              : ""}
          </>
        )}
      </p>

      <section class="test-all" aria-labelledby="test-all-title">
        <h2 id="test-all-title">{t(prefs.lang, "testAll")}</h2>
        <p class="muted small">{t(prefs.lang, "testAllHint")}</p>
        <div class="scope-tabs" role="group" aria-label={t(prefs.lang, "testAll")}>
          {SCOPE_GROUPS.map((group) => {
            const active = selectedGroups.includes(group);
            return (
              <button
                key={group}
                type="button"
                class={active ? "primary" : "secondary"}
                aria-pressed={active}
                onClick={() =>
                  setSelectedGroups((current) =>
                    current.includes(group)
                      ? current.filter((item) => item !== group)
                      : [...current, group],
                  )
                }
              >
                {t(prefs.lang, scopeGroupKey(group))}
              </button>
            );
          })}
        </div>
        <p class="muted small">
          {scoped.length} {t(prefs.lang, "examUnit")} · {scopedQuestions}{" "}
          {t(prefs.lang, "questionUnit")}
        </p>
        <details class="combined-list">
          <summary>
            {t(prefs.lang, "includedExams")} ({scoped.length})
          </summary>
          <ul>
            {scoped.map((exam) => (
              <li key={exam.examId}><bdi lang="tr">{exam.exam}</bdi></li>
            ))}
          </ul>
        </details>
        <div class="row-actions">
          <button
            type="button"
            class="primary"
            disabled={scoped.length === 0}
            onClick={() => navigate(`/combined/${course.courseId}/${scopeCode(selectedGroups)}/practice`)}
          >
            {t(prefs.lang, "practice")}
          </button>
          <button
            type="button"
            class="secondary"
            disabled={scoped.length === 0}
            onClick={() => navigate(`/combined/${course.courseId}/${scopeCode(selectedGroups)}/exam`)}
          >
            {t(prefs.lang, "exam")}
          </button>
        </div>
      </section>

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
                    <strong>
                      <bdi lang="tr">
                        {exam.exam.replace(periodOf(exam.exam), "").trim() || exam.exam}
                      </bdi>
                    </strong>
                    <span class="muted">
                      {exam.questionCount} {t(prefs.lang, "questionUnit")}
                    </span>
                    {exam.mock && (
                      <span class="pill pill-mock">{t(prefs.lang, "mockBadge")}</span>
                    )}
                    {exam.type === "unite" && (
                      <span class="pill pill-mock">{t(prefs.lang, "unitBadge")}</span>
                    )}
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
                          ? running.total
                            ? `${t(prefs.lang, "downloading")} ${running.done}/${running.total}`
                            : t(prefs.lang, "downloading")
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
        <ConfirmDialog
          titleId="remove-title"
          title={t(prefs.lang, "remove")}
          body={t(prefs.lang, "deleteConfirm")}
          cancelLabel={t(prefs.lang, "cancel")}
          confirmLabel={t(prefs.lang, "confirm")}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => {
            const target = removeTarget;
            setRemoveTarget(null);
            if (target) void removeExam(target).then(refresh);
          }}
        />
      )}
    </div>
  );
}
