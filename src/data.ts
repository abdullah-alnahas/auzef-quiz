import { combineExams, examsForScope } from "./combine.ts";
import type { AppManifest, CourseSummary, Exam, ScopeGroup } from "./types.ts";

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

/** Fetch one app-data file; any failure (network, HTTP, JSON) is offline. */
async function fetchJson<T>(path: string, message: string): Promise<T> {
  try {
    const response = await fetch(dataUrl(path), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    throw new OfflineError(message);
  }
}

export function loadManifest(): Promise<AppManifest> {
  return fetchJson("manifest.json", "manifest unavailable");
}

export function loadExam(examId: string): Promise<Exam> {
  return fetchJson(`exams/${examId}.json`, "exam unavailable");
}

/**
 * Build a course-level session from all exams in a scope. Every source exam is
 * required: silently dropping an undownloaded exam would make the score wrong.
 */
export async function loadCombinedExam(
  course: CourseSummary,
  groups: ScopeGroup[],
): Promise<Exam> {
  const summaries = examsForScope(course, groups);
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
  return combineExams(course, groups, exams);
}
