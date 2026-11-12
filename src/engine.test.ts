import { describe, expect, it } from "vitest";
import {
  changedQuestions,
  correctness,
  fnv1a,
  goTo,
  isLocked,
  isRevealed,
  navigatorState,
  newSession,
  percent,
  questionHash,
  score,
  select,
} from "./engine.ts";
import type { Exam, Question } from "./types.ts";

function question(n: number, answer: string | null, stem = `Soru ${n}`): Question {
  return {
    id: `e:${n}`,
    number: n,
    turkish: { text: stem, images: [] },
    arabic: { text: `سؤال ${n}`, images: [] },
    choices: ["A", "B", "C", "D"].map((letter) => ({
      letter,
      turkish: { text: `seçenek ${letter}`, images: [] },
      arabic: { text: `خيار ${letter}`, images: [] },
    })),
    answer,
    answerUnknown: answer === null,
    review: [],
    tables: [],
  };
}

function exam(): Exam {
  return {
    courseId: "c",
    examId: "e",
    course: "C",
    exam: "E",
    sourceUrl: "u",
    scrapedAt: "t",
    questionCount: 3,
    contentHash: "hash-1",
    questions: [question(1, "A"), question(2, "B"), question(3, null)],
    assets: [],
  };
}

describe("select", () => {
  it("reveals and locks in practice mode", () => {
    const e = exam();
    let state = newSession(e, "practice");
    state = select(state, e.questions[0], "B");
    expect(state.answers["e:1"]).toBe("B");
    expect(isRevealed(state, "e:1")).toBe(true);
    expect(isLocked(state, "e:1")).toBe(true);

    const again = select(state, e.questions[0], "C");
    expect(again.answers["e:1"]).toBe("B");
  });

  it("allows changing answers in exam mode without revealing", () => {
    const e = exam();
    let state = newSession(e, "exam");
    state = select(state, e.questions[0], "B");
    state = select(state, e.questions[0], "C");
    expect(state.answers["e:1"]).toBe("C");
    expect(isRevealed(state, "e:1")).toBe(false);
  });

  it("refuses changes after submission", () => {
    const e = exam();
    const state = { ...newSession(e, "exam"), submitted: true };
    expect(select(state, e.questions[0], "A")).toBe(state);
  });
});

describe("correctness", () => {
  it("is null for no answer or an unknown key", () => {
    expect(correctness(question(1, "A"), undefined)).toBeNull();
    expect(correctness(question(1, null), "A")).toBeNull();
  });
  it("compares the selected letter", () => {
    expect(correctness(question(1, "A"), "A")).toBe(true);
    expect(correctness(question(1, "A"), "B")).toBe(false);
  });
});

describe("score", () => {
  it("counts known keys only and separates every bucket", () => {
    const e = exam();
    const result = score(e, { "e:1": "A", "e:2": "C" });
    expect(result).toEqual({
      known: 2,
      correct: 1,
      incorrect: 1,
      unanswered: 0,
      unknown: 1,
    });
  });

  it("counts unanswered known questions", () => {
    const result = score(exam(), {});
    expect(result.unanswered).toBe(2);
    expect(result.correct).toBe(0);
  });

  it("never counts an unknown key as correct", () => {
    const result = score(exam(), { "e:3": "A" });
    expect(result.correct).toBe(0);
    expect(result.unknown).toBe(1);
    expect(result.known).toBe(2);
  });

  it("percent uses the known denominator", () => {
    expect(percent({ known: 4, correct: 2, incorrect: 1, unanswered: 1, unknown: 3 })).toBe(50);
    expect(percent({ known: 0, correct: 0, incorrect: 0, unanswered: 0, unknown: 2 })).toBe(0);
  });
});

describe("navigatorState", () => {
  it("marks an unanswered question", () => {
    const e = exam();
    expect(navigatorState(newSession(e, "practice"), e.questions[0])).toBe(
      "unanswered",
    );
  });

  it("paints correctness in practice mode, including unknown keys", () => {
    const e = exam();
    const state = {
      ...newSession(e, "practice"),
      answers: { "e:1": "A", "e:2": "C", "e:3": "B" },
    };
    expect(navigatorState(state, e.questions[0])).toBe("correct");
    expect(navigatorState(state, e.questions[1])).toBe("wrong");
    expect(navigatorState(state, e.questions[2])).toBe("unknown");
  });

  it("only distinguishes answered from unanswered in exam mode", () => {
    const e = exam();
    const state = {
      ...newSession(e, "exam"),
      answers: { "e:1": "B" },
    };
    expect(navigatorState(state, e.questions[0])).toBe("answered");
    expect(navigatorState(state, e.questions[1])).toBe("unanswered");
  });
});

describe("navigation and change detection", () => {
  it("clamps the index", () => {
    const state = newSession(exam(), "practice");
    expect(goTo(state, -3, 3).index).toBe(0);
    expect(goTo(state, 9, 3).index).toBe(2);
  });

  it("detects questions whose content changed", () => {
    const e = exam();
    const state = newSession(e, "practice");
    const updated = {
      ...e,
      questions: [
        { ...e.questions[0], turkish: { text: "yeni", images: [] } },
      ],
    };
    expect(changedQuestions(state, updated).has("e:1")).toBe(true);
    expect(changedQuestions(state, e).size).toBe(0);
  });

  it("hashes question content deterministically", () => {
    expect(questionHash(question(1, "A"))).toBe(questionHash(question(1, "A")));
    expect(questionHash(question(1, "A"))).not.toBe(questionHash(question(1, "B")));
  });

  it("uses the standard FNV-1a 32-bit vector", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
  });
});
