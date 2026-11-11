import type { AttemptScore } from "./storage.ts";
import type { Exam, Mode, Question } from "./types.ts";

export interface SessionState {
  examId: string;
  courseId: string;
  mode: Mode;
  index: number;
  answers: Record<string, string>;
  revealed: Record<string, true>;
  submitted: boolean;
  examHash: string;
  questionHashes: Record<string, string>;
}

/** Small stable hash; only used to detect changed questions between ingests. */
export function questionHash(question: Question): string {
  const text = JSON.stringify(question);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function newSession(exam: Exam, mode: Mode): SessionState {
  return {
    examId: exam.examId,
    courseId: exam.courseId,
    mode,
    index: 0,
    answers: {},
    revealed: {},
    submitted: false,
    examHash: exam.contentHash,
    questionHashes: Object.fromEntries(
      exam.questions.map((q) => [q.id, questionHash(q)]),
    ),
  };
}

/** Questions whose content changed since the stored session was created. */
export function changedQuestions(session: SessionState, exam: Exam): Set<string> {
  const changed = new Set<string>();
  for (const q of exam.questions) {
    const before = session.questionHashes[q.id];
    if (before && before !== questionHash(q)) changed.add(q.id);
  }
  return changed;
}

export function isLocked(state: SessionState, questionId: string): boolean {
  return state.mode === "practice" && Boolean(state.answers[questionId]);
}

/**
 * Record a choice. Practice locks the question after the first answer; exam
 * mode allows changing it and never reveals correctness before submission.
 */
export function select(
  state: SessionState,
  question: Question,
  letter: string,
): SessionState {
  if (state.submitted || isLocked(state, question.id)) return state;
  const answers = { ...state.answers, [question.id]: letter };
  const revealed =
    state.mode === "practice"
      ? { ...state.revealed, [question.id]: true as const }
      : state.revealed;
  return { ...state, answers, revealed };
}

export function goTo(state: SessionState, index: number, total: number): SessionState {
  const clamped = Math.max(0, Math.min(total - 1, index));
  return { ...state, index: clamped };
}

export function isRevealed(state: SessionState, questionId: string): boolean {
  return Boolean(state.revealed[questionId]);
}

export function correctness(question: Question, letter: string | undefined): boolean | null {
  if (!letter || question.answer === null) return null;
  return question.answer === letter;
}

export function score(exam: Exam, answers: Record<string, string>): AttemptScore {
  let known = 0;
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let unknown = 0;
  for (const q of exam.questions) {
    if (q.answer === null) {
      unknown += 1;
      continue;
    }
    known += 1;
    const letter = answers[q.id];
    if (!letter) unanswered += 1;
    else if (letter === q.answer) correct += 1;
    else incorrect += 1;
  }
  return { known, correct, incorrect, unanswered, unknown };
}

export function percent(scoreValue: AttemptScore): number {
  if (scoreValue.known === 0) return 0;
  return Math.round((scoreValue.correct / scoreValue.known) * 100);
}
