import { describe, expect, it } from "vitest";
import {
  combineExams,
  combinedExamId,
  examsForScope,
  isScope,
} from "./combine.ts";
import type { CourseSummary, Exam, ExamSummary, Question } from "./types.ts";

function summary(examId: string, exam: string, type: ExamSummary["type"]): ExamSummary {
  return {
    examId,
    courseId: "c",
    course: "Course",
    exam,
    type,
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
    summary("f1", "2024-2025 Final Soruları", "final"),
    summary("b1", "2024-2025 Bütünleme Soruları", "butunleme"),
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

describe("scope selection", () => {
  it("vize is vize only", () => {
    expect(examsForScope(course, "vize").map((e) => e.examId)).toEqual(["v1"]);
  });

  it("final includes final and bütünleme", () => {
    expect(examsForScope(course, "final").map((e) => e.examId)).toEqual(["b1", "f1"]);
  });

  it("all includes vize, final and bütünleme but not yaz okulu", () => {
    expect(examsForScope(course, "all").map((e) => e.examId)).toEqual([
      "b1",
      "f1",
      "v1",
    ]);
  });

  it("validates scope strings from the route", () => {
    expect(isScope("final")).toBe(true);
    expect(isScope("midterm")).toBe(false);
  });
});

describe("combineExams", () => {
  const sources = [exam("v1", "Vize", 2), exam("f1", "Final", 1)];

  it("keeps source ids, renumbers display order and records the source exam", () => {
    const combined = combineExams(course, "all", sources);
    expect(combined.examId).toBe(combinedExamId("c", "all"));
    expect(combined.scope).toBe("all");
    expect(combined.questionCount).toBe(3);
    expect(combined.questions.map((q) => q.id)).toEqual([
      "v1:1",
      "v1:2",
      "f1:1",
    ]);
    expect(combined.questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(combined.questions.map((q) => q.sourceExam)).toEqual([
      "Vize",
      "Vize",
      "Final",
    ]);
    expect(combined.sourceExamIds).toEqual(["v1", "f1"]);
  });

  it("unions assets", () => {
    const combined = combineExams(course, "all", sources);
    expect(combined.assets).toEqual(["assets/f1.png", "assets/v1.png"]);
  });

  it("has a stable hash and changes when a question changes", () => {
    const first = combineExams(course, "all", sources);
    const again = combineExams(course, "all", sources);
    expect(first.contentHash).toBe(again.contentHash);

    const changed = [exam("v1", "Vize", 2), exam("f1", "Final", 1)];
    changed[0].questions[0] = {
      ...changed[0].questions[0],
      turkish: { text: "değişti", images: [] },
    };
    expect(combineExams(course, "all", changed).contentHash).not.toBe(
      first.contentHash,
    );
  });
});
