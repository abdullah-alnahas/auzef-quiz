import { questionHash } from "./engine.ts";
import type {
  CourseSummary,
  Exam,
  ExamSummary,
  ExamType,
  Question,
  Scope,
} from "./types.ts";

/** "Final" deliberately includes bütünleme, per the product decision. */
export const SCOPE_TYPES: Record<Scope, ExamType[]> = {
  vize: ["vize"],
  final: ["final", "butunleme"],
  all: ["vize", "final", "butunleme"],
};

export function isScope(value: string): value is Scope {
  return value === "vize" || value === "final" || value === "all";
}

export function combinedExamId(courseId: string, scope: Scope): string {
  return `${courseId}__combined-${scope}`;
}

/** Exams in a scope, in the same term order the course screen uses. */
export function examsForScope(
  course: CourseSummary,
  scope: Scope,
): ExamSummary[] {
  const types = SCOPE_TYPES[scope];
  return course.exams
    .filter((exam) => types.includes(exam.type))
    .sort((a, b) => a.exam.localeCompare(b.exam, "tr"));
}

function combinedHash(questions: Question[]): string {
  let hash = 2166136261;
  for (const question of questions) {
    const text = `${question.id}:${questionHash(question)}`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `combined-${(hash >>> 0).toString(16)}-${questions.length}`;
}

/**
 * Concatenate exam questions into one session. Source question ids stay
 * untouched (answers/bookmarks remain unique); only the display number is
 * renumbered 1..N.
 */
export function combineExams(
  course: CourseSummary,
  scope: Scope,
  sources: Exam[],
): Exam {
  const questions: Question[] = [];
  for (const source of sources) {
    for (const question of source.questions) {
      questions.push({
        ...question,
        number: questions.length + 1,
        sourceExam: source.exam,
      });
    }
  }
  return {
    courseId: course.courseId,
    examId: combinedExamId(course.courseId, scope),
    course: course.course,
    exam: course.course,
    sourceUrl: "",
    scrapedAt: "",
    questionCount: questions.length,
    contentHash: combinedHash(questions),
    questions,
    assets: [...new Set(sources.flatMap((source) => source.assets))].sort(),
    scope,
    sourceExamIds: sources.map((source) => source.examId),
  };
}
