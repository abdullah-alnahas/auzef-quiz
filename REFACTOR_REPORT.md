# Refactor report — auzef-quiz

Branch: `refactor/bloat-cleanup` (base `main` @ `8f9a484`).
Scope: the TypeScript PWA (`src/`), its unit/e2e tests, and three small,
pytest-verified Python cleanups. `public/data/`, the scraper pipeline, the
service-worker contract, the IndexedDB schema and every persisted format were
left untouched.

## 1. Metrics

| Metric | Before | After | Note |
| --- | --- | --- | --- |
| Initial JS (raw / gzip) | 53.67 kB / **18.23 kB** | 53.46 kB / **18.46 kB** | gzip +0.23 kB (+1.3%), raw −0.21 kB; budget is 60 kB gzip |
| CSS gzip | 2.84 kB | 2.84 kB | unchanged |
| `tsc --noEmit` errors | 0 | 0 | `npm run lint` |
| Vitest | 50 tests / 5 files | **73 tests / 8 files** | +23 characterization/unit tests |
| Playwright | 16 tests | **20 tests** | +4 regression tests (all failed on old code first) |
| pytest | 52 passed | **52 passed** | unchanged suite |
| ruff | 1 error (F401) | **0** | `ruff check scripts tests` |
| mypy | 2 errors | **0** | `mypy scripts` |
| jscpd (≥8 lines / ≥50 tokens) | 4 clones, 43 lines, 0.52% | **2 clones, 27 lines, 0.32%** | remaining: CSS dark-token block, two Python HTML walkers |
| ruff C901 (mccabe) | 13 findings | 13 findings | pre-existing pipeline `main()` functions; not in scope |
| src non-test LOC | 3,485 | 3,631 | +146 (+4%): typed routes, two explicit state unions, shared components |
| src test LOC | 561 | 778 | +217 |
| e2e LOC | 410 | 508 | +98 |
| scripts LOC | 3,007 | 2,996 | −11 |

The gzip increase is the price of the explicit state machines, typed routes and
shared components; it stays at 31% of the existing budget. Raw JS and Python
duplication both shrank.

## 2. Commits (oldest → newest)

```
4f090db refactor(types): drop unused AnswerRecord, un-export internal helpers
8505cb4 refactor(i18n): remove translation keys no screen uses
5103333 refactor(types): single SessionState/AttemptScore shape; drop engine->storage import
1e05253 refactor(engine): share one FNV-1a hash between question and combined hashes
ff9ac7e refactor(i18n): exhaustive scope-group labels and a shared scopeTitle helper
8a3a3e5 refactor(engine): pure navigatorState replaces the inline quiz closure
927cc76 refactor(components): one ChoiceContent renders Turkish, Arabic and images
a1e9f3b fix(results): show choice images, matching the quiz (with e2e repro)
01948ec refactor(components): one ConfirmDialog for all four confirmation prompts
adab557 fix(app): load the manifest when preferences storage is unavailable
dbf4c68 fix(course): keep a bulk-download failure visible after later successes
180a23d refactor(results): explicit loading/failed/ready state; storage failure shows an error
4f92d7a refactor(quiz): explicit loading/failed/ready state instead of five nullable flags
014e495 refactor(quiz): move the navigator dialog into its own screen module
9da07dd refactor(python): reuse discover.period_of instead of a second copy
06cefb4 chore(python): drop unused json import (ruff F401)
bb8635f chore(python): annotate add_p1_sets accumulators (mypy)
67b2b25 refactor(app): typed hash routes with unit tests; invalid routes show the error screen
93a3b63 refactor(course): exhaustive download labels; tolerate status refresh failures
4c150c3 refactor(i18n): drop the unreachable Arabic fallback
153a9f7 refactor(data): one fetchJson for manifest and exam loads; add data tests
```

## 3. Changes by type

### Dead code and unused exports
- Removed `AnswerRecord` (zero references).
- Un-exported `isScopeGroup`, `bookmarkId`, `InlineText` (module-internal only).
- Removed 12 translation keys no screen referenced: `exams`, `questions`,
  `download`, `noAttempts`, `resetDone`, `language`, `offlineReady`,
  `allCourses`, `progress`, `start`, `continue`, `scopeAll`.
- Removed the unreachable `?? catalogs.ar[key]` fallback in `t()` (both catalogs
  are complete by type).
- Files: `src/types.ts`, `src/combine.ts`, `src/storage.ts`,
  `src/components.tsx`, `src/i18n.ts`.

### Duplication and layering
- `SessionState` and `AttemptScore` moved to `src/types.ts`; `StoredSession`
  now extends `SessionState`. Removes the duplicate persisted shape and the
  `engine → storage` type dependency.
