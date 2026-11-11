export interface RichText {
  text: string;
  images: string[];
}

export interface Choice {
  letter: string;
  turkish: RichText;
  arabic: RichText | null;
}

export interface Question {
  id: string;
  number: number;
  turkish: RichText;
  arabic: RichText | null;
  choices: Choice[];
  /** Correct letter, or null when the source key is UNKNOWN. */
  answer: string | null;
  answerUnknown: boolean;
  review: string[];
  /** Each table is rows of cells; the first row is the header. */
  tables: string[][][];
}

export interface Exam {
  courseId: string;
  examId: string;
  course: string;
  exam: string;
  sourceUrl: string;
  scrapedAt: string;
  questionCount: number;
  contentHash: string;
  questions: Question[];
  assets: string[];
}

export interface ExamSummary {
  examId: string;
  courseId: string;
  course: string;
  exam: string;
  questionCount: number;
  contentHash: string;
  reviewFlags: number;
}

export interface CourseSummary {
  courseId: string;
  course: string;
  exams: ExamSummary[];
}

export interface AppManifest {
  generatedAt: string;
  courses: CourseSummary[];
}

export type Mode = "practice" | "exam";

export interface AnswerRecord {
  letter: string;
  correct: boolean | null;
}
