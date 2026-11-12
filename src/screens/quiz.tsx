import { useEffect, useState } from "preact/hooks";
import { parseScope } from "../combine.ts";
import {
  Badge,
  ChoiceContent,
  ConfirmDialog,
  DataValue,
  RichTextView,
  TableView,
} from "../components.tsx";
import {
  EmptyScopeError,
  loadCombinedExam,
  loadExam,
  MissingExamsError,
} from "../data.ts";
import {
  changedQuestions,
  goTo,
  isLocked,
  isRevealed,
  newSession,
  score,
  select,
} from "../engine.ts";
import { backArrow, scopeTitle, t } from "../i18n.ts";
import type { ScreenProps } from "../props.ts";
import {
  deleteSession,
  getSession,
  listBookmarks,
  saveAttempt,
  saveSession,
  sessionKey,
  setBookmark,
} from "../storage.ts";
import type { Exam, Mode, ScopeGroup, SessionState } from "../types.ts";
import { QuizNavigator } from "./quiz-navigator.tsx";

type Failure =
  | { kind: "offline" }
  | { kind: "missing"; missing: string[] }
  | { kind: "empty" };

type Loaded = {
  exam: Exam;
  session: SessionState;
  bookmarks: Set<number>;
  changed: Set<string>;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "failed"; failure: Failure }
  | { kind: "ready"; data: Loaded };

type QuizProps = ScreenProps & {
  mode: Mode;
  examId?: string;
  courseId?: string;
  scopeGroups?: ScopeGroup[];
};

