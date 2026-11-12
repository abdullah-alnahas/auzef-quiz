import { describe, expect, it } from "vitest";
import { parseRoute } from "./route.ts";

describe("parseRoute", () => {
  it("maps the empty hash to home", () => {
    expect(parseRoute("")).toEqual({ kind: "home" });
    expect(parseRoute("#/")).toEqual({ kind: "home" });
  });

  it("reads a course id", () => {
    expect(parseRoute("#/course/anatomi")).toEqual({
      kind: "course",
      courseId: "anatomi",
    });
  });

  it("defaults quiz mode to practice and accepts exam", () => {
    expect(parseRoute("#/quiz/c__e")).toEqual({
      kind: "quiz",
      examId: "c__e",
      mode: "practice",
    });
    expect(parseRoute("#/quiz/c__e/exam")).toEqual({
      kind: "quiz",
      examId: "c__e",
      mode: "exam",
    });
  });

  it("canonicalises combined scope groups and reads the mode", () => {
    expect(parseRoute("#/combined/c/final+vize/exam")).toEqual({
      kind: "combined",
      courseId: "c",
      groups: ["vize", "final"],
      mode: "exam",
    });
    expect(parseRoute("#/combined/c/all")).toEqual({
      kind: "combined",
      courseId: "c",
      groups: ["vize", "final"],
      mode: "practice",
    });
  });

  it("rejects a combined route with no valid scope", () => {
    expect(parseRoute("#/combined/c/bogus/practice")).toEqual({ kind: "unknown" });
    expect(parseRoute("#/combined/c")).toEqual({ kind: "unknown" });
  });

  it("reads a numeric attempt id and rejects the rest", () => {
    expect(parseRoute("#/results/42")).toEqual({ kind: "results", attemptId: 42 });
    expect(parseRoute("#/results/abc")).toEqual({ kind: "unknown" });
    expect(parseRoute("#/results/")).toEqual({ kind: "unknown" });
  });

  it("maps anything else to the error screen", () => {
    expect(parseRoute("#/nope/x")).toEqual({ kind: "unknown" });
  });
});
