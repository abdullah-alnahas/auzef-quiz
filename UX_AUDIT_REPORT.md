# UI/UX 360° Audit & Remediation — auzef-quiz

**Run:** `2026-11-12T14:45:00Z` · **Framework:** `ux-audit-framework-v2` (v2.0) · **Config:** `ux-audit.config.yaml`
**Baseline build:** `8f9a484` (main) · **Re-audited build:** `c32837e` (branch `audit/ux-v2`)
**Machine-readable:** `ux-audit.findings.json` (current) · `ux-audit.baseline.json` (first-run snapshot)
**Patches (not applied):** `ux-audit-patches/*.patch` · **Evidence captures:** `ux-audit-evidence/*.png`

**Gate verdict: PASS.** No NEW or REGRESSED Critical is open. All three baseline Criticals are closed:
`I18N-03` fixed, `STA-03` and `A11Y-02` had their blocking symptom fixed and their residual downgraded
(Major / Minor) with a tracked Tier-B patch. 45 PASS · 21 FAIL · 20 N-A · 3 NEEDS-HUMAN · 1 BLOCKED-TEST.

---

## 1. Run summary (§5.2)

| Field | Value |
|---|---|
| audited_templates | 11 — home, course, quiz-practice, quiz-exam, combined, results, navigator dialog, submit dialog, destructive dialog, unknown-route error, offline error |
| rules_evaluated | **90** (the full catalog: every conditional module evaluated for applicability) |
| results | PASS **45** · FAIL **21** · N-A **20** · NEEDS-HUMAN **3** · BLOCKED-TEST **1** · WAIVED 0 |
| fails_by_severity (current) | Critical **0** · Major **8** · Minor **13** · Advisory **0** |
| fails_by_severity (baseline) | Critical **3** · Major **13** · Minor **13** · Advisory **0** |
| baseline | new_critical 0 · existing_critical 3 (2 downgraded, 1 fixed) · regressed 0 · **fixed_since_last_run 8** |
| gate | **PASS** |
| next_actions (by priority_score) | A11Y-04, ERR-02, STA-03, A11Y-03, ERR-01, STA-02, STA-04, VIS-02, CNT-03, THM-01, I18N-01, IA-03 |

**Scope matrix executed:** viewports 320 / 390 / 768 / 1280 · themes light, dark and system · locales
`ar` (RTL, default) and `tr` (LTR) · role anonymous (the only role) · data states loading, empty, error,
content · network online and offline (service-worker cache) · reduced-motion on/off · 200 % text size ·
injected text-spacing · +40 % text expansion.

**Product facts confirmed at runtime:** 10 courses · 335 exams · 6,322 questions · no accounts, no backend,
no payments, no consent, no media, no tables and **no content images** in the shipped corpus.

### Lab vs field (§0.5)

All performance verdicts are **lab proxies** (`MED` confidence): there is no CrUX/RUM for this static
GitHub-Pages app. LCP 440 ms, CLS 0.000, click→paint 13 ms on an unthrottled desktop Chromium. Field p75
is **BLOCKED-TEST** (see §8); nothing here should be read as a field Core Web Vitals claim.

---

## 2. Prioritized findings

Priority = `severity_weight × affected_templates × flow_weight` (§1.3). Severity weights 8/4/1, flow
weights T1=3, T2=2, T3=1. The formula deliberately lets a broad Minor outrank a narrow Major; release
decisions below still use severity first.

