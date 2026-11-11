import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  deleteSession,
  getSession,
  listAttempts,
  listBookmarks,
  loadPrefs,
  resetProgress,
  saveAttempt,
  saveSession,
  setBookmark,
  setPref,
  type StoredSession,
} from "./storage.ts";

function session(key: string): StoredSession {
  return {
    key,
    examId: "exam",
    courseId: "course",
    mode: "practice",
    index: 0,
    answers: {},
    revealed: {},
    submitted: false,
    examHash: "h",
    questionHashes: {},
    updatedAt: 0,
  };
}

beforeEach(async () => {
  await resetProgress();
  for (const [key, value] of Object.entries(DEFAULT_PREFS)) {
    await setPref(key as keyof typeof DEFAULT_PREFS, value as never);
  }
});

describe("preferences", () => {
  it("returns defaults when nothing is stored", async () => {
    const prefs = await loadPrefs();
    expect(prefs.lang).toBe("ar");
    expect(prefs.showArabic).toBe(true);
    expect(prefs.theme).toBe("system");
  });

  it("persists a preference and merges it over defaults", async () => {
    await setPref("lang", "tr");
    await setPref("showArabic", false);
    const prefs = await loadPrefs();
    expect(prefs.lang).toBe("tr");
    expect(prefs.showArabic).toBe(false);
    expect(prefs.theme).toBe("system");
  });
});

describe("sessions", () => {
  it("saves, reads and deletes a session", async () => {
    await saveSession(session("exam:practice"));
    const stored = await getSession("exam:practice");
    expect(stored?.examId).toBe("exam");
    expect(stored?.updatedAt).toBeGreaterThan(0);
    await deleteSession("exam:practice");
    expect(await getSession("exam:practice")).toBeUndefined();
  });
});

describe("bookmarks and attempts", () => {
  it("adds and removes bookmarks per exam", async () => {
    await setBookmark("a", 1, true);
    await setBookmark("a", 2, true);
    await setBookmark("b", 1, true);
    expect((await listBookmarks("a")).map((b) => b.number)).toEqual([1, 2]);
    await setBookmark("a", 1, false);
    expect((await listBookmarks("a")).map((b) => b.number)).toEqual([2]);
  });

  it("stores attempts and keeps them sorted newest first", async () => {
    const base = {
      examId: "e",
      courseId: "c",
      mode: "practice" as const,
      answers: {},
      examHash: "h",
      score: { known: 1, correct: 1, incorrect: 0, unanswered: 0, unknown: 0 },
    };
    const first = await saveAttempt({ ...base, createdAt: 1 });
    await saveAttempt({ ...base, createdAt: 2 });
    const all = await listAttempts("e");
    expect(all).toHaveLength(2);
    expect(all[0].createdAt).toBe(2);
    expect(all.some((attempt) => attempt.id === first)).toBe(true);
  });
});

describe("reset", () => {
  it("clears progress but keeps preferences", async () => {
    await setPref("lang", "tr");
    await saveSession(session("e:practice"));
    await setBookmark("e", 1, true);
    await saveAttempt({
      examId: "e",
      courseId: "c",
      mode: "exam",
      createdAt: 1,
      answers: {},
      examHash: "h",
      score: { known: 0, correct: 0, incorrect: 0, unanswered: 0, unknown: 1 },
    });

    await resetProgress();

    expect(await getSession("e:practice")).toBeUndefined();
    expect(await listBookmarks()).toEqual([]);
    expect(await listAttempts()).toEqual([]);
    expect((await loadPrefs()).lang).toBe("tr");
  });
});
