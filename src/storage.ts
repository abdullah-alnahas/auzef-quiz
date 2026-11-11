import type { Lang } from "./i18n.ts";
import type { Mode } from "./types.ts";

export interface Prefs {
  lang: Lang;
  theme: "system" | "light" | "dark";
  showArabic: boolean;
  lastCourse?: string;
  lastExam?: string;
  lastQuestion?: number;
}

export interface StoredSession {
  key: string;
  examId: string;
  courseId: string;
  mode: Mode;
  index: number;
  answers: Record<string, string>;
  revealed: Record<string, true>;
  submitted: boolean;
  examHash: string;
  questionHashes: Record<string, string>;
  updatedAt: number;
}

export interface AttemptScore {
  known: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  unknown: number;
}

export interface Attempt {
  id?: number;
  examId: string;
  courseId: string;
  mode: Mode;
  createdAt: number;
  answers: Record<string, string>;
  examHash: string;
  score: AttemptScore;
}

export class StorageError extends Error {}

const DB_NAME = "auzef";
const DB_VERSION = 1;
const STORES = ["prefs", "sessions", "bookmarks", "attempts"] as const;
type Store = (typeof STORES)[number];

export const DEFAULT_PREFS: Prefs = {
  lang: "ar",
  theme: "system",
  showArabic: true,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("prefs")) {
        db.createObjectStore("prefs", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("bookmarks")) {
        db.createObjectStore("bookmarks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("attempts")) {
        const store = db.createObjectStore("attempts", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("examId", "examId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(String(request.error)));
  });
  return dbPromise;
}

async function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError(String(error));
  }
}

export async function loadPrefs(): Promise<Prefs> {
  const rows = (await run("prefs", "readonly", (s) => s.getAll())) as {
    key: string;
    value: unknown;
  }[];
  const prefs: Prefs = { ...DEFAULT_PREFS };
  for (const row of rows) {
    if (row.key in prefs) {
      Object.assign(prefs, { [row.key]: row.value });
    }
  }
  return prefs;
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  await run("prefs", "readwrite", (s) => s.put({ key, value }));
}

export function sessionKey(examId: string, mode: Mode): string {
  return `${examId}:${mode}`;
}

export async function saveSession(
  session: Omit<StoredSession, "updatedAt">,
): Promise<void> {
  const record: StoredSession = { ...session, updatedAt: Date.now() };
  await run("sessions", "readwrite", (s) => s.put(record));
}

export async function getSession(key: string): Promise<StoredSession | undefined> {
  return (await run("sessions", "readonly", (s) => s.get(key))) as
    | StoredSession
    | undefined;
}

export async function listSessions(): Promise<StoredSession[]> {
  return (await run("sessions", "readonly", (s) => s.getAll())) as StoredSession[];
}

export async function deleteSession(key: string): Promise<void> {
  await run("sessions", "readwrite", (s) => s.delete(key));
}

export interface Bookmark {
  id: string;
  examId: string;
  number: number;
  createdAt: number;
}

export function bookmarkId(examId: string, number: number): string {
  return `${examId}:${number}`;
}

export async function setBookmark(
  examId: string,
  number: number,
  on: boolean,
): Promise<void> {
  const id = bookmarkId(examId, number);
  if (on) {
    await run("bookmarks", "readwrite", (s) =>
      s.put({ id, examId, number, createdAt: Date.now() }),
    );
  } else {
    await run("bookmarks", "readwrite", (s) => s.delete(id));
  }
}

export async function listBookmarks(examId?: string): Promise<Bookmark[]> {
  const rows = (await run("bookmarks", "readonly", (s) => s.getAll())) as Bookmark[];
  return examId ? rows.filter((b) => b.examId === examId) : rows;
}

export async function saveAttempt(attempt: Attempt): Promise<number> {
  const id = await run("attempts", "readwrite", (s) => s.add(attempt));
  return Number(id);
}

export async function getAttempt(id: number): Promise<Attempt | undefined> {
  return (await run("attempts", "readonly", (s) => s.get(id))) as Attempt | undefined;
}

export async function listAttempts(examId?: string): Promise<Attempt[]> {
  const rows = (await run("attempts", "readonly", (s) => s.getAll())) as Attempt[];
  return (examId ? rows.filter((a) => a.examId === examId) : rows).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

/** Clears progress, sessions, bookmarks and attempts; preferences stay. */
export async function resetProgress(): Promise<void> {
  for (const store of ["sessions", "bookmarks", "attempts"] as const) {
    await run(store, "readwrite", (s) => s.clear());
  }
}