| # | Rule | Severity | Priority | Verdict | Evidence (reproducible) | Disposition |
|---|---|---|---|---|---|---|
| 1 | **A11Y-04** Keyboard operability | Major | 48 | FAIL | After home→course→quiz→results `document.activeElement` is `BODY` every time; 12/12 controls reachable, 0 traps, 0 positive tabindex — only route-change focus fails (`audit/checks.mjs` §3) | Tier B `02` |
| 2 | **ERR-02** Recovery-oriented errors | Major | 48 | FAIL | `#/nope`, `#/results/99999`, `#/course/missing` → bare `حدث خطأ`, 0 buttons/links in `<main>`; aborted manifest → exam-specific "not downloaded" message, no retry | Tier B |
| 3 | **STA-03** Scoped recoverable error | Major (was Critical) | 48 | FAIL | IDB blocked → infinite `جارٍ التحميل…` (fixed, see §4); residual: fatal manifest load has wrong copy + no retry | Tier A + B |
| 4 | **A11Y-03** Colour and contrast | Major | 36 | FAIL | Dark `.choice-letter` `#fff` on `#8fd3a6` = **1.74:1**, on `#f0a3a3` = **2.01:1**; dark `.danger` 2.01:1; control boundary `#dcdad2`/`#353a33` on surface = **1.40:1** (light + dark) | Tier B `01` |
| 5 | **ERR-01** Destructive actions | Major | 24 | FAIL | Home's "remove downloads" dialog reuses the exam-scoped string "delete the downloaded content **for this exam**" while deleting every exam; exam-removal dialog never names the exam | Tier B `04` |
| 6 | **STA-02** Empty state | Major | 24 | FAIL | Search `zzzzzz` → "لا توجد امتحانات منزَّلة" (wrong state) with no clear action; results filter with 0 matches → empty list, no message | Tier B `03` |
| 7 | **STA-04** Special states | Major | 24 | FAIL | Offline (SW cache) works but shows no offline indicator (`banner=null`, `navigator.onLine=false`); 404 screen has no search/home action | Tier B |
| 8 | **VIS-02** Readable typography | Minor | 18 | FAIL | Longest question line ≈656 px @16.32 px ≈ **80 ch** (>75); 16 distinct rem sizes, no scale; smallest label 13.12 px | Tier B |
| 9 | **CNT-03** Outcome microcopy | Minor | 18 | FAIL | Language toggle named only "Türkçe"/"العربية" (no action, no `aria-label`); navigator dialog's only exit is labelled "Cancel" | Tier B |
| 10 | **THM-01** Theming | Minor | 18 | FAIL | Stored dark + system light: first paint `rgb(247,246,242)` then `rgb(21,23,20)` — theme applied in `useEffect` after async IDB read, no pre-paint script | Tier B `05` |
| 11 | **I18N-01** Externalized strings | Minor | 18 | FAIL | 2 hardcoded literals: `"Türkçe"/"العربية"` and `"×"` (`src/app.tsx:74,96`); ~110 other strings are catalogued | Tier B |
| 12 | **IA-03** Findability at scale | Major | 12 | FAIL | Largest course has **50** exam cards; course view has scope toggles + period grouping but no search/filter/sort (home does have course search) | Tier B |
| 13 | **I18N-02** Locale-aware formatting | Minor | 12 | FAIL | 0 `Intl.*` uses; counts interpolated raw (`{total} امتحانًا`, `1 من 20`, `87%`). No dates/currency/units are shown | Tier C |
| 14 | **A11Y-02** Name, role, value | Minor (was Critical) | 9 | FAIL | Dangling `aria-labelledby="question-text"` fixed; residual: storage-banner dismiss button's accessible name is literally `×` | Tier A + B |
| 15 | **VIS-04** Iconography | Minor | 6 | FAIL | Mixed text glyphs: ★/☆ ▦ →/← ✓/✗ – ×, sizes 0.62–1.15 rem; `▦` is not a standard "question map" metaphor | Tier B |
| 16 | **DS-04** Cross-screen consistency | Minor | 6 | FAIL | One string (`deleteConfirm`) serves two blast radii (one exam vs all downloads) | Tier B `04` |
| 17 | **USA-01** Dominant action | Minor | 3 | FAIL | Active scope chips reuse `.primary`, so `.test-all` shows 3 primary-looking controls beside the real CTA `تدريب` | Tier B |
| 18 | **IXD-04** Cancelability | Minor | 3 | FAIL | Course-wide download (up to 50 exams, sequential) has no stop/cancel | Tier B |
| 19 | **FRM-02** Visible labels | Minor | 3 | FAIL | Search field's only visible label is its placeholder; the real `<label>` is `.visually-hidden` | Tier B |
| 20 | **TRU-02** Credibility hygiene | Minor | 3 | FAIL | 0 broken links/placeholders, but no privacy note and no contact/support path anywhere | Tier C |
| 21 | **DS-05** Drift enforcement | Minor | 3 | FAIL | CI runs `npm test` + `npm run build` only; no stylelint/token/e2e gate | Tier B |

