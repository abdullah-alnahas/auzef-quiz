import { useEffect, useState } from "preact/hooks";
import { Badge, RichTextView } from "../components.tsx";
import { parseScope, scopeCode } from "../combine.ts";
import { loadCombinedExam, loadExam } from "../data.ts";
import { percent, score } from "../engine.ts";
import { scopeGroupKey, t } from "../i18n.ts";
import type { ScreenProps } from "../props.ts";
import {
  deleteSession,
  getAttempt,
  listBookmarks,
  sessionKey,
  type Attempt,
} from "../storage.ts";
import type { Exam } from "../types.ts";

type Filter = "all" | "incorrect" | "unanswered" | "bookmarked";

export function Results({
  attemptId,
  prefs,
  navigate,
  manifest,
}: ScreenProps & { attemptId: number }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await getAttempt(attemptId);
      if (!stored) {
        setFailed(true);
        return;
      }
      setAttempt(stored);
      try {
        let loaded: Exam;
        if (stored.scope) {
          const course = manifest.courses.find(
            (entry) => entry.courseId === stored.courseId,
          );
          if (!course) {
            setFailed(true);
            return;
          }
          loaded = await loadCombinedExam(course, parseScope(stored.scope));
        } else {
          loaded = await loadExam(stored.examId);
        }
        setExam(loaded);
      } catch {
        setFailed(true);
        return;
      }
      const marks = await listBookmarks(stored.examId);
      setBookmarks(new Set(marks.map((mark) => mark.number)));
    })();
  }, [attemptId, manifest]);

  if (failed) return <p class="notice">{t(prefs.lang, "error")}</p>;
  if (!attempt || !exam) return <p class="muted">{t(prefs.lang, "loading")}</p>;

  const result = score(exam, attempt.answers);
  const shown = exam.questions.filter((question) => {
    const chosen = attempt.answers[question.id];
    if (filter === "incorrect") {
      return Boolean(chosen) && question.answer !== null && chosen !== question.answer;
    }
    if (filter === "unanswered") return !chosen;
    if (filter === "bookmarked") return bookmarks.has(question.number);
    return true;
  });

  return (
    <div class="stack">
      <button
        type="button"
        class="ghost back"
        onClick={() => navigate(`/course/${exam.courseId}`)}
      >
        ← {t(prefs.lang, "back")}
      </button>
      <h1>{t(prefs.lang, "results")}</h1>
      <p class="muted">
        {exam.scope ? (
          <>
            <bdi lang="tr">{exam.course}</bdi> —{" "}
            {parseScope(exam.scope).map((group) => t(prefs.lang, scopeGroupKey(group))).join(" + ")}
          </>
        ) : (
          <bdi lang="tr">{exam.exam}</bdi>
        )}
      </p>

      <section class="score-card" aria-label={t(prefs.lang, "score")}>
        <div class="score-main">
          <strong>{percent(result)}%</strong>
          <span class="muted">{t(prefs.lang, "scoreNote")}</span>
        </div>
        <ul class="score-grid">
          <li>
            <span class="score-num">{result.correct}</span>
            <span>{t(prefs.lang, "correct")}</span>
          </li>
          <li>
            <span class="score-num">{result.incorrect}</span>
            <span>{t(prefs.lang, "incorrect")}</span>
          </li>
          <li>
            <span class="score-num">{result.unanswered}</span>
            <span>{t(prefs.lang, "unanswered")}</span>
          </li>
          <li>
            <span class="score-num">{result.unknown}</span>
            <span>{t(prefs.lang, "unknownKey")}</span>
          </li>
        </ul>
      </section>

      <div class="filters" role="group" aria-label={t(prefs.lang, "results")}>
        {(["all", "incorrect", "unanswered", "bookmarked"] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            class={filter === value ? "primary" : "secondary"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(
              prefs.lang,
              value === "all"
                ? "reviewAll"
                : value === "incorrect"
                  ? "reviewIncorrect"
                  : value === "unanswered"
                    ? "reviewUnanswered"
                    : "reviewBookmarked",
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        class="primary"
        onClick={() => {
          void deleteSession(sessionKey(exam.examId, attempt.mode)).finally(() =>
            navigate(
              exam.scope
                ? `/combined/${exam.courseId}/${scopeCode(parseScope(exam.scope))}/${attempt.mode}`
                : `/quiz/${exam.examId}/${attempt.mode}`,
            ),
          );
        }}
      >
        {t(prefs.lang, "tryAgain")}
      </button>

      <ol class="review-list">
        {shown.map((question) => {
          const chosen = attempt.answers[question.id];
          const correct = question.answer;
          return (
            <li key={question.id} class="review-item">
              <div class="review-head">
                <strong>
                  {t(prefs.lang, "question")} {question.number}
                </strong>
                {question.answer === null ? (
                  <Badge tone="neutral">{t(prefs.lang, "unknownKey")}</Badge>
                ) : chosen === correct ? (
                  <Badge tone="ok">{t(prefs.lang, "correct")}</Badge>
                ) : chosen ? (
                  <Badge tone="bad">{t(prefs.lang, "incorrect")}</Badge>
                ) : (
                  <Badge tone="warn">{t(prefs.lang, "unanswered")}</Badge>
                )}
              </div>
              {question.sourceExam && (
                <p class="muted small"><bdi lang="tr">{question.sourceExam}</bdi></p>
              )}
              <RichTextView
                className="review-tr"
                content={question.turkish}
                lang="tr"
                dir="ltr"
              />
              {prefs.showArabic && question.arabic && (
                <RichTextView
                  className="review-ar"
                  content={question.arabic}
                  lang="ar"
                  dir="rtl"
                />
              )}
              <ol class="review-choices">
                {question.choices.map((choice) => {
                  const isChosen = chosen === choice.letter;
                  const isCorrect = correct === choice.letter;
                  const isWrong = isChosen && correct !== null && chosen !== correct;
                  return (
                    <li
                      key={choice.letter}
                      class={[
                        "review-choice",
                        isChosen ? "chosen" : "",
                        isCorrect ? "correct" : "",
                        isWrong ? "wrong" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
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
                      </span>
                      {isChosen && (
                        <span class="review-tag">{t(prefs.lang, "yourAnswer")}</span>
                      )}
                      {isCorrect && (
                        <span class="review-tag review-tag-ok">
                          {t(prefs.lang, "correctAnswer")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
