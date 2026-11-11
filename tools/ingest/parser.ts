import { createHash } from "node:crypto";
import type { Exam, Question, RichText } from "../../src/types.ts";

export interface ParsedFile {
  exam: Exam;
  warnings: string[];
}

export class ParseError extends Error {
  readonly file: string;
  readonly details: string[];

  constructor(file: string, details: string[]) {
    super(`${file}: ${details.join("; ")}`);
    this.file = file;
    this.details = details;
  }
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const LATIN = /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/;
const IMAGE = /\[IMAGE\]\(([^)]*)\)/g;

/**
 * Normalisation rules (only these; nothing else is rewritten):
 *  1. CRLF / CR become LF.
 *  2. A leading backslash on a structural marker (`\---`, `\###`, `\- `) is
 *     removed. This is the only escaped syntax the corpus has ever produced.
 *  3. `<br>` / `<br/>` / `\<br>` become a newline inside a field (they are
 *     never treated as document line breaks).
 *  4. Trailing spaces are trimmed and runs of 3+ blank lines collapse to one.
 *  5. `[IMAGE](…)` markers are lifted into `images`; `[TABLE]` blocks become
 *     cell arrays. Both are removed from the visible text.
 * Backslashes anywhere else are kept verbatim.
 */
export function normalise(markdown: string): string[] {
  let text = markdown.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/^\\(---|###|-)(\s|$)/, "$1$2"))
    .join("\n");
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  const out: string[] = [];
  let blank = 0;
  for (const line of lines) {
    if (line === "") {
      blank += 1;
      if (blank > 1) continue;
    } else {
      blank = 0;
    }
    out.push(line);
  }
  return out;
}

function arabic(text: string): boolean {
  return ARABIC.test(text);
}

function latin(text: string): boolean {
  return LATIN.test(text);
}

/**
 * Split a bilingual line at the first separator whose right side is Arabic.
 * Pipes inside table rows never reach here (tables are separate blocks).
 */
export function splitBilingual(
  line: string,
  separator: string,
): [string, string | null] {
  const candidates: { left: string; right: string; clean: boolean }[] = [];
  let from = 0;
  while (true) {
    const at = line.indexOf(separator, from);
    if (at < 0) break;
    const left = line.slice(0, at);
    const right = line.slice(at + separator.length);
    if (arabic(right) && (separator !== "|" || latin(left))) {
      candidates.push({
        left,
        right,
        // Prefer the split where each side is single-script: a pipe inside
        // the Turkish text has Latin on both sides and must not win.
        clean: !latin(right) && !arabic(left),
      });
    }
    from = at + separator.length;
  }
  const best = candidates.find((c) => c.clean) ?? candidates[0];
  return best ? [best.left.trim(), best.right.trim()] : [line.trim(), null];
}

function textOf(raw: string): RichText {
  const images: string[] = [];
  const text = raw.replace(/\\?<br\s*\/?>/gi, "\n").replace(IMAGE, (_, path: string) => {
    images.push(String(path).trim());
    return "";
  });
  return {
    text: text.replace(/\n{3,}/g, "\n\n").trim(),
    images,
  };
}

function tableRows(block: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === "")) continue;
    rows.push(cells);
  }
  return rows;
}