export function Quiz({
  examId,
  courseId,
  scopeGroups,
  mode,
  prefs,
  updatePref,
  navigate,
  manifest,
}: QuizProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [showNavigator, setShowNavigator] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const ready = state.kind === "ready" ? state.data : null;

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    void (async () => {
      try {
        let loaded: Exam;
        if (courseId && scopeGroups && scopeGroups.length > 0) {
          const course = manifest.courses.find((entry) => entry.courseId === courseId);
          if (!course) {
            if (alive) setState({ kind: "failed", failure: { kind: "empty" } });
            return;
          }
          loaded = await loadCombinedExam(course, scopeGroups);
        } else if (examId) {
          loaded = await loadExam(examId);
        } else {
          if (alive) setState({ kind: "failed", failure: { kind: "empty" } });
          return;
        }
        const stored = await getSession(sessionKey(loaded.examId, mode));
        const resumed = stored && !stored.submitted ? stored : null;
        const session = resumed ?? newSession(loaded, mode);
        const changed =
          resumed && resumed.examHash !== loaded.contentHash
            ? changedQuestions(resumed, loaded)
            : new Set<string>();
        const marks = await listBookmarks(loaded.examId);
        if (alive) {
          setState({
            kind: "ready",
            data: {
              exam: loaded,
              session,
              changed,
              bookmarks: new Set(marks.map((mark) => mark.number)),
            },
          });
        }
      } catch (error) {
        if (!alive) return;
        const failure: Failure =
          error instanceof MissingExamsError
            ? { kind: "missing", missing: error.missing }
            : error instanceof EmptyScopeError
              ? { kind: "empty" }
              : { kind: "offline" };
        setState({ kind: "failed", failure });
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId, courseId, scopeGroups, mode, retryKey, manifest]);

  useEffect(() => {
    if (!ready) return;
    const { exam, session } = ready;
    updatePref("lastExam", exam.examId);
    updatePref("lastQuestion", exam.questions[session.index]?.number);
    saveSession({
      ...session,
      key: sessionKey(exam.examId, session.mode),
    }).catch(() => setStorageError(true));
  }, [ready?.exam, ready?.session, updatePref]);

  if (state.kind === "failed") {
    const { failure } = state;
    const separator = prefs.lang === "ar" ? "، " : ", ";
    return (
      <div class="stack">
        {failure.kind === "missing" ? (
          <p class="notice notice-bad">
            <DataValue
              template={t(prefs.lang, "missingExams", { names: "\u0000" })}
              value={failure.missing.join(separator)}
              lang="tr"
            />
          </p>
        ) : (
          <p class="notice notice-bad">
            {t(prefs.lang, failure.kind === "empty" ? "emptyScope" : "notDownloaded")}
          </p>
        )}
        <div class="row-actions">
          <button type="button" class="primary" onClick={() => setRetryKey((n) => n + 1)}>
            {t(prefs.lang, "retry")}
          </button>
          <button
            type="button"
            class="secondary"
            onClick={() => navigate(courseId ? `/course/${courseId}` : "/")}
          >
            {t(prefs.lang, "back")}
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === "loading") {
    return <p class="muted">{t(prefs.lang, "loading")}</p>;
  }
  const { exam, session, bookmarks, changed } = state.data;
  const current = exam.questions[session.index];
  if (!current) {
    return <p class="muted">{t(prefs.lang, "loading")}</p>;
  }

  const updateSession = (next: SessionState): void => {
    setState((currentState) =>
      currentState.kind === "ready"
        ? { ...currentState, data: { ...currentState.data, session: next } }
        : currentState,
    );
  };

  const total = exam.questions.length;
  const answered = Object.keys(session.answers).length;
  const revealed = isRevealed(session, current.id);
  const correctLetter = current.answer;
  const selected = session.answers[current.id];
  const isBookmarked = bookmarks.has(current.number);

  const choose = (letter: string): void => {
    updateSession(select(session, current, letter));
  };

  const toggleBookmark = (): void => {
    const next = !isBookmarked;
    setState((currentState) => {
      if (currentState.kind !== "ready") return currentState;
      const marks = new Set(currentState.data.bookmarks);
      if (next) marks.add(current.number);
      else marks.delete(current.number);
      return { ...currentState, data: { ...currentState.data, bookmarks: marks } };
    });
    setBookmark(exam.examId, current.number, next).catch(() => setStorageError(true));
  };

  const finish = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    const result = score(exam, session.answers);
    try {
      const id = await saveAttempt({
        examId: exam.examId,
        courseId: exam.courseId,
        mode: session.mode,
        createdAt: Date.now(),
        answers: session.answers,
        examHash: exam.contentHash,
        score: result,
        scope: exam.scope,
        sourceExamIds: exam.sourceExamIds,
      });
      await deleteSession(sessionKey(exam.examId, session.mode));
      navigate(`/results/${id}`);
    } catch {
      setStorageError(true);
      setSubmitting(false);
    }
  };

  const unanswered = exam.questions.filter((q) => !session.answers[q.id]).length;
  const title = exam.scope
    ? scopeTitle(prefs.lang, parseScope(exam.scope))
    : exam.exam;

  return (
    <div class="quiz">
      <div class="quiz-head">
        <button
          type="button"
          class="ghost"
          onClick={() => navigate(`/course/${exam.courseId}`)}
          aria-label={t(prefs.lang, "back")}
        >
          {backArrow(prefs.lang)}
        </button>
        <div class="quiz-title">
          <h1 class="quiz-title-main">
            <bdi lang={exam.scope ? undefined : "tr"}>{title}</bdi>
          </h1>
          <span class="muted"><bdi lang="tr">{exam.course}</bdi></span>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-pressed={isBookmarked}
          aria-label={t(prefs.lang, isBookmarked ? "unbookmark" : "bookmark")}
          onClick={toggleBookmark}
        >
          {isBookmarked ? "★" : "☆"}
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label={t(prefs.lang, "questionNavigator")}
          onClick={() => setShowNavigator(true)}
        >
          ▦
        </button>
      </div>

      <div class="quiz-progress" aria-hidden="true">
        <span style={{ inlineSize: `${((session.index + 1) / total) * 100}%` }} />
      </div>
      <div class="quiz-meta">
        <span>
          {session.index + 1} {t(prefs.lang, "of")} {total}
        </span>
        <span class="muted">
          {t(prefs.lang, "answeredCount", { a: answered, n: total })}
        </span>
        <button
          type="button"
          class="ghost small"
          onClick={() => updatePref("showArabic", !prefs.showArabic)}
        >
          {t(prefs.lang, prefs.showArabic ? "hideArabic" : "showArabic")}
        </button>
      </div>

      {exam.scope && exam.sourceExams && (
        <details class="combined-source">
          <summary>
            {t(prefs.lang, "combinedFrom", { n: exam.sourceExams.length })}
          </summary>
          <ul>
            {exam.sourceExams.map((name) => (
              <li key={name}><bdi lang="tr">{name}</bdi></li>
            ))}
          </ul>
        </details>
      )}

      {changed.has(current.id) && (
        <p class="notice notice-warn">
          <Badge tone="warn">{t(prefs.lang, "changed")}</Badge>{" "}
          {t(prefs.lang, "contentUpdated")}
        </p>
      )}

      {exam.scope && current.sourceExam && (
        <p class="muted small">
          <DataValue
            template={t(prefs.lang, "fromExam", { name: "\u0000" })}
            value={current.sourceExam}
            lang="tr"
          />
        </p>
      )}

      <article class="question" aria-labelledby="question-text">
        <div class="question-flags">
          {current.review.length > 0 && (
            <Badge tone="warn">{t(prefs.lang, "translationReview")}</Badge>
          )}
          {current.answerUnknown && (
            <Badge tone="neutral">{t(prefs.lang, "unknownKey")}</Badge>
          )}
        </div>
        <RichTextView
          className="question-tr"
          id="question-text"
          content={current.turkish}
          lang="tr"
          dir="ltr"
        />
        {prefs.showArabic && current.arabic && (
          <RichTextView
            className="question-ar"
            content={current.arabic}
            lang="ar"
            dir="rtl"
          />
        )}
        {current.tables.map((rows, index) => (
          <TableView key={index} rows={rows} />
        ))}
      </article>

      <ul class="choices" aria-labelledby="question-text">
        {current.choices.map((choice) => {
          const isSelected = selected === choice.letter;
          const isCorrect = revealed && correctLetter === choice.letter;
          const isWrong = revealed && isSelected && correctLetter !== choice.letter;
          const locked = isLocked(session, current.id);
          const classes = [
            "choice",
            isSelected ? "selected" : "",
            isCorrect ? "correct" : "",
            isWrong ? "wrong" : "",
            locked ? "locked" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={choice.letter}>
              <button
                type="button"
                class={classes}
                aria-pressed={isSelected}
                aria-disabled={locked}
                onClick={() => {
                  if (!locked) choose(choice.letter);
                }}
              >
                <span class="choice-letter">{choice.letter}</span>
                <ChoiceContent choice={choice} showArabic={prefs.showArabic} />
              </button>
            </li>
          );
        })}
      </ul>

      <div class="feedback" role="status" aria-live="polite">
        {revealed && current.answerUnknown && (
          <p class="notice">{t(prefs.lang, "answerUnavailable")}</p>
        )}
        {revealed && !current.answerUnknown && selected && (
          <p class={selected === correctLetter ? "feedback-ok" : "feedback-bad"}>
            {selected === correctLetter
              ? t(prefs.lang, "correct")
              : (
                  <>
                    {t(prefs.lang, "incorrect")} —{" "}
                    <bdi dir="ltr">
                      {correctLetter}){" "}
                      {current.choices.find((c) => c.letter === correctLetter)?.turkish.text ?? ""}
                    </bdi>
                  </>
                )}
          </p>
        )}
      </div>

      {!revealed && (
        <p class="muted small">
          {t(prefs.lang, session.mode === "exam" ? "examHint" : "practiceHint")}
        </p>
      )}

      <div class="quiz-actions">
        <button
          type="button"
          class="secondary"
          disabled={session.index === 0}
          onClick={() => updateSession(goTo(session, session.index - 1, total))}
        >
          {t(prefs.lang, "previous")}
        </button>
        {session.index < total - 1 ? (
          <button
            type="button"
            class="primary"
            onClick={() => updateSession(goTo(session, session.index + 1, total))}
          >
            {t(prefs.lang, "next")}
          </button>
        ) : session.mode === "exam" ? (
          <button type="button" class="primary" onClick={() => setConfirmSubmit(true)}>
            {t(prefs.lang, "submit")}
          </button>
        ) : (
          <button
            type="button"
            class="primary"
            disabled={answered === 0 || submitting}
            onClick={() => void finish()}
          >
            {t(prefs.lang, "finish")}
          </button>
        )}
      </div>
      {session.mode === "exam" && session.index < total - 1 && (
        <button type="button" class="ghost" onClick={() => setConfirmSubmit(true)}>
          {t(prefs.lang, "submit")}
        </button>
      )}
      {session.mode === "practice" && session.index < total - 1 && answered > 0 && (
        <button
          type="button"
          class="ghost"
          disabled={submitting}
          onClick={() => void finish()}
        >
          {t(prefs.lang, "finish")}
        </button>
      )}

      {showNavigator && (
        <QuizNavigator
          lang={prefs.lang}
          exam={exam}
          session={session}
          bookmarks={bookmarks}
          onSelect={(index) => updateSession(goTo(session, index, total))}
          onClose={() => setShowNavigator(false)}
        />
      )}

      {confirmSubmit && (
        <ConfirmDialog
          titleId="submit-title"
          title={t(prefs.lang, "submitTitle")}
          body={t(prefs.lang, "submitBody", { n: unanswered })}
          cancelLabel={t(prefs.lang, "cancel")}
          confirmLabel={t(prefs.lang, "confirm")}
          tone="primary"
          busy={submitting}
          onClose={() => setConfirmSubmit(false)}
          onConfirm={() => void finish()}
        />
      )}

      {storageError && (
        <p class="notice notice-bad" role="alert">
          {t(prefs.lang, "storageError")}
        </p>
      )}
    </div>
  );
}