### The three baseline Criticals

| Rule | What was actually broken | Proof |
|---|---|---|
| **I18N-03** RTL / bidi | Arabic is the default market. Turkish exam names that start with a year were **reordered** inside RTL paragraphs: `2022-2023 Bütünleme Soruları` rendered as `Bütünleme Soruları 2022-2023`, and `من 2022-2023 Vize Soruları` as `Vize Soruları 2023-2022 من`. The exam/year is the primary navigation datum on home, course, quiz and results. | `ux-audit-evidence/i18n03-*-before.png` vs `-after.png`; line 1 fragmented into 5 boxes (33/5/41/6/41 px) before, and the first name became one 126 px run after |
| **STA-03** Error state | If IndexedDB was unavailable (private mode, storage policy, quota), `loadPrefs()` rejected and aborted the startup IIFE **before** `loadManifest()`. The app stayed on `جارٍ التحميل…` forever: no content, no error, no retry. Total Tier-1 block. | `IDBFactory.open` override → baseline `hasCourses:false`, `hasLoading:true` |
| **A11Y-02** Name/role/value | `article.question` and `ul.choices` pointed `aria-labelledby` at `#question-text`, which **did not exist**. Screen readers got an unnamed question group and an unnamed answer list on the core quiz screen (WCAG 4.1.2). | axe `aria-valid-attr-value` review item + `getElementById('question-text') === null` |

---

## 3. Re-audit: NEW / REGRESSED / FIXED

| Bucket | Count | Rules |
|---|---|---|
| **FIXED** | 8 | I18N-03, A11Y-01, A11Y-09, A11Y-10, IA-04, IXD-02, FBK-01, OVL-01 |
| **NEW** | 0 | — |
| **REGRESSED** | 0 | — |
| Downgraded, still open | 2 | STA-03 Critical→Major, A11Y-02 Critical→Minor |
| Unchanged | 19 | the remaining FAILs in §2 |

Re-audit evidence: axe matrix re-run on 48 route × locale × theme × viewport combinations
(0 violations, `aria-valid-attr-value` review item gone); full tab walks; 320/768/1280 reflow;
text-spacing; 200 % text; +40 % expansion; delayed-download; dialog focus; IDB-blocked; offline;
manifest/exam abort; history/reload; LCP/CLS/interaction timing. **No regression found.**

Gate: **PASS** — 0 NEW/REGRESSED Critical, 0 open Critical, 0 expired waiver (no waivers granted).

---

## 4. Tier A — applied (8 commits, one logical fix each)

Every commit passed `npm run lint` + `npm test` before commit, and the whole batch passed
`npm run build` + `npx playwright test -c playwright.local.config.ts` (16/16).

