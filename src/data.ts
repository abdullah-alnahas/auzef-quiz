import { combineExams, examsForScope } from "./combine.ts";
import type { AppManifest, CourseSummary, Exam, Scope } from "./types.ts";

export class OfflineError extends Error {}

export class EmptyScopeError extends Error {}

export class MissingExamsError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`missing exams: ${missing.join(", ")}`);
    this.missing = missing;
  }
}

export function dataUrl(path: string): string {
  return new URL(`data/${path}`, document.baseURI).toString();
}

export async function loadManifest(): Promise<AppManifest> {
  try {
    const response = await fetch(dataUrl("manifest.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as AppManifest;
  } catch {
    throw new OfflineError("manifest unavailable");
  }
}

export async function loadExam(examId: string): Promise<Exam> {
  try {
    const response = await fetch(dataUrl(`exams/${examId}.json`), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Exam;
  } catch {
    throw new OfflineError("exam unavailable");
  }
}

/**
 * Build a course-level session from all exams in a scope. Every source exam is
 * required: silently dropping an undownloaded exam would make the score wrong.
 */
export async function loadCombinedExam(
  course: CourseSummary,
  scope: Scope,
): Promise<Exam> {
  const summaries = examsForScope(course, scope);
  if (summaries.length === 0) throw new EmptyScopeError("no exams in scope");
  const settled = await Promise.allSettled(
    summaries.map((summary) => loadExam(summary.examId)),
  );
  const exams: Exam[] = [];
  const missing: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") exams.push(result.value);
    else missing.push(summaries[index].exam);
  });
  if (missing.length) throw new MissingExamsError(missing);
  return combineExams(course, scope, exams);
}
