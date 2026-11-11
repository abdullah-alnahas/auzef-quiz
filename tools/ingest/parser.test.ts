import { describe, expect, it } from "vitest";
import { parseExamMarkdown, ParseError, slugifyId, splitBilingual } from "./parser.ts";

const ids = { courseId: "course", examId: "course__exam" };

function front(count = 1): string {
  return [
    "---",
    "course: ANNE BABA EĞİTİMİ",
    "exam: 2024-2025 Final Soruları",
    "source_url: https://lolonolo.com/x/",
    `question_count: ${count}`,
    "scraped_at: 2026-01-01T00:00:00+03:00",
    "---",
    "",
  ].join("\n");
}

function q1(): string {
  return [
    "### Q1",
    "**Question:** Birinci soru? | السؤال الأول؟",
    "**Choices:**",
    "- A) bir — واحد",
    "- B) iki — اثنان",
    "- C) üç — ثلاثة",
    "- D) dört — أربعة",
    "**Answer:** B",
    "",
  ].join("\n");
}

describe("parseExamMarkdown", () => {
  it("parses metadata, questions, choices and answer", () => {
    const { exam, warnings } = parseExamMarkdown(front() + q1(), "x.md", ids);
    expect(warnings).toEqual([]);
    expect(exam.course).toBe("ANNE BABA EĞİTİMİ");
    expect(exam.sourceUrl).toBe("https://lolonolo.com/x/");
    expect(exam.questions).toHaveLength(1);
    const q = exam.questions[0];
    expect(q.id).toBe("course__exam:1");
    expect(q.turkish.text).toBe("Birinci soru?");
    expect(q.arabic?.text).toBe("السؤال الأول؟");
    expect(q.choices.map((c) => c.letter)).toEqual(["A", "B", "C", "D"]);
    expect(q.choices[1].arabic?.text).toBe("اثنان");
    expect(q.answer).toBe("B");
    expect(exam.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts escaped structural markers and escaped <br>", () => {
    const md = [
      "\\---",
      "course: K",
      "exam: E",
      "source_url: https://x/",
      "question_count: 1",
      "scraped_at: t",
      "\\---",
      "",
      "\\### Q1",
      "**Question:** bir\\<br>iki? | سؤال\\<br>ثان؟",
      "**Choices:**",
      "\\- A) a — أ",
      "\\- B) b — ب",
      "\\- C) c — ج",
      "\\- D) d — د",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].turkish.text).toBe("bir\niki?");
    expect(exam.questions[0].arabic?.text).toBe("سؤال\nثان؟");
    expect(exam.questions[0].choices).toHaveLength(4);
  });

  it("keeps pipes that are not the bilingual separator", () => {
    const md = front() + [
      "### Q1",
      "**Question:** a | b nedir? | ما هو أ | ب؟",
      "**Choices:**",
      "- A) bir — واحد",
      "- B) iki — اثنان",
      "- C) üç — ثلاثة",
      "- D) dört — أربعة",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].turkish.text).toBe("a | b nedir?");
    expect(exam.questions[0].arabic?.text).toBe("ما هو أ | ب؟");
  });

  it("keeps em dashes that are not the choice separator", () => {
    const md = front() + [
      "### Q1",
      "**Question:** Soru? | سؤال؟",
      "**Choices:**",
      "- A) bir — iki — واحد",
      "- B) iki — اثنان",
      "- C) üç — ثلاثة",
      "- D) dört — أربعة",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].choices[0].turkish.text).toBe("bir — iki");
    expect(exam.questions[0].choices[0].arabic?.text).toBe("واحد");
  });

  it("yields arabic null when the translation is missing", () => {
    const md = front() + [
      "### Q1",
      "**Question:** Yalnız Türkçe?",
      "**Choices:**",
      "- A) bir",
      "- B) iki",
      "- C) üç",
      "- D) dört",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].arabic).toBeNull();
    expect(exam.questions[0].choices[0].arabic).toBeNull();
  });

  it("preserves REVIEW comments per question", () => {
    const md = front() + [
      "### Q1",
      "**Question:** Soru? | سؤال؟",
      "**Choices:**",
      "- A) bir — واحد",
      "- B) iki — اثنان",
      "- C) üç — ثلاثة",
      "- D) dört — أربعة",
      "<!-- REVIEW: q1.stem: reason -->",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].review).toEqual(["q1.stem: reason"]);
  });

  it("extracts images and tables", () => {
    const md = front() + [
      "### Q1",
      "**Question:** Şekle bakınız [IMAGE](assets/q1.png) | انظر [IMAGE](assets/q1-ar.png)",
      "**Choices:**",
      "- A) bir [IMAGE](assets/a.png) — واحد",
      "- B) iki — اثنان",
      "- C) üç — ثلاثة",
      "- D) dört — أربعة",
      "",
      "[TABLE]",
      "```",
      "| x | y |",
      "|---|---|",
      "| 1 | 2 |",
      "```",
      "**Answer:** A",
    ].join("\n");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    const q = exam.questions[0];
    expect(q.turkish.images).toEqual(["assets/q1.png"]);
    expect(q.arabic?.images).toEqual(["assets/q1-ar.png"]);
    expect(q.choices[0].turkish.images).toEqual(["assets/a.png"]);
    expect(q.tables).toEqual([[["x", "y"], ["1", "2"]]]);
    expect(exam.assets).toEqual(["assets/a.png", "assets/q1-ar.png", "assets/q1.png"]);
  });

  it("rejects unsafe asset paths", () => {
    for (const bad of ["../x.png", "/etc/passwd", "https://x/y.png", "assets/../../x"]) {
      const md = front() + q1().replace("— واحد", `— واحد [IMAGE](${bad})`);
      expect(() => parseExamMarkdown(md, "x.md", ids)).toThrow(ParseError);
    }
  });

  it("supports UNKNOWN answers", () => {
    const md = front() + q1().replace("**Answer:** B", "**Answer:** UNKNOWN");
    const { exam } = parseExamMarkdown(md, "x.md", ids);
    expect(exam.questions[0].answer).toBeNull();
    expect(exam.questions[0].answerUnknown).toBe(true);
  });

  it("fails on an answer that is not a choice", () => {
    const md = front() + q1().replace("**Answer:** B", "**Answer:** E");
    expect(() => parseExamMarkdown(md, "x.md", ids)).toThrow(/Q1: answer E/);
  });

  it("fails on non-sequential choice letters", () => {
    const md = front() + q1().replace("- C) üç", "- E) üç");
    expect(() => parseExamMarkdown(md, "x.md", ids)).toThrow(/not sequential/);
  });

  it("fails on duplicate question numbers", () => {
    const md = front(2) + q1() + q1();
    expect(() => parseExamMarkdown(md, "x.md", ids)).toThrow(/duplicate question/);
  });

  it("warns when the declared count is wrong", () => {
    const { warnings } = parseExamMarkdown(front(9) + q1(), "x.md", ids);
    expect(warnings.join("\n")).toMatch(/question_count 9 != parsed 1/);
  });

  it("fails without front matter", () => {
    expect(() => parseExamMarkdown(q1(), "x.md", ids)).toThrow(/front matter/);
  });
});

describe("splitBilingual", () => {
  it("skips separators whose right side is not Arabic", () => {
    expect(splitBilingual("a | b | ج", "|")).toEqual(["a | b", "ج"]);
  });
  it("returns null Arabic when no separator qualifies", () => {
    expect(splitBilingual("a | b", "|")).toEqual(["a | b", null]);
  });
});

describe("slugifyId", () => {
  it("transliterates Turkish and keeps ids URL-safe", () => {
    expect(slugifyId("Çocuk Hakları ve Hukuku")).toBe("cocuk-haklari-ve-hukuku");
    expect(slugifyId("vize-2024-2025")).toBe("vize-2024-2025");
  });
});
