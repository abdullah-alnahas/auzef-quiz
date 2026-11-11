import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadExam, examStatus, removeExam } from "./downloads.ts";
import type { Exam, ExamSummary } from "./types.ts";

class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(request: string | { url: string }): Promise<Response | undefined> {
    const url = typeof request === "string" ? request : request.url;
    return this.entries.get(url);
  }

  async put(request: string | { url: string }, response: Response): Promise<void> {
    const url = typeof request === "string" ? request : request.url;
    this.entries.set(url, response);
  }

  async delete(request: string | { url: string }): Promise<boolean> {
    const url = typeof request === "string" ? request : request.url;
    return this.entries.delete(url);
  }
}

const summary: ExamSummary = {
  examId: "c__e",
  courseId: "c",
  course: "C",
  exam: "E",
  questionCount: 1,
  contentHash: "hash-1",
  reviewFlags: 0,
};

const exam: Exam = {
  courseId: "c",
  examId: "c__e",
  course: "C",
  exam: "E",
  sourceUrl: "u",
  scrapedAt: "t",
  questionCount: 1,
  contentHash: "hash-1",
  questions: [],
  assets: ["assets/a.png", "assets/b.png"],
};

const BASE = "http://localhost/";

let cache: FakeCache;
let failAsset: string | null;

beforeEach(() => {
  cache = new FakeCache();
  failAsset = null;
  vi.stubGlobal("document", { baseURI: BASE });
  vi.stubGlobal("caches", {
    open: async () => cache,
  });
  vi.stubGlobal("fetch", async (input: string) => {
    const url = String(input);
    if (url.endsWith("exams/c__e.json")) {
      return new Response(JSON.stringify(exam), { status: 200 });
    }
    if (failAsset && url.endsWith(failAsset)) {
      throw new Error("network down");
    }
    return new Response("png", { status: 200 });
  });
});

describe("download state", () => {
  it("is none before a download", async () => {
    expect(await examStatus(summary)).toBe("none");
  });

  it("is partial when an asset failed, then complete on retry", async () => {
    failAsset = "assets/b.png";
    await expect(downloadExam(summary)).rejects.toThrow(/asset failed/);
    expect(await examStatus(summary)).toBe("partial");

    failAsset = null;
    await downloadExam(summary);
    expect(await examStatus(summary)).toBe("complete");
  });

  it("resumes without refetching already cached files", async () => {
    await downloadExam(summary);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("exams/c__e.json")) {
        return new Response(JSON.stringify(exam), { status: 200 });
      }
      return new Response("png", { status: 200 });
    });
    await downloadExam(summary);
    expect(calls.filter((url) => url.endsWith("assets/a.png"))).toHaveLength(0);
  });

  it("reports an update when the manifest hash changed", async () => {
    await downloadExam(summary);
    expect(await examStatus({ ...summary, contentHash: "hash-2" })).toBe("update");
  });

  it("removes the exam and its assets", async () => {
    await downloadExam(summary);
    await removeExam(summary);
    expect(await examStatus(summary)).toBe("none");
    expect(cache.entries.size).toBe(0);
  });

  it("reports progress for each cached file", async () => {
    const progress: number[] = [];
    await downloadExam(summary, (value) => progress.push(value.done));
    expect(progress).toEqual([0, 1, 2]);
  });
});