| Commit | Rule | Change | Verified by |
|---|---|---|---|
| `3893a7a` | STA-03 | `fix(app): keep loading when IndexedDB is unavailable` — catch the prefs rejection, show the storage banner, continue to the manifest | IDB-blocked run: 10 courses render, no infinite loading |
| `83fd9a5` | A11Y-02 | `fix(a11y): point question aria-labelledby at the real question text` — `RichTextView` accepts `id`; Turkish question block provides `id="question-text"` | both references `resolved:true`; axe review item gone |
| `d2a6824` | I18N-03, A11Y-01 | `fix(i18n): isolate Turkish course and exam names in the Arabic RTL UI` — `<bdi lang="tr">` on every Turkish data value, `DataValue` helper for interpolated sentences | before/after screenshots; 7 bdi nodes on the combined screen |
| `d5b2fad` | I18N-03 | `fix(i18n): mirror the back arrow in RTL` — one `backArrow(lang)` helper used by course, quiz and results | course/results show `→` in Arabic, `←` in Turkish |
| `402bc9b` | IA-04 | `fix(a11y): give every route a distinct document title` | home `مذاكرة AUZEF`; course `Anatomi — مذاكرة`; quiz `2022-2023 Bütünleme Soruları — مذاكرة`; results `النتيجة — مذاكرة` |
| `6eb7ddf` | A11Y-09, FBK-01, IXD-02 | `fix(a11y): acknowledge downloads immediately and announce progress` — in-flight state before the first await, disabled row, polite live region | at **48 ms** button = `جارٍ التنزيل…`, disabled, live text announced |
| `577da68` | A11Y-10 | `fix(a11y): meet the 24px target-size floor for disclosure summaries` | Turkish `<summary>` 22 px → **26 px** |
| `c32837e` | OVL-01 | `fix(a11y): return focus to the trigger when a dialog closes` | Esc on home reset → focus `مسح التقدّم`; navigator → `خريطة الأسئلة` |

**Bundle impact:** initial JS 18.23 kB → **18.68 kB gzip** (+0.45 kB, +2.5 %; budget 60 kB). CSS 2.84 kB →
2.85 kB gzip (budget 10 kB). No test was weakened or skipped; no `public/data` file was touched; the
scraper pipeline was never run.

---

## 5. Tier B — proposed, **not applied**

Ready-to-apply unified diffs in `ux-audit-patches/` (all five apply with `git apply --check` and pass
`npm run lint` when applied alone; they were then reverted):

| Patch | Rules | What it does |
|---|---|---|
| `01-a11y03-contrast-tokens.patch` | A11Y-03, THM-01 | Adds `--control-border`, `--on-ok`, `--on-bad`; uses them on `.secondary`, `.icon-button`, `.search input`, `.field select`, `.danger`, `.choice-letter`. New pairs: 3.11–3.63:1 boundaries, 6.52–9.68:1 text on ok/bad fills |
| `02-a11y04-route-focus.patch` | A11Y-04 | Focuses `<main tabindex="-1">` on hash route change (skips first render, `preventScroll`), adds `.app-main:focus { outline: none }` |
| `03-sta02-empty-states.patch` | STA-02 | Adds `noSearchResults` / `clearSearch` / `noReviewItems` / `showAllQuestions` in both catalogs and an `.empty-state` block on home + results |
| `04-err01-confirm-copy.patch` | ERR-01, DS-04 | New `deleteAllDownloads` string for the clear-everything dialog; the exam-removal dialog now names the exam |
| `05-thm01-prepaint-theme.patch` | THM-01 | Pre-paint inline script reading a mirrored `auzef.theme` localStorage key; `setPref`/`loadPrefs` keep the mirror in sync |

Described but not patched (need design or product input):

- **A11Y-03** also needs a decision on `.choice` card borders (1.40:1) — only the *control* boundaries are in patch `01`.
- **IA-03** — exam filter above the course list (reuse the home search pattern) + guided no-results.
- **ERR-02 / STA-03 / STA-04** — specific copy + `Go home` / `Search courses` on unknown-route, missing-attempt and missing-course; `Retry` on fatal manifest load; offline banner driven by `online`/`offline` events.
- **A11Y-02 residual** — localize a `Dismiss` label for the storage-banner `×` button.
- **CNT-03 / I18N-01** — move the two toggle literals into the catalog and add `aria-label="Switch language to Turkish/Arabic"`; rename the navigator dismissal to `Close`.
- **VIS-02** — 6-step type scale and a 65 ch cap inside question/review cards.
- **VIS-04** — one inline-SVG icon set (grid icon for the navigator).
- **USA-01** — a distinct `[aria-pressed="true"]` chip style instead of `.primary`.
- **IXD-04** — stop control for bulk download.
- **FRM-02** — persistent visible label for the search field.
- **DS-05** — stylelint token allow-list + e2e in CI.
- **MOB-03** — `viewport-fit=cover` + safe-area padding once a device pass is possible.

