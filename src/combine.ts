import { fnv1a, questionHash } from "./engine.ts";
import type {
  CourseSummary,
  Exam,
  ExamSummary,
  Question,
  ScopeGroup,
} from "./types.ts";

/**
 * Course-level groups. "Final" deliberately includes bütünleme, and the
 * corresponding "final-deneme" group includes bütünleme denemeleri.
 */
export const SCOPE_GROUPS: ScopeGroup[] = [
  "vize",
  "vize-deneme",
  "final",
  "final-deneme",
  "unit",
];

export const DEFAULT_SCOPE_GROUPS: ScopeGroup[] = ["vize", "final"];

const GROUP_SET = new Set<string>(SCOPE_GROUPS);

function isScopeGroup(value: string): value is ScopeGroup {
  return GROUP_SET.has(value);
}

/** Which group a manifest exam belongs to, or null when it is out of scope. */
export function groupOf(exam: ExamSummary): ScopeGroup | null {
  if (exam.type === "unite") return "unit";
  if (exam.type === "vize") return exam.mock ? "vize-deneme" : "vize";
  if (exam.type === "final" || exam.type === "butunleme") {
    return exam.mock ? "final-deneme" : "final";
  }
  return null;
}

/** Parse a persisted/route scope code into a canonical, de-duplicated list. */
export function parseScope(code: string): ScopeGroup[] {
  if (!code) return [];
  // Legacy codes from the first release.
  if (code === "all") return ["vize", "final"];
  if (code === "vize" || code === "final") return [code];
  const requested = new Set(code.split("+").filter(isScopeGroup));
  return SCOPE_GROUPS.filter((group) => requested.has(group));
}

export function scopeCode(groups: ScopeGroup[]): string {
  const selected = new Set(groups);
  return SCOPE_GROUPS.filter((group) => selected.has(group)).join("+");
}

export function combinedExamId(courseId: string, groups: ScopeGroup[]): string {
  return `${courseId}__combined-${scopeCode(groups).replaceAll("+", "_")}`;
}

/** Exams in the selected groups, in the same term order the course uses. */
export function examsForScope(
  course: CourseSummary,
  groups: ScopeGroup[],
): ExamSummary[] {
  const selected = new Set(groups);
  return course.exams
    .filter((exam) => {
      const group = groupOf(exam);
      return group !== null && selected.has(group);
    })
    .sort((a, b) => a.exam.localeCompare(b.exam, "tr"));
}

function combinedHash(questions: Question[]): string {
  const text = questions
    .map((question) => `${question.id}:${questionHash(question)}`)
    .join("");
  return `combined-${fnv1a(text)}-${questions.length}`;
}

/**
 * Concatenate exam questions into one session. Source question ids stay
 * untouched (answers/bookmarks remain unique); only the display number is
 * renumbered 1..N.
 */
export function combineExams(
  course: CourseSummary,
  groups: ScopeGroup[],
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
    examId: combinedExamId(course.courseId, groups),
    course: course.course,
    exam: course.course,
    sourceUrl: "",
    scrapedAt: "",
    questionCount: questions.length,
    contentHash: combinedHash(questions),
    questions,
    assets: [...new Set(sources.flatMap((source) => source.assets))].sort(),
    scope: scopeCode(groups),
    sourceExamIds: sources.map((source) => source.examId),
    sourceExams: sources.map((source) => source.exam),
  };
}
