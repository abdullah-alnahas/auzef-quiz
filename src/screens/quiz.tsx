import { useEffect, useMemo, useState } from "preact/hooks";
import { parseScope } from "../combine.ts";
import { Badge, Dialog, RichTextView, TableView } from "../components.tsx";
import {
  EmptyScopeError,
  loadCombinedExam,
  loadExam,
  MissingExamsError,
  OfflineError,
} from "../data.ts";
import {
  changedQuestions,
  correctness,
  goTo,
  isLocked,
  isRevealed,
  newSession,
  score,
  select,
  type SessionState,
} from "../engine.ts";
import { scopeGroupKey, t } from "../i18n.ts";
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
import type { Exam, Mode, Question, ScopeGroup } from "../types.ts";

type Failure =
  | { kind: "offline" }
  | { kind: "missing"; missing: string[] }
  | { kind: "empty" };

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
  const [exam, setExam] = useState<Exam | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showNavigator, setShowNavigator] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailure(null);
    void (async () => {
      try {
        let loaded: Exam;
        if (courseId && scopeGroups && scopeGroups.length > 0) {
          const course = manifest.courses.find((entry) => entry.courseId === courseId);
          if (!course) {
            if (alive) setFailure({ kind: "empty" });
            return;
          }
          loaded = await loadCombinedExam(course, scopeGroups);
        } else if (examId) {
          loaded = await loadExam(examId);
        } else {
          if (alive) setFailure({ kind: "empty" });
          return;
        }
        if (!alive) return;
        setExam(loaded);
        const key = sessionKey(loaded.examId, mode);
        const stored = await getSession(key);
        if (stored && !stored.submitted) {
          setSession(stored);
          if (stored.examHash !== loaded.contentHash) {
            setChanged(changedQuestions(stored, loaded));
          }
        } else {
          setSession(newSession(loaded, mode));
        }
        const marks = await listBookmarks(loaded.examId);
        if (alive) setBookmarks(new Set(marks.map((mark) => mark.number)));
      } catch (error) {
        if (!alive) return;
        if (error instanceof MissingExamsError) {
          setFailure({ kind: "missing", missing: error.missing });
        } else if (error instanceof EmptyScopeError) {
          setFailure({ kind: "empty" });
        } else if (error instanceof OfflineError) {
          setFailure({ kind: "offline" });
        } else {
          setFailure({ kind: "offline" });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId, courseId, scopeGroups, mode, retryKey, manifest]);

  useEffect(() => {
    if (!exam || !session) return;
    updatePref("lastExam", exam.examId);
    updatePref("lastQuestion", exam.questions[session.index]?.number);
    saveSession({
      ...session,
      key: sessionKey(exam.examId, session.mode),
    }).catch(() => setStorageError(true));
  }, [exam, session, updatePref]);

  const current = useMemo(
    () => (exam && session ? exam.questions[session.index] : null),
    [exam, session],
  );

  if (failure) {
    const message =
      failure.kind === "missing"
        ? t(prefs.lang, "missingExams", {
            names: failure.missing.join(prefs.lang === "ar" ? "، " : ", "),
          })
        : failure.kind === "empty"
          ? t(prefs.lang, "emptyScope")
          : t(prefs.lang, "notDownloaded");
    return (
      <div class="stack">
        <p class="notice notice-bad">{message}</p>
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
  if (!exam || !session || !current) {
    return <p class="muted">{t(prefs.lang, "loading")}</p>;
  }

  const total = exam.questions.length;
  const answered = Object.keys(session.answers).length;
  const revealed = isRevealed(session, current.id);
  const correctLetter = current.answer;
  const selected = session.answers[current.id];
  const isBookmarked = bookmarks.has(current.number);

  const choose = (letter: string): void => {
    setSession(select(session, current, letter));
  };

  const toggleBookmark = (): void => {
    const next = !isBookmarked;
    setBookmarks((marks) => {
      const copy = new Set(marks);
      if (next) copy.add(current.number);
      else copy.delete(current.number);
      return copy;
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
    ? parseScope(exam.scope).map((group) => t(prefs.lang, scopeGroupKey(group))).join(" + ")
    : exam.exam;

  const navState = (
    question: Question,
  ): "correct" | "wrong" | "unknown" | "answered" | "unanswered" => {
    const letter = session.answers[question.id];
    if (!letter) return "unanswered";
    if (session.mode === "exam") return "answered";
    const result = correctness(question, letter);
    if (result === true) return "correct";
    if (result === false) return "wrong";
    return "unknown";
  };
  const hasUnknownAnswered = exam.questions.some(
    (question) =>
      Boolean(session.answers[question.id]) && question.answer === null,
  );

  return (
    <div class="quiz">
      <div class="quiz-head">
        <button
          type="button"
          class="ghost"
          onClick={() => navigate(`/course/${exam.courseId}`)}
          aria-label={t(prefs.lang, "back")}
        >
          {prefs.lang === "ar" ? "→" : "←"}
        </button>
        <div class="quiz-title">
          <h1 class="quiz-title-main">{title}</h1>
          <span class="muted">{exam.course}</span>
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
              <li key={name}>{name}</li>
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
          {t(prefs.lang, "fromExam", { name: current.sourceExam })}
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
                <span class="choice-body">
                  <span class="choice-tr" lang="tr" dir="ltr">
                    {choice.turkish.text}
                  </span>
                  {prefs.showArabic && choice.arabic && (
                    <span class="choice-ar" lang="ar" dir="rtl">
                      {choice.arabic.text}
                    </span>
                  )}
                  {choice.turkish.images.map((image) => (
                    <img
                      key={image}
                      class="choice-image"
                      src={new URL(`data/${image}`, document.baseURI).toString()}
                      alt=""
                      loading="lazy"
                    />
                  ))}
                </span>
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
          onClick={() => setSession(goTo(session, session.index - 1, total))}
        >
          {t(prefs.lang, "previous")}
        </button>
        {session.index < total - 1 ? (
          <button
            type="button"
            class="primary"
            onClick={() => setSession(goTo(session, session.index + 1, total))}
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
        <Dialog titleId="nav-title" onClose={() => setShowNavigator(false)}>
          <h2 id="nav-title">{t(prefs.lang, "questionNavigator")}</h2>
          <ul class="navigator">
            {exam.questions.map((question, index) => {
              const state = navState(question);
              const isMarked = bookmarks.has(question.number);
              const label =
                state === "correct"
                  ? t(prefs.lang, "correct")
                  : state === "wrong"
                    ? t(prefs.lang, "incorrect")
                    : state === "unknown"
                      ? t(prefs.lang, "unknownKey")
                      : state === "answered"
                        ? t(prefs.lang, "answered")
                        : t(prefs.lang, "unanswered");
              return (
                <li key={question.id}>
                  <button
                    type="button"
                    class={[
                      "nav-cell",
                      index === session.index ? "current" : "",
                      state === "answered" ? "answered" : `status-${state}`,
                      isMarked ? "marked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={index === session.index ? "true" : undefined}
                    aria-label={`${t(prefs.lang, "question")} ${index + 1}: ${label}`}
                    onClick={() => {
                      setSession(goTo(session, index, total));
                      setShowNavigator(false);
                    }}
                  >
                    {index + 1}
                    {state === "correct" && (
                      <span class="nav-mark" aria-hidden="true">✓</span>
                    )}
                    {state === "wrong" && (
                      <span class="nav-mark" aria-hidden="true">✗</span>
                    )}
                    {state === "unanswered" && (
                      <span class="nav-mark" aria-hidden="true">–</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <ul class="nav-legend">
            {session.mode === "practice" ? (
              <>
                <li><i class="swatch swatch-correct" aria-hidden="true" />{t(prefs.lang, "correct")}</li>
                <li><i class="swatch swatch-wrong" aria-hidden="true" />{t(prefs.lang, "incorrect")}</li>
                <li><i class="swatch swatch-unanswered" aria-hidden="true" />{t(prefs.lang, "unanswered")}</li>
                {hasUnknownAnswered && (
                  <li><i class="swatch swatch-unknown" aria-hidden="true" />{t(prefs.lang, "unknownKey")}</li>
                )}
              </>
            ) : (
              <>
                <li><i class="swatch swatch-answered" aria-hidden="true" />{t(prefs.lang, "answered")}</li>
                <li><i class="swatch swatch-unanswered" aria-hidden="true" />{t(prefs.lang, "unanswered")}</li>
              </>
            )}
          </ul>
          <div class="dialog-actions">
            <button type="button" class="ghost" onClick={() => setShowNavigator(false)}>
              {t(prefs.lang, "cancel")}
            </button>
          </div>
        </Dialog>
      )}

      {confirmSubmit && (
        <Dialog titleId="submit-title" onClose={() => setConfirmSubmit(false)}>
          <h2 id="submit-title">{t(prefs.lang, "submitTitle")}</h2>
          <p>{t(prefs.lang, "submitBody", { n: unanswered })}</p>
          <div class="dialog-actions">
            <button type="button" class="ghost" onClick={() => setConfirmSubmit(false)}>
              {t(prefs.lang, "cancel")}
            </button>
            <button
              type="button"
              class="primary"
              disabled={submitting}
              onClick={() => void finish()}
            >
              {t(prefs.lang, "confirm")}
            </button>
          </div>
        </Dialog>
      )}

      {storageError && (
        <p class="notice notice-bad" role="alert">
          {t(prefs.lang, "storageError")}
        </p>
      )}
    </div>
  );
}
