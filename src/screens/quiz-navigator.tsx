import { Dialog } from "../components.tsx";
import { navigatorState, type NavigatorState } from "../engine.ts";
import { t, type Key, type Lang } from "../i18n.ts";
import type { Exam, SessionState } from "../types.ts";

const NAV_LABEL_KEYS: Record<NavigatorState, Key> = {
  correct: "correct",
  wrong: "incorrect",
  unknown: "unknownKey",
  answered: "answered",
  unanswered: "unanswered",
};

/** Question map: every cell shows state with a colour and a ✓/✗/– mark. */
export function QuizNavigator({
  lang,
  exam,
  session,
  bookmarks,
  onSelect,
  onClose,
}: {
  lang: Lang;
  exam: Exam;
  session: SessionState;
  bookmarks: Set<number>;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const hasUnknownAnswered = exam.questions.some(
    (question) => Boolean(session.answers[question.id]) && question.answer === null,
  );

  return (
    <Dialog titleId="nav-title" onClose={onClose}>
      <h2 id="nav-title">{t(lang, "questionNavigator")}</h2>
      <ul class="navigator">
        {exam.questions.map((question, index) => {
          const state = navigatorState(session, question);
          const isMarked = bookmarks.has(question.number);
          const label = t(lang, NAV_LABEL_KEYS[state]);
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
                aria-label={`${t(lang, "question")} ${index + 1}: ${label}`}
                onClick={() => {
                  onSelect(index);
                  onClose();
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
            <li><i class="swatch swatch-correct" aria-hidden="true" />{t(lang, "correct")}</li>
            <li><i class="swatch swatch-wrong" aria-hidden="true" />{t(lang, "incorrect")}</li>
            <li><i class="swatch swatch-unanswered" aria-hidden="true" />{t(lang, "unanswered")}</li>
            {hasUnknownAnswered && (
              <li><i class="swatch swatch-unknown" aria-hidden="true" />{t(lang, "unknownKey")}</li>
            )}
          </>
        ) : (
          <>
            <li><i class="swatch swatch-answered" aria-hidden="true" />{t(lang, "answered")}</li>
            <li><i class="swatch swatch-unanswered" aria-hidden="true" />{t(lang, "unanswered")}</li>
          </>
        )}
      </ul>
      <div class="dialog-actions">
        <button type="button" class="ghost" onClick={onClose}>
          {t(lang, "cancel")}
        </button>
      </div>
    </Dialog>
  );
}
