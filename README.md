# AUZEF exam practice PWA

Offline-first study app for AUZEF past exams: Turkish originals, Arabic
translations, Practice (instant feedback) and Exam simulation (feedback only
after submission). No accounts, no backend, no analytics.

## Stack

- Preact + TypeScript (strict), Vite, hash routing (works at any subpath).
- Hand-written service worker emitted at build with a precache list of the
  real bundle (versioned; old caches removed on activate).
- Content in Cache Storage (explicit download only); user data in IndexedDB
  (`auzef`, schema v1).
- Vitest for unit tests, Playwright (+ axe) for e2e, offline and a11y.

## Commands

Requires Node 22.6+ (the ingest CLI runs TypeScript directly).

```bash
npm install
npm run ingest     # output/**.md -> public/data/** + ingest-report.json
npm run dev        # Vite dev server
npm run build      # tsc --noEmit && vite build (includes sw.js)
npm run preview    # serve dist
npm test           # parser, engine, storage tests
npm run test:e2e   # Playwright (mobile + desktop, offline, axe, budgets)
```

`OUTPUT_DIR` overrides the corpus location (default: `./output`, i.e. the
scraper's directory in this repo).

## Data flow

```
output/manifest.json + {course}/{exam}.md
        │  npm run ingest  (build time, never in the browser)
        ▼
public/data/manifest.json          courses + exam summaries (ids, counts, hash)
public/data/exams/{examId}.json    questions, choices, tables, review notes
public/data/assets/**              copied only when an exam references them
ingest-report.json                 counts, warnings, parse errors
```

Ingest fails the build on structural errors (bad answer letter, non-sequential
choices, unsafe asset path, duplicate question numbers) and reports them with
file and question number. Count mismatches are warnings, not failures.

### Markdown normalisation rules (only these)

1. CRLF/CR → LF.
2. A leading backslash on a structural marker (`\---`, `\###`, `\- `) is
   removed (the only escaped syntax the corpus has produced).
3. `<br>`, `<br/>`, `\<br>` become a newline **inside a field**; they are not
   document line breaks.
4. Trailing spaces trimmed; 3+ blank lines collapse.
5. `[IMAGE](assets/…)` is lifted into `images` and validated: no absolute
   paths, no `..`, no external URLs, must live under `assets/`.
6. `[TABLE]` fenced blocks become row arrays.
7. Nothing else is rewritten; backslashes elsewhere stay verbatim.

Bilingual splitting is script-validated: a question splits at the first `|`
whose left side is Latin/Turkish and right side Arabic (preferring
single-script sides), choices at the first ` — ` meeting the same rule. Missing
Arabic yields `null`; it is never guessed. `<!-- REVIEW: … -->` is preserved
per question. `Answer: UNKNOWN` becomes `answer: null` and is excluded from the
score.

## IDs and content hashes

- `courseId` / `examId`: URL-safe ASCII slugs from the source slugs
  (`examId = {courseId}__{examSlug}`), so ids are unique across courses.
- `questionId = {examId}:{number}`.
- Each exam JSON carries a SHA-256 `contentHash` of its questions. Sessions
  store the hash plus per-question hashes: after an update, answers are kept by
  `questionId`, and changed questions are flagged “content updated” instead of
  being silently reused.

## Screens

- **Home** – courses from the manifest, search, resume banner, subtle per-course
  progress, theme and reset controls.
- **Course** – exams grouped by term, question counts, download state
  (`none/partial/complete/update`), Practice/Exam entry points, download exam or
  whole course, remove downloaded content, and a **test-all** panel with
  independent toggles: Vize, Vize Deneme, Final (+ Bütünleme), Final Deneme and
  Üniteler. Any combination can be started as one session; bütünleme always
  belongs to the Final group, and its denemeleri to Final Deneme.
- **Quiz** – Turkish (LTR) and Arabic (RTL) blocks; Arabic visibility is a
  preference independent of UI language; long text, `<br>`, images, tables;
  4–5 choices with letter/TR/AR; bookmark, navigator, progress, review badge.
  The practice navigator colours each question correct / wrong / unanswered
  (with ✓/✗/– and a legend, never colour alone); exam mode shows only
  answered/unanswered so the key cannot leak. Practice locks a question after
  the first answer and shows the correct choice; Exam records answers silently,
  allows changes, and only reveals correctness after submit.
- **Results** – correct/incorrect/unanswered/unknown counts, score over known
  keys only, filters (all/incorrect/unanswered/bookmarked), retry (previous
  attempts kept). Every question expands to its full choice list, with the
  chosen and correct options marked and the source exam shown for combined
  sets. Combined headers list the included exams and each question names its
  source exam.

## Offline

- App shell + manifest are precached by the service worker; navigations fall
  back to the shell. `Vary` is ignored when matching cache entries because the
  preview host sends `Vary: Origin`.
- Exam JSON and assets are cached only after an explicit download. A partially
  cached exam is reported as “incomplete”, never “downloaded”; downloads skip
  already-cached files, so an interrupted download resumes on retry.
- A cached exam whose hash differs from the manifest shows “update available”.
- Not downloaded + offline shows a clear message with retry, never a blank
  screen.
- Updates: new worker installs and waits; the app shows a non-blocking banner
  and only reloads when the user accepts. User data lives in IndexedDB and is
  untouched by cache version changes.

## i18n and accessibility

- Arabic UI is the default (RTL); Turkish is one tap away (LTR). Strings live
  in `src/i18n.ts` (typed keys, both catalogs complete).
- `lang`/`dir` are set on each content block; `bdi` isolates Latin fragments in
  RTL text; logical CSS properties are used throughout.
- Semantic headings, keyboard-operable choices/navigator/dialogs, visible focus,
  44 px targets, live-region feedback, axe-clean home/quiz/results.

## Measured budgets

- Initial JS: 53.66 kB raw / **18.22 kB gzip** (budget 60 kB gzip).
- CSS: 2.84 kB gzip.
- Lighthouse 13 (mobile, local preview): Performance **100**, Accessibility
  **100**, LCP **1.3 s**, TBT 10 ms, CLS 0.
- Playwright budget test also asserts JS transfer < 60 kB and LCP < 2.5 s.

## Arabic UI strings for native review

The interface is Arabic-first; these are the user-facing strings that deserve a
native pass (see `src/i18n.ts` for the full catalog):

- مذاكرة · أسئلة AUZEF السابقة، بالتركية والعربية · ابحث عن مقرر
- متابعة الجلسة · تدريب · محاكاة الامتحان
- تنزيل · منزَّل · جارٍ التنزيل… · تنزيل غير مكتمل · تحديث متاح
- صحيح · خطأ · بلا إجابة · مفتاح الإجابة غير متوفر
- الترجمة قيد المراجعة · تغيّر المحتوى
- خريطة الأسئلة · مُجاب · الحالي
- تُحتسب الأسئلة ذات مفاتيح الإجابات فقط.

## Deploying to GitHub Pages

This is a static site: GitHub Pages (`https://<user>.github.io/<repo>/`) needs no
Node server. The build already uses relative paths and hash routing, so a
repository subpath works unchanged.

1. Settings → Pages → Build and deployment → **Source: GitHub Actions**.
2. Push to `main`; `.github/workflows/pages.yml` runs `npm ci`, `npm test`,
   `npm run build` and publishes `dist/`.
3. The first deployment URL is `https://<user>.github.io/<repo>/`.

`public/data/` (generated exam JSON) is committed on purpose: GitHub Actions
does not have the scraper's `output/` corpus, so CI must build from committed
data. After scraping/translating new exams:

```bash
npm run ingest          # regenerate public/data + ingest-report.json
git add public/data && git commit -m "data: refresh exams"
git push                # Pages rebuilds and clients get the update banner
```

`output/` itself stays out of git (raw pages, queues, rendered Markdown); only
the app-ready JSON is versioned. A custom domain also works: keep `base: "./"`
and the relative manifest/SW scope resolve against it automatically.

## Known limitations

- The current corpus has no `assets/` files, so image download/offline paths are
  implemented and unit-reasoned but not exercised by a real image in e2e.
- Multi-select answers (`A, C`) are rejected by the parser; the corpus currently
  contains none. Extend the data model before ingesting such pages.
- No timer: the source provides none.
- Content-update detection compares hashes; there is no background sync.

## Adding newly scraped exams

```bash
# scraper: fetch -> parse -> translate -> render -> validate (see scripts/)
npm run ingest
npm test && npm run test:e2e
npm run build
# deploy dist/ (and public/data inside it); clients see an update banner,
# then download changed exams explicitly.
```