---

## 6. Tier C — escalated (never auto-changed)

| # | Question | Why it is not an engineering call | Owner |
|---|---|---|---|
| C1 | **TRU-02** Do you need a privacy note and a contact/support path for AUZEF students? | Legal/product decision. The app stores attempts and bookmarks locally and transmits nothing, so the exposure is small but non-zero (students may expect a data statement). | product + counsel |
| C2 | **I18N-02** Should Arabic UI counts use Arabic-Indic digits (٠١٢) or ASCII digits? | Localization strategy: `Intl.NumberFormat('ar')` would switch every count to ٠١٢, which many AUZEF students may not expect in a Turkish-source exam context. Decide before adopting `Intl`. | product + Arabic reviewer |

No pricing, consent, notification or auth flows exist, so no other C-tier decision was triggered.

---

## 7. NEEDS-HUMAN (3)

| Rule | Question | Owner |
|---|---|---|
| **IA-02** | Do students read `محاكاة الامتحان` / `Sınav simülasyonu` as the real exam mode and `تدريب` as untimed practice, without a tree test? (0 denylist hits found.) | product + one Arabic-speaking student |
| **MOB-01** | On a 390×844 phone held one-handed, are Next/Previous and the five answer rows comfortable to reach without regripping? | design + one-handed device pass |
| **COG-01** | Is a 50-card course list with three repeated actions per card acceptable, or should the default view collapse to periods/units with one `start` action? | product + design |

---

## 8. BLOCKED-TEST (1) and evidence gaps

| Item | Why it could not run | What would unblock it |
|---|---|---|
| **MOB-03** safe areas / on-screen keyboard | Playwright cannot emulate notch `env(safe-area-inset-*)` or the virtual keyboard. | One pass on a real notched iOS/Android device in standalone PWA mode, portrait + landscape, keyboard open on the search field. |
| PRF field p75 (LCP/INP/CLS) | No RUM/CrUX for this static app; lab only (`MED`). | Ship a privacy-safe `web-vitals` beacon or accept lab proxies permanently (record as a waiver). |
| Screen-reader confirmation of names/pronunciation | No NVDA/VoiceOver/TalkBack in this environment; names were sampled from the accessibility tree instead. | One NVDA + one VoiceOver pass over home → course → quiz → results, including the Turkish/Arabic passages fixed in `d2a6824`. |

---

## 9. Tools and commands actually run

