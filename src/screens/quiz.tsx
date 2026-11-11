import { useEffect, useMemo, useState } from "preact/hooks";
import { Badge, RichTextView, TableView } from "../components.tsx";
import { loadExam, OfflineError } from "../data.ts";
import {
  changedQuestions,
  goTo,
  isLocked,
  isRevealed,
  newSession,
  score,
  select,
  type SessionState,
} from "../engine.ts";
import { t } from "../i18n.ts";
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
import type { Exam, Mode } from "../types.ts";

export function Quiz({
  examId,
  mode,
  prefs,
  updatePref,
  navigate,
}: ScreenProps & { examId: string; mode: Mode }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void (async () => {
      try {
        const loaded = await loadExam(examId);
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
        if (alive) setFailed(error instanceof OfflineError);
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId, mode, retryKey]);

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

  if (failed) {
    return (
      <div class="stack">
        <p class="notice notice-bad">{t(prefs.lang, "notDownloaded")}</p>
        <button type="button" class="primary" onClick={() => setRetryKey((n) => n + 1)}>
          {t(prefs.lang, "retry")}
        </button>
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
      });
      await deleteSession(sessionKey(exam.examId, session.mode));
      navigate(`/results/${id}`);
    } catch {
      setStorageError(true);
      setSubmitting(false);
    }
  };

  const unanswered = exam.questions.filter((q) => !session.answers[q.id]).length;

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
          <h1 class="quiz-title-main">{exam.exam}</h1>
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

      {changed.has(current.id) && (
        <p class="notice notice-warn">
          <Badge tone="warn">{t(prefs.lang, "changed")}</Badge>{" "}
          {t(prefs.lang, "contentUpdated")}
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

      {showNavigator && (
        <dialog open class="dialog" aria-modal="true" aria-labelledby="nav-title">
          <h2 id="nav-title">{t(prefs.lang, "questionNavigator")}</h2>
          <ul class="navigator">
            {exam.questions.map((question, index) => {
              const isAnswered = Boolean(session.answers[question.id]);
              const isMarked = bookmarks.has(question.number);
              return (
                <li key={question.id}>
                  <button
                    type="button"
                    class={[
                      "nav-cell",
                      index === session.index ? "current" : "",
                      isAnswered ? "answered" : "",
                      isMarked ? "marked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={index === session.index ? "true" : undefined}
                    onClick={() => {
                      setSession(goTo(session, index, total));
                      setShowNavigator(false);
                    }}
                  >
                    {index + 1}
                  </button>
                </li>
              );
            })}
          </ul>
          <div class="dialog-actions">
            <button type="button" class="ghost" onClick={() => setShowNavigator(false)}>
              {t(prefs.lang, "cancel")}
            </button>
          </div>
        </dialog>
      )}

      {confirmSubmit && (
        <dialog open class="dialog" aria-modal="true" aria-labelledby="submit-title">
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
        </dialog>
      )}

      {storageError && (
        <p class="notice notice-bad" role="alert">
          {t(prefs.lang, "storageError")}
        </p>
      )}
    </div>
  );
}
