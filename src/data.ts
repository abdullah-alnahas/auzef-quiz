import type { AppManifest, Exam } from "./types.ts";

export class OfflineError extends Error {}

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