Environment: Chromium **158.0.8127.18** via Playwright **1.65.0**, axe-core **4.14.0**, Node 22, Linux.
App served by `npx vite preview --port 4473 --strictPort` (isolated from the parallel agent's 4173).
Audit drivers live in the untracked `audit/` directory (`collect.mjs`, `checks.mjs`, `checks2.mjs`,
`checks3.mjs`, `checks4.mjs`, `bidi-test.mjs`, `bidi-fix-test.mjs`, `gen-findings.mjs`).
`playwright.local.config.ts` and `audit/` are deliberately untracked so the repo keeps its single
4173 Playwright config. To reproduce, create `playwright.local.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", timeout: 45_000, fullyParallel: false, workers: 1, retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4473", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npx vite preview --port 4473 --strictPort",
    url: "http://localhost:4473", reuseExistingServer: false, timeout: 120_000,
  },
});
```

and run `npm run test:e2e -- -c playwright.local.config.ts` with port 4473 free.

| Command | Result |
|---|---|
| `npm run build` (baseline, 8f9a484) | pass — JS 53.67 kB / **18.23 kB gzip**, CSS 2.84 kB gzip |
| `npm test` (baseline and after each commit) | **50/50 passed**, 5 files |
| `npm run lint` (baseline and after each commit) | pass (tsc `--noEmit`) |
| `npx playwright test -c playwright.local.config.ts` (baseline) | **16/16 passed** (38.9 s) |
| `npx playwright test -c playwright.local.config.ts` (after batch) | **16/16 passed** (37.9 s) |
| `npm run test:e2e -- -c playwright.local.config.ts` (final tree) | **16/16 passed** (37.7 s) |
| `node audit/collect.mjs` | 48 axe runs (6 routes × ar/tr × light/dark × 390/1280) — **0 violations**; review items `color-contrast`, `label-content-name-mismatch`; `aria-valid-attr-value` present before the fix, gone after |
| `node audit/checks.mjs` | tab walks (4 routes + dialogs), reflow 320/768/1280, text-spacing, +40 % expansion, IDB-blocked, manifest abort, unknown route, offline, download progress, theme flash, history, LCP/CLS/interaction |
| `node audit/checks2.mjs` | Turkish target sizes, dark danger contrast, stored-dark flash, 3 s delayed download, storage-write failure banner, quiz reachability parity, keyboard answer, bidi DOM scan, search no-results, aria-ref resolution, bulk download |
| `node audit/checks3.mjs` | download/bulk progress with SW blocked, missing-exams bidi + screenshot, 320↔1280 feature parity, primary-emphasis count, chars-per-line, WCAG contrast table for every token pair |
| `node audit/checks4.mjs` | results empty filter, resume-card/from-exam bidi, 200 % text, control-boundary computed colours, 30 baseline screenshots |
| `node audit/bidi-fix-test.mjs` / `bidi-fix-test` variants | prove the `<bdi>`/FSI fix changes glyph order (line-box fragmentation 5 → 1 run) |
| `node audit/gen-findings.mjs` | emits `ux-audit.findings.json` + `ux-audit.baseline.json`; asserts 90 unique rule IDs |
| `for f in ux-audit-patches/*.patch; do git apply "$f" && npm run lint; git checkout -- .; done` | all 5 patches apply and typecheck |
| `npm run build` (final) | pass — JS 55.34 kB / **18.68 kB gzip** |

Not available / not used: Lighthouse, WebPageTest, jscpd, stylelint, CrUX, real devices, screen readers.

---

## 10. What a next iteration should do

1. Apply patch `01` (contrast) — it is the only remaining **WCAG AA** failure with user-visible impact in the dark theme.
2. Apply patches `03` + `04` + the error-screen copy — these are pure copy/UX and remove three of the eight Majors.
3. Apply patch `02` (route focus) after a design nod, then re-run the Quick Pass.
4. Decide C1/C2 and add the privacy/contact surface, then re-audit TRU-02 / I18N-02.
5. Add a device + screen-reader pass to close MOB-03 and the three NEEDS-HUMAN items.

### Quick Pass status after remediation

| Check | Result |
|---|---|
| A11Y-02 names/roles/values | PASS after `83fd9a5`; one residual Minor (`×`) |
| A11Y-03 contrast in every theme | **FAIL** — Tier-B patch `01` |
| A11Y-04 keyboard, no traps | PASS on reachability/traps; route-change focus **FAIL** (Tier B `02`) |
| A11Y-05 focus visible/not obscured | PASS (0/75 invisible, 0 obscured) |
| A11Y-06 form errors | N-A (no validated forms) |
| A11Y-07 reflow / no zoom lock | PASS (320 px, 200 % text, text-spacing) |
| A11Y-10 target size / gestures | PASS (26 px minimum after `577da68`) |
| OVL-01 dialogs | PASS after `c32837e` |
| RES-01 no page overflow | PASS at 320/768/1280 |
| FRM-05 failed submit keeps data | PASS (no forms; quiz state persists) |
| ERR-01 irreversible actions confirmed | **FAIL** — dialogs exist but do not name the object (Tier B `04`) |
| NAV-04 no traps/dead ends | PASS (header brand is always an exit) |
| AUT-01 login | N-A (no login) |
| TRU-04 dark patterns | PASS (0 instances) |
