import { dataUrl } from "./data.ts";
import type { Exam, ExamSummary } from "./types.ts";

const CACHE = "content-v1";

export type DownloadState = "none" | "partial" | "complete" | "update";

export class DownloadError extends Error {}

function examUrl(examId: string): string {
  return dataUrl(`exams/${examId}.json`);
}

function assetUrl(asset: string): string {
  return dataUrl(asset);
}

async function openCache(): Promise<Cache> {
  return caches.open(CACHE);
}

async function cachedJson(examId: string): Promise<Exam | null> {
  const cache = await openCache();
  const hit = await cache.match(examUrl(examId));
  if (!hit) return null;
  try {
    return (await hit.json()) as Exam;
  } catch {
    return null;
  }
}

export async function examStatus(summary: ExamSummary): Promise<DownloadState> {
  const cached = await cachedJson(summary.examId);
  if (!cached) return "none";
  if (cached.contentHash !== summary.contentHash) return "update";
  const cache = await openCache();
  for (const asset of cached.assets) {
    if (!(await cache.match(assetUrl(asset)))) return "partial";
  }
  return "complete";
}

export interface Progress {
  done: number;
  total: number;
}

/**
 * Fetch and cache one exam plus its assets. Already-cached files are skipped,
 * so an interrupted download resumes where it stopped. A failed asset leaves
 * the exam "partial", never "downloaded".
 */
export async function downloadExam(
  summary: ExamSummary,
  onProgress?: (progress: Progress) => void,
): Promise<void> {
  let cache: Cache;
  try {
    cache = await openCache();
  } catch {
    throw new DownloadError("cache unavailable");
  }
  const url = examUrl(summary.examId);
  let exam: Exam;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    exam = (await response.json()) as Exam;
    await cache.put(url, new Response(JSON.stringify(exam), {
      headers: { "Content-Type": "application/json" },
    }));
  } catch {
    throw new DownloadError("exam fetch failed");
  }

  const total = exam.assets.length;
  let done = 0;
  onProgress?.({ done, total });
  for (const asset of exam.assets) {
    const assetHref = assetUrl(asset);
    if (!(await cache.match(assetHref))) {
      try {
        const response = await fetch(assetHref, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(assetHref, response);
      } catch {
        throw new DownloadError(`asset failed: ${asset}`);
      }
    }
    done += 1;
    onProgress?.({ done, total });
  }
}

export async function removeExam(summary: ExamSummary): Promise<void> {
  const cache = await openCache();
  const cached = await cachedJson(summary.examId);
  await cache.delete(examUrl(summary.examId));
  for (const asset of cached?.assets ?? []) {
    await cache.delete(assetUrl(asset));
  }
}

export async function courseStatus(
  exams: ExamSummary[],
): Promise<Record<string, DownloadState>> {
  const entries = await Promise.all(
    exams.map(async (exam) => [exam.examId, await examStatus(exam)] as const),
  );
  return Object.fromEntries(entries);
}

/** Remove every downloaded exam and asset (user data is untouched). */
export async function clearDownloads(): Promise<void> {
  await caches.delete(CACHE);
}
