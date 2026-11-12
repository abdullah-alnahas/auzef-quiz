import { describe, expect, it } from "vitest";
import {
  combineExams,
  combinedExamId,
  examsForScope,
  groupOf,
  parseScope,
  scopeCode,
} from "./combine.ts";
import type { CourseSummary, Exam, ExamSummary, Question } from "./types.ts";

function summary(
  examId: string,
  exam: string,
  type: ExamSummary["type"],
  mock = false,
): ExamSummary {
  return {
    examId,
    courseId: "c",
    course: "Course",
    exam,
    type,
    mock,
    questionCount: 1,
    contentHash: `h-${examId}`,
    reviewFlags: 0,
  };
}

const course: CourseSummary = {
  courseId: "c",
  course: "Course",
  exams: [
    summary("v1", "2024-2025 Vize Soruları", "vize"),
    summary("vd1", "2024-2025 Vize Deneme", "vize", true),
    summary("f1", "2024-2025 Final Soruları", "final"),
    summary("b1", "2024-2025 Bütünleme Soruları", "butunleme"),
    summary("fd1", "2024-2025 Final Deneme", "final", true),
    summary("fdb1", "2024-2025 Bütünleme Deneme", "butunleme", true),
    summary("u1", "Ünite-1", "unite"),
    summary("um1", "Ünite-1 Deneme", "unite", true),
    summary("y1", "2023 Yaz Okulu Soruları", "yaz-okulu"),
  ],
};

function question(examId: string, number: number, stem: string): Question {
  return {
    id: `${examId}:${number}`,
    number,
    turkish: { text: stem, images: [] },
    arabic: null,
    choices: ["A", "B", "C", "D"].map((letter) => ({
      letter,
      turkish: { text: `option ${letter}`, images: [] },
      arabic: null,
    })),
    answer: "A",
    answerUnknown: false,
    review: [],
    tables: [],
  };
}

function exam(examId: string, examName: string, count: number): Exam {
  return {
    courseId: "c",
    examId,
    course: "Course",
    exam: examName,
    sourceUrl: "",
    scrapedAt: "",
    questionCount: count,
    contentHash: `hash-${examId}`,
    questions: Array.from({ length: count }, (_, i) =>
      question(examId, i + 1, `${examName} q${i + 1}`),
    ),
    assets: [`assets/${examId}.png`],
  };
}

describe("scope groups", () => {
  it("maps each exam to exactly one group", () => {
    expect(groupOf(course.exams[0])).toBe("vize");
    expect(groupOf(course.exams[1])).toBe("vize-deneme");
    expect(groupOf(course.exams[2])).toBe("final");
    expect(groupOf(course.exams[3])).toBe("final");
    expect(groupOf(course.exams[4])).toBe("final-deneme");
    expect(groupOf(course.exams[5])).toBe("final-deneme");
    expect(groupOf(course.exams[6])).toBe("unit");
    expect(groupOf(course.exams[7])).toBe("unit");
    expect(groupOf(course.exams[8])).toBeNull();
  });

  it("vize and final groups keep bütünleme with final", () => {
    expect(examsForScope(course, ["vize"]).map((e) => e.examId)).toEqual(["v1"]);
    expect(examsForScope(course, ["final"]).map((e) => e.examId)).toEqual([
      "b1",
      "f1",
    ]);
  });

  it("deneme groups are separate from real groups", () => {
    expect(examsForScope(course, ["vize-deneme"]).map((e) => e.examId)).toEqual([
      "vd1",
    ]);
    expect(
      examsForScope(course, ["final-deneme"]).map((e) => e.examId).sort(),
    ).toEqual(["fd1", "fdb1"].sort());
  });

  it("unit groups include unit denemeleri", () => {
    expect(examsForScope(course, ["unit"]).map((e) => e.examId)).toEqual([
      "u1",
      "um1",
    ]);
  });

  it("any combination of groups is allowed", () => {
    expect(
      examsForScope(course, ["vize", "vize-deneme", "final", "final-deneme"])
        .map((e) => e.examId)
        .sort(),
    ).toEqual(["b1", "f1", "fd1", "fdb1", "v1", "vd1"].sort());
  });

  it("parses legacy and new scope codes canonically", () => {
    expect(parseScope("all")).toEqual(["vize", "final"]);
    expect(parseScope("vize")).toEqual(["vize"]);
    expect(parseScope("final+vize")).toEqual(["vize", "final"]);
    expect(parseScope("vize+bogus+unit")).toEqual(["vize", "unit"]);
    expect(parseScope("")).toEqual([]);
    expect(scopeCode(["final", "vize"])).toBe("vize+final");
    expect(scopeCode([])).toBe("");
  });
});

describe("combineExams", () => {
  const sources = [exam("v1", "Vize", 2), exam("f1", "Final", 1)];

  it("keeps source ids, renumbers display order and records the source exam", () => {
    const combined = combineExams(course, ["vize", "final"], sources);
    expect(combined.examId).toBe(combinedExamId("c", ["vize", "final"]));
    expect(combined.scope).toBe("vize+final");
    expect(combined.questionCount).toBe(3);
    expect(combined.questions.map((q) => q.id)).toEqual(["v1:1", "v1:2", "f1:1"]);
    expect(combined.questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(combined.questions.map((q) => q.sourceExam)).toEqual([
      "Vize",
      "Vize",
      "Final",
    ]);
    expect(combined.sourceExamIds).toEqual(["v1", "f1"]);
    expect(combined.sourceExams).toEqual(["Vize", "Final"]);
  });

  it("unions assets", () => {
    const combined = combineExams(course, ["vize", "final"], sources);
    expect(combined.assets).toEqual(["assets/f1.png", "assets/v1.png"]);
  });

  it("has a stable hash and changes when a question changes", () => {
    const first = combineExams(course, ["vize", "final"], sources);
    const again = combineExams(course, ["vize", "final"], sources);
    expect(first.contentHash).toBe(again.contentHash);

    const changed = [exam("v1", "Vize", 2), exam("f1", "Final", 1)];
    changed[0].questions[0] = {
      ...changed[0].questions[0],
      turkish: { text: "değişti", images: [] },
    };
    expect(combineExams(course, ["vize", "final"], changed).contentHash).not.toBe(
      first.contentHash,
    );
  });
});