- One FNV-1a implementation (`engine.fnv1a`) now backs both `questionHash` and
  the combined-exam hash. Verified the combined hash is byte-identical before
  and after (`combined-3a2fc3d2-3` on a fixed fixture).
- One `scopeTitle(lang, groups)` replaces the `parseScope(...).map(...).join`
  expression in Quiz and Results.
- One `ChoiceContent` replaces the duplicated Turkish/Arabic/image choice body
  in Quiz and Results.
- One `ConfirmDialog` replaces four near-identical confirmation dialogs in
  Home (×2), Course and Quiz.
- One `fetchJson` backs `loadManifest` and `loadExam`.
- Python: `parse_all.period` deleted in favour of `discover.period_of`.
- Files: `src/types.ts`, `src/engine.ts`, `src/combine.ts`, `src/i18n.ts`,
  `src/components.tsx`, `src/data.ts`, `src/screens/{home,course,quiz,results}.tsx`,
  `scripts/parse_all.py`.

### Types and routing
- `src/route.ts` (new): `parseRoute(hash)` returns a discriminated
  `Route` union (`home | course | quiz | combined | results | unknown`) instead
  of string-index routing in `app.tsx`. Memoised on the hash so `scopeGroups`
  identity stays stable (a first attempt without the memo caused a reload loop,
  caught by e2e).
- `statusLabel` now uses an exhaustive `Record<DownloadState, Key | null>` and
  `Lang` instead of `"ar" | "tr"`.
- `navigatorState(session, question)` moved into `engine.ts` as a pure,
  tested function; the quiz's nested ternary label mapping became a record.
- Files: `src/route.ts`, `src/route.test.ts`, `src/app.tsx`,
  `src/screens/course.tsx`, `src/screens/quiz.tsx`, `src/engine.ts`.

### Implicit state machines
| Where | States found | Action |
| --- | --- | --- |
| Quiz loading | `exam`, `session`, `failure` nullable + `changed`/`bookmarks` loaded separately; illegal combos (exam set, session null) representable; retry left stale exam visible | **Converted** to `loading / failed / ready(Loaded)` union; one transition point in the load effect and one `updateSession` for navigation |
| Results loading | `attempt`, `exam`, `failed` nullable; bookmark failure left an endless spinner | **Converted** to `loading / failed / ready(attempt, exam, bookmarks)`; all loads are inside one try/catch |
| Hash route | stringly-typed `route[0]` checks, empty combined scope rendered a blank screen | **Converted** to a typed route union with unit tests; invalid routes show the error notice |
| Course download UI | `statuses` (persisted-ish cache state), `progress`, `busy`, `error` | **Analysed, kept**: `DownloadState` is already an explicit union; in-flight progress is orthogonal. Fixed the bulk-error bug and made `refresh` failure-tolerant |
| PWA update | `waiting` singleton + `updateReady` boolean | **Kept**: two-state flag, no illegal combination, no duplicated transition |
| Theme | `"system" \| "light" \| "dark"` + CSS media query | **Kept**: already a typed union; system resolution is CSS-only |
| Session lifecycle | save on every change, delete on submit | **Kept**: persisted shape is frozen; no transition table would earn its keep |

### Tests added
- `src/i18n.test.ts`: interpolation, placeholder behaviour, scope labels.
- `src/route.test.ts`: every route kind, legacy scope codes, invalid input.
- `src/data.test.ts`: manifest/exam loading, HTTP/network/JSON failures.
- `src/engine.test.ts`: `fnv1a` standard vectors, `navigatorState` in both modes.
- `e2e/features.spec.ts`: results choice images.
- `e2e/edge.spec.ts`: IndexedDB-unavailable home, bulk-download error, results
  storage failure.

## 4. Bugs fixed (each reproduced first)

1. **Results dropped choice images.** Quiz rendered `choice.turkish.images`,
   Results did not. Added `e2e/features.spec.ts` “results render choice images
   like the quiz”; confirmed it failed on the old Results markup, then shared
   `ChoiceContent`. Commit `a1e9f3b`.
2. **Blocked IndexedDB left the app on “loading” forever.** `loadPrefs()` threw
   before `loadManifest()` ran. Added e2e that makes `IDBFactory.open` throw;
   confirmed no `<h1>`, then made prefs failure non-fatal and show the storage
   banner. Commit `adab557`.
3. **Bulk download hid an earlier failure.** Each `download()` cleared the
   error flag, so a later success erased a prior failure. Added an e2e that
   aborts the first exam and lets the rest succeed; confirmed the notice stayed
   hidden, then accumulated failures in `downloadAll`. Commit `dbf4c68`.