function parseFrontMatter(lines: string[], file: string): Record<string, string> {
  const meta: Record<string, string> = {};
  if (lines[0] !== "---") {
    throw new ParseError(file, ["missing front matter"]);
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new ParseError(file, ["unterminated front matter"]);
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return meta;
}

function safeAsset(path: string): string {
  const clean = path.trim();
  if (
    clean === "" ||
    clean.startsWith("/") ||
    clean.startsWith("\\") ||
    /^[a-z]+:/i.test(clean) ||
    clean.split("/").includes("..") ||
    clean.includes("\\")
  ) {
    throw new Error(`unsafe asset path: ${path}`);
  }
  if (!clean.startsWith("assets/")) {
    throw new Error(`asset outside assets/: ${path}`);
  }
  return clean;
}

export function parseExamMarkdown(
  markdown: string,
  file: string,
  ids: { courseId: string; examId: string },
): ParsedFile {
  const lines = normalise(markdown);
  const meta = parseFrontMatter(lines, file);
  const details: string[] = [];
  const warnings: string[] = [];
  for (const key of ["course", "exam", "source_url", "question_count", "scraped_at"]) {
    if (!meta[key]) details.push(`missing metadata: ${key}`);
  }

  const questions: Question[] = [];
  const assets = new Set<string>();
  let current: Question | null = null;

  const finish = (): void => {
    if (!current) return;
    const q = current;
    current = null;
    if (!q.turkish.text) details.push(`Q${q.number}: empty question text`);
    if (q.choices.length < 4 || q.choices.length > 5) {
      details.push(`Q${q.number}: ${q.choices.length} choices (expected 4-5)`);
    }
    const letters = q.choices.map((c) => c.letter);
    const expected = letters.map((_, i) => String.fromCharCode(65 + i));
    if (letters.join("") !== expected.join("")) {
      details.push(`Q${q.number}: choice letters ${letters.join("")} are not sequential`);
    }
    if (!q.answerUnknown) {
      if (!q.answer) details.push(`Q${q.number}: missing answer`);
      else if (!letters.includes(q.answer)) {
        details.push(`Q${q.number}: answer ${q.answer} is not a choice`);
      }
    }
    const addAsset = (image: string): void => {
      try {
        assets.add(safeAsset(image));
      } catch (error) {
        details.push(`Q${q.number}: ${(error as Error).message}`);
      }
    };
    for (const choice of q.choices) {
      choice.turkish.images.forEach(addAsset);
      (choice.arabic?.images ?? []).forEach(addAsset);
    }
    q.turkish.images.forEach(addAsset);
    (q.arabic?.images ?? []).forEach(addAsset);
    questions.push(q);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const header = /^### Q(\d+)\s*$/.exec(line);
    if (header) {
      finish();
      current = {
        id: `${ids.examId}:${Number(header[1])}`,
        number: Number(header[1]),
        turkish: { text: "", images: [] },
        arabic: null,
        choices: [],
        answer: null,
        answerUnknown: false,
        review: [],
        tables: [],
      };
      continue;
    }
    if (!current) continue;
    const q = current;
    if (line.startsWith("**Question:**")) {
      const raw = line.slice("**Question:**".length).trim();
      const [tr, ar] = splitBilingual(raw, "|");
      q.turkish = textOf(tr);
      q.arabic = ar === null ? null : textOf(ar);
      continue;
    }
    if (line === "**Choices:**") continue;
    const choice = /^- ([A-E])\) (.*)$/.exec(line);
    if (choice) {
      const raw = choice[2];
      const [tr, ar] = splitBilingual(raw, " — ");
      q.choices.push({
        letter: choice[1],
        turkish: textOf(tr),
        arabic: ar === null ? null : textOf(ar),
      });
      continue;
    }
    if (line === "[TABLE]") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "```") j += 1;
      const block: string[] = [];
      j += 1;
      while (j < lines.length && lines[j].trim() !== "```") {
        block.push(lines[j]);
        j += 1;
      }
      if (block.length) q.tables.push(tableRows(block));
      i = j;
      continue;
    }
    const review = /^<!-- REVIEW: (.*?) -->$/.exec(line);
    if (review) {
      q.review.push(review[1]);
      continue;
    }
    const answer = /^\*\*Answer:\*\* (.*)$/.exec(line);
    if (answer) {
      const value = answer[1].trim();
      if (value === "UNKNOWN") {
        q.answer = null;
        q.answerUnknown = true;
      } else if (/^[A-E]$/.test(value)) {
        q.answer = value;
      } else {
        details.push(`Q${q.number}: unsupported answer "${value}"`);
      }
      continue;
    }
    if (line.trim() !== "") {
      warnings.push(`Q${q.number}: ignored line "${line.slice(0, 40)}"`);
    }
  }
  finish();

  const declared = Number(meta.question_count);
  if (!Number.isFinite(declared)) details.push("question_count is not a number");
  else if (declared !== questions.length) {
    warnings.push(
      `front matter question_count ${declared} != parsed ${questions.length}`,
    );
  }
  const numbers = questions.map((q) => q.number);
  if (new Set(numbers).size !== numbers.length) details.push("duplicate question numbers");

  if (details.length) throw new ParseError(file, details);

  const exam: Exam = {
    courseId: ids.courseId,
    examId: ids.examId,
    course: meta.course,
    exam: meta.exam,
    sourceUrl: meta.source_url,
    scrapedAt: meta.scraped_at,
    questionCount: questions.length,
    contentHash: "",
    questions,
    assets: [...assets].sort(),
  };
  exam.contentHash = createHash("sha256")
    .update(JSON.stringify(questions))
    .digest("hex");
  return { exam, warnings };
}

/** Transliterate an arbitrary slug to URL-safe ASCII (ids only, never display). */
export function slugifyId(value: string): string {
  const map: Record<string, string> = {
    ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
    ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c",
  };
  return value
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
