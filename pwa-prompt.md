# Task: Build a lightweight offline-first bilingual (Turkish–Arabic) exam-practice PWA

## 0. Working agreement
You are a senior frontend engineer and PWA specialist. Implement the working application, not a plan or mockup.

Work in the phases in §12. Do not start a phase until the previous phase's gate passes. Run commands and show their actual output; never claim tests, lint, type checks, or builds pass without running them.

Before writing code, post a short findings report: project structure, existing stack, sample files inspected, how the manifest references exams, and any assumptions or ambiguities. If required inputs are missing or contradict this spec, state what you'll assume and continue; stop and ask only if the parser cannot be written without them.

Priorities, in order, when requirements conflict: (1) data integrity, (2) quiz correctness, (3) offline reliability, (4) quiz-screen usability, (5) everything else.

## 1. Product
A no-account, no-backend study app for university past exams. Students browse courses and exams, study questions with Turkish originals and Arabic translations, answer multiple-choice questions with immediate feedback (Practice) or deferred feedback (Exam simulation), review mistakes, bookmark questions, resume sessions, and use downloaded content fully offline.

Principle: the question-answering screen matters most. No dashboards, charts, gamification, or decoration. Every feature must serve studying.

## 2. Inputs
- Source data: `{OUTPUT_DIR}` (default `/output`): `manifest.json`, `glossary.json`, `assets/`, `logs/`, `{course-slug}/{exam-slug}.md`.
- Original Markdown files are read-only. Never modify them.
- Inspect the existing project and at least 3 real exam files (including one with the escaped syntax) before designing the parser. Reuse the existing stack and conventions; add no heavyweight dependencies.
- Reference format:

      PASTE EXACT CANONICAL SAMPLE HERE
      PASTE EXACT ESCAPED SAMPLE HERE (with \---, \###, \-, \<br>)

## 3. Defaults (override only with a stated reason)
- Stack: Vite + TypeScript (strict) + Preact; hand-written service worker (a small plugin is acceptable if it reduces risk); Vitest for unit tests; Playwright for e2e and offline tests; axe for automated accessibility checks.
- Routing: hash-based, so static hosting at any subpath works.
- Hosting: static files, possibly at a subpath. Use relative base paths; scope the service worker accordingly.
- Offline content in Cache Storage; user data (progress, bookmarks, attempts, preferences) in IndexedDB.
- Parse errors fail the build; warnings are written to a report.

## 4. Data invariants (non-negotiable)
Never: invent questions, choices, answers, or explanations; edit Turkish originals; silently change Arabic translations; reorder choices; treat `UNKNOWN` as correct or incorrect; ignore `REVIEW` flags; blindly strip backslashes (normalize only enumerated, known artifacts); render raw HTML.

## 5. Ingestion
Build-time CLI (`npm run ingest`) converts Markdown to typed JSON under the app's static data directory. The browser never parses Markdown.

Parser requirements:
- Accept canonical and escaped formats; list every normalization rule explicitly in code and tests.
- Extract metadata (course, exam, source_url, question_count, scraped_at).
- Preserve original question numbers and choice letters/order; support 4 or 5 choices dynamically.
- Language split: define a deterministic rule for the first top-level `|` (questions) and `—` (choices) separator, validated by script detection (Latin/Turkish vs. Arabic). Pipes inside tables and em-dashes inside text must not split. Missing Arabic yields `arabic: null`, never a guess.
- Support multiline text, `<br>` → real line breaks, images (resolved only inside `assets/`, rejecting `..` and absolute/external paths), simple tables, and `<!-- REVIEW: ... -->` comments (preserved per question).
- Answer: letter A–E (must match an existing choice) or `UNKNOWN`.
- Malformed/truncated questions are reported with file and question number and never silently dropped. Invalid files fail the build; warnings (e.g., manifest count mismatch) are listed in `ingest-report.json`.
- Validate manifest `question_count` against parsed counts.
- Emit per exam: JSON, content hash, and the list of asset URLs it needs.

Rendering: a small safe renderer supporting paragraphs, line breaks, emphasis, images, and tables. Everything else is escaped text.

## 6. Data model and IDs
- `courseId` and `examId`: URL-safe ASCII slugs derived from source slugs (transliterate Turkish characters deterministically; resolve collisions explicitly).
- `questionId = {examId}:{number}`. Each exam JSON carries a content hash.
- Saved progress stores answers by `questionId` plus the exam content hash. If a hash changes on update, keep the progress, match by `questionId`, and flag changed questions as "content updated" rather than silently reusing or discarding answers.
- IndexedDB has a schema version with migrations. App updates never delete user data.

## 7. Screens
**Home:** header; course list from the manifest (never hardcoded); compact search; exam count and understated progress per course; prominent "Resume" when an unfinished session exists.

**Course:** exams grouped by year/type using source naming; question count; download state; Practice and Exam entry points; download exam / download course.

**Quiz (highest effort):**
- Header: course/exam, "n / total", progress bar, bookmark, question navigator.
- Turkish original (LTR, prominent) and Arabic translation (RTL) as two labeled, visually separate blocks. Arabic is hideable (preference persisted, independent of UI language).
- Handles long text, paragraphs, quotes, images, tables, variable heights.
- Choices: full-row buttons with letter, Turkish text, Arabic text (visually distinct, compact), 4 or 5 dynamically; clear selected/focus/disabled/correct/incorrect states.
- Navigation: previous/next and a navigator showing current / answered / unanswered / bookmarked. Navigation never discards answers.
- A neutral "translation under review" badge appears when a question has a `REVIEW` flag.

**Results:** correct / incorrect / unanswered / unknown-key counts and score. Score denominator = questions with known keys only. Review filters: incorrect, unanswered, bookmarked, all. Retry creates a new attempt; previous attempts are kept. No analytics dashboards.

## 8. Quiz behavior
**Practice:** selecting an answer immediately shows feedback and locks the question (no re-answering). Correct = green + "Correct"; incorrect = red + "Incorrect", and the correct choice is also shown in green with text. Provide a clear Next action. Guard against double-submit. `UNKNOWN`: allow selection, show a neutral "Answer key unavailable" notice, exclude from score.

**Exam:** selection is recorded with no correctness cues; answers can change freely; no correct answers are present in the DOM before submission. Submit shows a confirmation listing unanswered count. No timer unless the source provides timing. Results appear only after submission.

Each session is one (exam, mode, attempt). Switching mode starts a new session; resume restores exam, mode, question index, and answers.

## 9. Persistence
Automatic saves for: last course/exam/question, answers, attempts and results, bookmarks (per exam, shared across attempts), theme, UI language, Arabic visibility. Reset progress requires confirmation and does not remove downloaded content (offer that as a separate action). Survive refresh, restart, and offline use. Handle storage-quota and write failures visibly. Request persistent storage where supported.

## 10. Offline and PWA
- Installable: web manifest, maskable icons, service worker.
- App shell: precached, versioned; obsolete caches removed on activate; update flow shows a non-blocking "update available" prompt (no forced reload mid-quiz).
- Content: fetched JSON and assets are cached only on explicit download. Download status per exam/course is derived from the cache against the exam's asset list. Show progress, support failure and retry, and resume interrupted downloads (a partially cached exam is "incomplete," never "downloaded").
- Detect updated content via the content hash and mark downloaded exams "update available."
- Not downloaded and offline: show a clear message, not a broken screen. Handle real fetch failures; do not rely on `navigator.onLine`.
- Offline navigation fallback to the shell.

## 11. Design, i18n, accessibility, performance
- Calm academic look: neutral backgrounds, one accent, subtle borders, small radii, minimal shadow; no gradients, glass, heavy animation, or decorative art. Light/dark follows the system by default. Respect reduced motion.
- Semantic colors (green/red/amber/neutral) always paired with text or icon.
- UI default Arabic (RTL), Turkish alternative (LTR), via key-based string catalogs. Arabic UI strings must be natural, not literal translations; list them for native review. UI language and content visibility are independent.
- Correct `lang`/`dir` on each content block; use `dir="auto"` or isolation for mixed-script fragments; CSS logical properties; Arabic line-height tuned; font stack that renders Arabic well on Android (bundle a small subset font only if system fonts prove inadequate).
- WCAG 2.2 AA: semantic HTML, full keyboard operation (choose answer, navigate, bookmark, submit), visible focus, ≥44×44 CSS px touch targets, 4.5:1 text contrast, live-region announcements for feedback, accessible dialogs, alt text for meaningful images.
- Budgets: initial JS ≤ 60 KB gzip (excluding lazy exam data); exam JSON and images lazy-loaded; Lighthouse mobile PWA/Perf/A11y ≥ 90; LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on a throttled mid-range profile.
- No analytics, trackers, ads, accounts, or backend.

## 12. Phases and gates
1. **Inspect + parser.** Gate: parser tests pass on real samples; `ingest-report.json` generated.
2. **Navigation + quiz screen + engine.** Gate: engine unit tests pass; Practice and Exam flows work with real data.
3. **Results, bookmarks, persistence.** Gate: refresh/resume tests pass.
4. **Offline + PWA.** Gate: Playwright offline tests pass (shell offline; downloaded exam and its images offline; interrupted download recovery; app update preserves progress).
5. **Polish, a11y, performance.** Gate: axe clean; budgets met; viewports (small mobile, desktop), RTL/LTR, 4/5 choices, long questions verified.

## 13. Tests (minimum)
- **Parser:** both formats; metadata; 4/5 choices; `UNKNOWN`; multiline and `<br>`; missing Arabic; REVIEW comments; images and tables; unsafe asset paths; truncated/invalid questions; manifest mismatch.
- **Engine:** correct/incorrect; practice feedback and lock; no feedback and no answer leakage in exam mode; changing answers; `UNKNOWN` exclusion; scoring denominator; unanswered; bookmarks.
- **Persistence:** refresh, interrupted-session recovery, bookmarks, preferences, reset confirmation, content-hash change handling, schema migration.
- **Offline/UI:** as listed in §10 and §12.

Fix failures; never suppress lint, type, or test errors.

## 14. Out of scope
Timers (unless configured), accounts, sync, analytics, shuffling, AI explanations, leaderboards, statistics dashboards.

## 15. Final report
Concise: architecture and stack; screens and features; ingestion strategy and normalization rules; offline architecture; real test, lint, type-check, and build output summaries; budget measurements; known issues and unsupported cases; steps to add newly scraped courses/exams (`npm run ingest` → build → deploy → how clients receive updates).
