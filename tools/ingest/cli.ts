#!/usr/bin/env node
/**
 * Build-time ingestion: output/**.md -> public/data/*.json.
 *
 *   OUTPUT_DIR=../output npm run ingest
 *
 * Markdown is never parsed in the browser. Parse errors fail the build; count
 * mismatches and skipped entries are written to ingest-report.json.
 */
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExamMarkdown, ParseError, slugifyId } from "./parser.ts";
import type {
  AppManifest,
  CourseSummary,
  ExamSummary,
  ExamType,
} from "../../src/types.ts";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outputDir = path.resolve(root, process.env.OUTPUT_DIR ?? "output");
const publicDir = path.join(root, "public", "data");

interface ManifestEntry {
  course: string;
  course_slug: string;
  exam: string;
  exam_slug: string;
  type?: string;
  mock?: boolean;
  file: string;
  question_count: number;
  review_flags: number;
  translated: boolean;
  status: string;
  content_hash: string;
}

const EXAM_TYPES = new Set<ExamType>([
  "vize",
  "final",
  "butunleme",
  "yaz-okulu",
  "uc-ders",
  "unite",
  "deneme",
  "unknown",
]);

function examType(value: unknown): ExamType {
  return typeof value === "string" && EXAM_TYPES.has(value as ExamType)
    ? (value as ExamType)
    : "unknown";
}

interface Report {
  generatedAt: string;
  outputDir: string;
  exams: number;
  questions: number;
  skipped: number;
  warnings: string[];
  errors: string[];
}

async function main(): Promise<number> {
  const manifestPath = path.join(outputDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`ingest: no manifest at ${manifestPath}`);
    return 1;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    exams: ManifestEntry[];
  };
  const report: Report = {
    generatedAt: new Date().toISOString(),
    outputDir,
    exams: 0,
    questions: 0,
    skipped: 0,
    warnings: [],
    errors: [],
  };
  const courses = new Map<string, CourseSummary>();
  const assets = new Set<string>();
  const usedIds = new Set<string>();

  for (const entry of manifest.exams) {
    const mdPath = path.join(outputDir, entry.file);
    if (!entry.file || !existsSync(mdPath) || !entry.translated) {
      report.skipped += 1;
      continue;
    }
    const courseId = slugifyId(entry.course_slug);
    const examId = `${courseId}__${slugifyId(entry.exam_slug)}`;
    if (usedIds.has(examId)) {
      report.errors.push(`${entry.file}: duplicate exam id ${examId}`);
      continue;
    }
    usedIds.add(examId);
    let parsed;
    try {
      parsed = parseExamMarkdown(await readFile(mdPath, "utf8"), entry.file, {
        courseId,
        examId,
      });
    } catch (error) {
      if (error instanceof ParseError) {
        report.errors.push(...error.details.map((d) => `${error.file}: ${d}`));
      } else {
        report.errors.push(`${entry.file}: ${String(error)}`);
      }
      continue;
    }
    for (const warning of parsed.warnings) {
      report.warnings.push(`${entry.file}: ${warning}`);
    }
    if (parsed.exam.questionCount !== entry.question_count) {
      report.warnings.push(
        `${entry.file}: manifest question_count ${entry.question_count} != parsed ${parsed.exam.questionCount}`,
      );
    }
    const course = courses.get(courseId) ?? {
      courseId,
      course: entry.course,
      exams: [],
    };
    const summary: ExamSummary = {
      examId,
      courseId,
      course: entry.course,
      exam: entry.exam,
      type: examType(entry.type),
      mock: Boolean(entry.mock),
      questionCount: parsed.exam.questionCount,
      contentHash: parsed.exam.contentHash,
      reviewFlags: parsed.exam.questions.reduce((n, q) => n + q.review.length, 0),
    };
    course.exams.push(summary);
    courses.set(courseId, course);
    for (const asset of parsed.exam.assets) assets.add(asset);
    const examDir = path.join(publicDir, "exams");
    await mkdir(examDir, { recursive: true });
    await writeFile(
      path.join(examDir, `${examId}.json`),
      `${JSON.stringify(parsed.exam)}\n`,
      "utf8",
    );
    report.exams += 1;
    report.questions += parsed.exam.questionCount;
  }

  const appManifest: AppManifest = {
    generatedAt: report.generatedAt,
    courses: [...courses.values()]
      .map((course) => ({
        ...course,
        exams: course.exams.sort((a, b) => a.exam.localeCompare(b.exam, "tr")),
      }))
      .sort((a, b) => a.course.localeCompare(b.course, "tr")),
  };
  await mkdir(publicDir, { recursive: true });
  await writeFile(
    path.join(publicDir, "manifest.json"),
    `${JSON.stringify(appManifest)}\n`,
    "utf8",
  );

  await mkdir(path.join(publicDir, "assets"), { recursive: true });
  for (const asset of assets) {
    const from = path.join(outputDir, asset);
    const to = path.join(publicDir, asset);
    if (!existsSync(from)) {
      report.warnings.push(`missing asset: ${asset}`);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  }

  await writeFile(
    path.join(root, "ingest-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `ingest: ${report.exams} exams, ${report.questions} questions, ` +
      `${report.skipped} skipped, ${report.warnings.length} warnings, ` +
      `${report.errors.length} errors`,
  );
  if (report.errors.length) {
    for (const error of report.errors.slice(0, 20)) console.error(`  ${error}`);
    return 1;
  }
  return 0;
}

main().then((code) => process.exit(code));