4. **Results spun forever when bookmark storage failed.** The bookmark read was
   outside the try/catch. Added an e2e that breaks the `bookmarks` store and
   reloads Results; confirmed the old code hung, then folded it into the ready
   state. Commit `180a23d`.
5. **Empty/invalid combined route rendered a blank main area.** Now maps to the
   error route (covered by `route.test.ts`). Commit `67b2b25`.
6. **Retry could show the previous quiz while reloading.** The explicit loading
   state clears it. Commit `4f92d7a`.
7. **Course status refresh could reject unhandled** (cache storage unavailable).
   `refresh()` now keeps the last labels. Commit `93a3b63`.

## 5. Bugs/behaviour left alone (ambiguous or frozen surface)

- **Combined sessions never appear in the Home resume card.** A combined
  session is stored under `{course}__combined-…`, which is not in the manifest,
  so the card is hidden. Fixing this needs a product decision and a route that
  can resume a combined scope.
- **Bookmarks are keyed by the exam id that created them**, so a bookmark made
  in a single exam does not appear in the combined results (and vice versa).
  Changing the key would change persisted semantics.
- **Arabic choice images are never rendered** (only `choice.turkish.images`).
  The schema allows them; the corpus has no assets, so intent is unclear.
- **`openDb` caches a rejected promise**, so a transient IndexedDB failure is
  not retried until reload. A fix is safe but needs a failure-injection test
  that `fake-indexeddb` does not make easy.
- **`storage.run` resolves on request success, not transaction completion** for
  writes. A quota abort after `onsuccess` could be reported as success.
- **`finish()` can save a duplicate attempt** if `deleteSession` fails after
  `saveAttempt` succeeds; the user can submit again.
- **`loadPrefs` uses `row.key in prefs`**, which also matches prototype keys
  (`toString`, …). Not reachable through the UI.
- **`parse_all.classify` differs from `discover.classify`** (`final` before
  `vize`, no `unite`/`deneme`/`arasınav`). It feeds the corpus pipeline, so it
  was deliberately not merged.
- **`parse_exam.py` / `parse_legacy.py` HTML walkers** remain duplicated (subtle
  block-tag differences); merging them risks changing parsed output.
- **Dark-theme tokens are duplicated** between `[data-theme="dark"]` and the
  `prefers-color-scheme` block. This is the standard CSS pattern; deduping
  would require moving theme resolution into JS.
- **`listAttempts` is only used by tests.** Kept as a tested storage API rather
  than deleting coverage.

## 6. Verification actually run

All commands were run in
`/home/abdullah/.local/share/opencode/worktree/0da05e/refactor-bloat`.

| Command | Result |
| --- | --- |
| `npm test` | 73 passed (8 files) |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` (`tsc && vite build`) | 53.46 kB JS / **18.46 kB gzip**, CSS 2.84 kB gzip |
| `npx playwright test -c playwright.local.config.ts` | 20 passed (mobile, port 4373) |
| `/usr/bin/python3 -m pytest tests -q` | 52 passed |
| `ruff check scripts tests` | All checks passed |
| `mypy scripts` | Success: no issues found in 25 source files |
| `npx jscpd --min-lines 8 --min-tokens 50 … src tools scripts tests` | 2 clones / 27 lines / 0.32% |
| `ruff check --select C901 scripts tests` | 13 pre-existing findings (unchanged) |
| `node --experimental-strip-types` hash fixture | `combined-3a2fc3d2-3` before and after |

`playwright.local.config.ts` is an untracked local override that moves the
preview server to port 4373 (`reuseExistingServer: false`) so it cannot collide
with the parallel agent. The tracked `playwright.config.ts` was not changed.

Checks after every commit: `npm test`, `npm run lint`, `npm run build`,
`/usr/bin/python3 -m pytest tests -q`; the full Playwright suite after every
UI-affecting commit and at the end.

## 7. Needs human decision / suggested next steps

1. **Resume for combined sessions** — decide whether the resume card should
   offer `#/combined/{courseId}/{scope}/{mode}`; this needs a small route/state
   change but no persisted-format change.
2. **Bookmark scope** — decide whether combined and single-exam bookmarks should
   share a namespace. This is a persisted-key change and must be versioned.
3. **Choice images in Arabic** — render them or document that choice images are
   Turkish-only.
4. **Storage hardening** — resolve writes on `tx.oncomplete`, reset `dbPromise`
   after a failed open, and make `finish()` idempotent. Each deserves its own
   failing test (needs an IndexedDB failure-injection helper).
5. **Corpus pipeline** — review `parse_all.classify` precedence and the two HTML
   walkers before the next corpus generation; they are intentionally untouched
   here.
6. **Attempt history** — `listAttempts` is implemented and tested but no screen
   uses it; either add a history view or remove it together with its tests.
