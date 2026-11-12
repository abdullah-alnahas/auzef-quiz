import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dataUrl,
  loadExam,
  loadManifest,
  OfflineError,
} from "./data.ts";

const BASE = "http://localhost/app/";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("document", { baseURI: BASE });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dataUrl", () => {
  it("resolves against the document base, not the origin root", () => {
    expect(dataUrl("manifest.json")).toBe(`${BASE}data/manifest.json`);
    expect(dataUrl("exams/c__e.json")).toBe(`${BASE}data/exams/c__e.json`);
  });
});

describe("loadManifest", () => {
  it("returns the parsed manifest and bypasses the HTTP cache", async () => {
    const manifest = { generatedAt: "now", courses: [] };
    const fetchMock = vi.fn(async () => jsonResponse(manifest));
    vi.stubGlobal("fetch", fetchMock);

    expect(await loadManifest()).toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}data/manifest.json`, {
      cache: "no-cache",
    });
  });

  it("maps an HTTP error to OfflineError", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({}, 503));
    await expect(loadManifest()).rejects.toBeInstanceOf(OfflineError);
  });

  it("maps a network failure to OfflineError", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(loadManifest()).rejects.toThrow("manifest unavailable");
  });

  it("maps invalid JSON to OfflineError", async () => {
    vi.stubGlobal("fetch", async () => new Response("not json", { status: 200 }));
    await expect(loadManifest()).rejects.toBeInstanceOf(OfflineError);
  });
});

describe("loadExam", () => {
  it("requests the exam JSON by id", async () => {
    const exam = { examId: "c__e", questions: [] };
    const fetchMock = vi.fn(async () => jsonResponse(exam));
    vi.stubGlobal("fetch", fetchMock);

    expect(await loadExam("c__e")).toEqual(exam);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}data/exams/c__e.json`, {
      cache: "no-cache",
    });
  });

  it("uses the exam-specific offline message", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({}, 404));
    await expect(loadExam("c__e")).rejects.toThrow("exam unavailable");
  });
});
