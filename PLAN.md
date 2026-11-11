# PLAN — lolonolo AUZEF scraper → bilingual Markdown (Phase 1)

Status: **awaiting approval**. No request to lolonolo.com has been made.

## 0. What I verified locally (no target traffic)

- Obscura **0.2.6** at `/home/abdullah/Documents/hdd/notebook/obscura` (render build, ~80 MB). No local README in the folder, so I read `--help` for every subcommand plus the upstream README.
- Subcommands: `fetch`, `scrape`, `serve` (CDP), `mcp`. JS runs in V8; `--stealth`, `--obey-robots`, `--storage-dir`, `--user-agent`, `--wait-until`, `--wait`, `--selector`, `--timeout`, `--concurrency`, `--dump {html,text,links,markdown,original,assets,cookies}`.
- **Smoke test passed**: started `obscura serve` on a local port and connected with Playwright `connect_over_cdp`. Verified: JS execution, `page.title()`, DOM text, `set_extra_http_headers()`, and UA override.
- Gaps found (documented, not assumed away):
  - No CLI flag for **arbitrary request headers** → set them over CDP (`Network.setExtraHTTPHeaders`) via Playwright. Confirmed working.
  - No built-in **rate limiter / retry / backoff** → implemented in the driver.
  - No explicit "session" object on the CLI; cookies live in the browser context, `--storage-dir` persists them. I will keep **one context for the whole run** and verify cookie persistence on restart; if it doesn't persist, cookies are irrelevant here unless the site gates content (it would then be a stop condition).
  - `--obey-robots` covers `fetch`/`scrape` navigation, not CDP-driven `page.goto` → I check robots myself before starting and honor it manually.
  - No OCR/PDF text extraction → handled in our own pipeline (see risks).
- Tooling available: `/usr/bin/python3` 3.10 with BeautifulSoup 4.10, lxml, Playwright 1.56, Pillow; `jq`; 12 cores / 31 GB RAM / 1.4 TB free. System `python3` (3.14, Homebrew) lacks these libs, so all scripts pin `/usr/bin/python3`.

## 1. Obscura configuration

Launch (one server for the whole run):

```
obscura serve --port 9222 --workers 1 --host 127.0.0.1 \
  --stealth --obey-robots \
  --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" \
  --storage-dir output/.browser
```

| Setting | Value | Why |
|---|---|---|
| Rendering / JS | Always on; `goto(wait_until="domcontentloaded")` → `wait_for_load_state("networkidle")` (15 s cap) → `wait_for_selector(question container)` → 1.5 s settle | Content may be async; adaptive settle beats a blind sleep, but a fixed 1.5 s tail catches late XHR. |
| `--wait-until` | `domcontentloaded` (not `networkidle0`) at nav level | `networkidle0` throws on pages with long-poll/analytics beacons; idle is awaited separately with a cap. |
| Timeouts | nav 45 s, selector 15 s, global page budget 90 s | Exercise pages are small; 45 s absorbs slow origin without hanging the batch. |
| `--timeout` (nav) | 45 | Same as above, enforced by Playwright too. |
| User-Agent | Desktop Chrome 145 / Linux x86_64, pinned | Stable, matches the engine's own build; avoids mobile-layout branches. |
| Extra headers | `Accept-Language: tr-TR,tr;q=0.9,en;q=0.5`, `Accept: text/html,...`, `Referer` = current course page for exam pages, no `X-Forwarded-*` | Correct locale for Turkish content, honest referer chain, no forged identity. |
| Stealth | `--stealth` **on** | Only if the site rejects plain headless; a consistent fingerprint is harmless. Tracker blocking also cuts noise. |
| Session | One browser context reused; no login attempted; `--storage-dir` for cookie persistence | Keeps any session token/AB test bucket stable and avoids re-consent banners per page. |
| Concurrency | **N = 1** navigation at a time (`--workers 1`, one page) | See §3; assets load naturally inside that one page. |
| `--obey-robots` | On, plus a manual pre-flight check | Belt and braces. |
| Proxy | None | No need, and proxies would obscure the source IP for a site we're being polite to. |
| Viewport | 1440×1000 | Desktop layout; also used for table screenshots. |

## 2. Site discovery

Recon is **read-only and bounded**: index page + one course page + one exam page before writing the crawler, so selectors are derived from real markup rather than guessed.

1. **Seed**: `https://lolonolo.com/auzef/cocukgelisimi/`. Save raw HTML.
2. **Course resolution**: read the course index, extract every anchor; normalize Turkish text (uppercase → ASCII slug, `İ→i`, `ı→i`, `ş→s`, `ğ→g`, `ü→u`, `ö→o`, `ç→c`) and match against the 9 Phase-1 names. Exact match on normalized title first, then fuzzy (token overlap ≥ 0.8), then manual confirmation from the printed list. Anything ambiguous goes to `logs/skipped.jsonl` rather than being guessed.
3. **Exam enumeration** for each course page — union of all of:
   - anchors whose text/href matches `(vize|final|bütünleme|butunleme|yaz okulu|ara sınav|tek ders)` + 4-digit year;
   - pagination (`?page=`, `rel=next`, numbered pager);
   - tabs/accordions/dropdowns: if the exam list is client-side, click each tab / expand each accordion and collect links;
   - lazy loading: scroll to bottom, wait for network idle, repeat until link count stops growing (max 10 rounds);
   - `sitemap.xml` and, if WordPress, `/wp-json/wp/v2/...` **on the same domain only** — used purely to cross-check completeness, never as the primary extractor.
4. **Completeness check**: compare the union against (a) sitemap URLs under the course path and (b) the visible count if the site states one. Report any mismatch.
5. **Exam page fingerprinting**: one sample page determines the template (question container class, choice markup, answer-key presence). Store the resulting profile in `config/selectors.json`, keyed by a structural hash, and reuse it; re-fingerprint only when a page fails to parse.
6. **Exam identity**: parse type + year/term from the title, then from breadcrumb/URL. Slug rules: `vize-2023`, `final-2023`, `butunleme-2023`, `yaz-okulu-2023`; if the site distinguishes terms, append `-guz` / `-bahar`; collisions get `-2`, `-3`. Slug is derived from the **displayed** identity, not from URL guessing.

## 3. Politeness & compliance

- **robots.txt**: fetched first with a plain HTTP client, parsed for `User-agent: *` and our UA; if the course/exam paths are disallowed → **stop and report**, no override.
- **Terms**: scan the footer/`/kullanim-kosullari`, `/gizlilik` for explicit scraping restrictions; note findings in the report. If redistribution is prohibited, flag it and keep output local-only.
- **Rate**: 1 navigation in flight (N = 1). Delay 2.0 s ± 0.5 s jitter between navigations, 1.0 s between asset downloads; hard cap **30 requests/min**.
- **Retries**: max 3 per URL on timeout/429/5xx, backoff 5 s → 20 s → 60 s (+jitter), honoring `Retry-After`. On 401/403/407, CAPTCHA/interstitial, or a login form → **abort that course, log, continue to the next, report**.
- **No circumvention**: no proxy rotation, no CAPTCHA solving, no credential use. `--stealth` is used only to avoid trivial headless blocking, not to defeat an access control.
- **Scope**: only `lolonolo.com` + assets it serves (or its CDN if directly referenced). External links are recorded, never followed.
- Asset downloads reuse the browser's cookies and `Referer`; images are fetched only for questions that need them.

## 4. Extraction design

Primary path is **DOM text**, not screenshots. Order:

1. **Question segmentation**: candidate nodes are elements whose direct text matches `^\s*(Soru|SORU)?\s*\d{1,3}\s*[\.\)\-]`. Group by nearest common ancestor that also contains 2–5 choice-like children. Validate that extracted numbers are `1..n` with no gaps; if gaps/duplicates → try the alternate container (next most specific ancestor), then fall back to whole-page block splitting.
2. **Question stem**: text content of the stem node, normalized only for whitespace (NBSP → space, collapse runs, trim). **All wording, punctuation, typos, and casing preserved.** `<br>` → newline inside the stem.
3. **Choices**: children matching `^[A-E][\)\.\-]\s*` (also `A)` inside `<li>`, `<td>`, or `<div>`). Letter is taken from the markup, never assigned by position. If letters are absent but exactly 4–5 siblings exist, assign A..E **and** add `<!-- REVIEW: choice letters reconstructed from order -->`.
4. **4 vs 5 choices**: output exactly the letters present. Never synthesize E. If a question has 3 or 6+ choices → keep them, add `<!-- REVIEW: expected 4-5 choices, got N -->`.
5. **Answers**, in this priority order:
   a. explicit answer-key section/page linked from the exam (`Cevap Anahtarı`, `Yanıtlar`);
   b. inline `Cevap: X` / `Doğru Cevap: X` / `Answer: X`;
   c. markup signal (`.correct`, `.dogru`, `data-correct`, `input[checked]`, green/bold-only-on-one-choice);
   d. hidden accordion content that a click reveals (click once, then re-read);
   e. otherwise `UNKNOWN` — never inferred, never guessed.
   Cross-check: if ≥ 90 % of a page has answers from a key, any stragglers are marked `UNKNOWN` + REVIEW rather than pattern-matched.
6. **Multi-paragraph / case-based questions**: stem keeps newlines; a shared scenario block above a question group is attached to every question that references it (detected by repeated identical preamble text) and noted once. Long stems are not truncated.
7. **Tables**: converted to a Markdown table inline (row/col from `<tr>/<td>`, `colspan` expanded); additionally the table element is screenshotted to `assets/` and referenced, because a table can carry layout meaning. Marker `[TABLE]`.
8. **Math**: if MathJax/KaTeX is detected, capture the rendered text and the TeX source (`annotation[encoding="application/x-tex"]`) into `\( ... \)`; otherwise plain text with `<!-- REVIEW: math may be lossy -->`.
9. **Images**: `<img>` inside stem/choices → download original (`srcset` largest, `data-src`, lazy attrs), save as `assets/<course>/<exam>/<sha1>.<ext>`, reference relatively, and put `[IMAGE]` where it appeared. Decorative images (logo, icon, spacer, tracking pixel) are skipped by size/class heuristics. If download fails → `[IMAGE MISSING: <url>]` + REVIEW.
10. **Duplicates**: detect repeated question hashes within a page (some sites repeat questions across tabs); keep the first, log the rest.
11. **Raw preservation**: every fetched page is stored in `output/.cache/html/<sha1>.html` before parsing, so a parser bug never requires re-scraping.

## 5. Translation approach

- **Producer: me (the agent), not a machine-translation API.** TR→AR quality for law/psychometrics is the weak point of every off-the-shelf MT model, and the brief forbids silent guessing. Translation runs in batches of ~20 questions as JSON in → JSON out, with the glossary injected into the prompt.
- **Fallback (only if a batch fails repeatedly):** local `ollama` (`llama3:instruct`) as a draft, then a full manual pass. Not the default; its Arabic is not reliable enough for legal text. NLLB/`transformers` is rejected as too literal for the "not word-for-word" rule.
- **Glossary**: `output/glossary.json`, built on first occurrence and reused. Shape:
  ```json
  { "gelişim": {"ar": "النمو", "pos": "noun", "notes": ""},
    "ölçme ve değerlendirme": {"ar": "القياس والتقييم"} }
  ```
  Recurring terms are seeded before exam 1: gelişim, gelişimsel, bilişsel, duygusal, sosyal, dil, motor, ölçek, geçerlik, güvenirlik, madde, norm, yaş, dönem, çocuk, hak, hukuk, veli, öğretmen, oyun, terapi, tanı, davranış, beceri, kazanım, etc. The glossary is append-only and reviewed at the end of each course.
- **Rules enforced mechanically, not by trust**:
  - Turkish field is copied byte-for-byte from the parsed DOM (translation never writes into the TR field).
  - Arabic must be non-empty and ≥ 70 % Arabic-script characters.
  - Choice order and letters are never touched; answer letters never touched.
  - Numbers, years, article numbers, citations, initials, quoted titles preserved.
  - Proper nouns with no standard Arabic form are kept in Latin script (e.g. `Piaget` → `بياجيه` is standard, so translated; author names on a single article are kept with the Turkish in parentheses).
  - Uncertainty → `<!-- REVIEW: <reason> -->` immediately after the affected line. Never a silent guess.
- **Terminology check**: after each course, a validator lists glossary terms that appear in TR but whose Arabic equivalent is missing in AR; mismatches become REVIEW flags.

## 6. Output layout

```
output/
├── manifest.json
├── glossary.json
├── <course-slug>/
│   ├── vize-2023.md
│   ├── final-2023.md
│   └── ...
├── assets/<course-slug>/<exam-slug>/<sha1>.<ext>
├── logs/
│   ├── run-<timestamp>.log
│   ├── errors.jsonl
│   ├── skipped.jsonl
│   └── retries.jsonl
├── .cache/html/<sha1>.html
├── .cache/json/<exam-slug>.json      # parse result before rendering
├── .state/<course-slug>.json          # resume checkpoints
└── .browser/                          # Obscura storage-dir
config/selectors.json
config/courses.json                    # name → slug → URL
```

Slugs: `anne-baba-egitimi`, `cocuk-gelisimi-uygulamalari-i`, `cocuk-haklari-ve-hukuku`, `cocuklukta-yabanci-dil-olarak-turkce-ogretimi`, `ilkokula-hazirlik`, `okul-oncesi-donemde-duyu-egitimi`, `oyun-ve-oyun-terapisi`, `psikometrik-gelisimsel-olcme-ve-degerlendirme`, `sosyal-duygusal-gelisim`.

Exam file = exactly the specified front matter + `### Q{n}` blocks. Manifest entry:

```json
{ "course": "OYUN VE OYUN TERAPİSİ", "course_slug": "oyun-ve-oyun-terapisi",
  "exam": "Vize 2023", "exam_slug": "vize-2023",
  "source_url": "…", "file": "oyun-ve-oyun-terapisi/vize-2023.md",
  "question_count": 20, "answered_count": 18, "review_flags": 2,
  "status": "done", "scraped_at": "2026-11-11T22:40:00+03:00",
  "content_hash": "sha256:…" }
```

`status` ∈ `done | partial | failed | skipped`.

## 7. Validation & resume

Checks before declaring Phase 1 done (script `scripts/validate.py`, exit non-zero on failure):

1. Front matter parses; all 5 keys present; `question_count` == number of `### Q` blocks.
2. Question numbers are `1..n`, sequential, no duplicates (both by number and by normalized TR hash).
3. Every question has non-empty TR and AR; AR Arabic-script ratio ≥ 0.7; no Turkish-only letters (`ğ ı ş İ`) in AR unless inside a quoted proper noun (then must have REVIEW).
4. Choices: 4–5, letters sequential starting at A, every choice has TR and AR, no empty dash separator.
5. `Answer:` is a single letter present in the choices, or exactly `UNKNOWN`.
6. Every image reference resolves on disk; every `[IMAGE]` marker has a target; no orphan assets.
7. Manifest ↔ disk: every `done` entry has a file whose hash matches; every file has an entry; counts match.
8. Recompute question count from the cached parse JSON and compare to the rendered file.
9. Report: courses covered, exams found vs saved, total questions, answered vs UNKNOWN, failures, REVIEW flags — grouped by course and by reason.

**Resume**: each course is a checkpoint. `.state/<course>.json` records `{ discovered: [...], done: {url: sha1}, failed: [...] }`. On restart: skip exams whose file exists *and* whose cached hash matches; re-parse from `.cache/html` when the HTML is cached (zero network); only navigate for missing or explicitly `--refresh`ed pages. Per-exam atomic write (`.tmp` → rename) so a kill never leaves a half file. Browser/server restarts are safe because state is on disk, not in memory.

## 8. Risks & open questions

| Risk | Likelihood | Mitigation / stop condition |
|---|---|---|
| Site behind login / membership | Unknown | **Stop** per constraints, report which courses are gated. No credential use. |
| Anti-bot (Cloudflare/interstitial) | Medium | `--stealth` + real UA + human pacing. If challenge appears: stop that course, report; no solving. |
| Exam content is images/PDF scans | Medium | Detect empty DOM + PDF links; download PDFs and extract text; if scans, OCR needed. **Tesseract lacks `tur`/`ara` traineddata here** — I'd ask to install `tesseract-ocr-tur` (one command) rather than guessing. Flagged as a non-blocking dependency. |
| Answers not published | Medium | `UNKNOWN` per spec; report coverage so you can decide. |
| Site structure changes mid-run / per-course templates | Medium | Template fingerprint + per-exam fallback container + raw HTML cache. |
| robots.txt disallows paths | Unknown | Stop and report; no override. |
| Copyright / redistribution | Medium | Output stays local, personal study use, source URL attributed on every file. I will not publish. Flag if the site's terms forbid redistribution. |
| Translation volume/time | Certain | ~1.5–3 h for Phase 1 if ~150–250 exams; progress is per-exam so it can be paused. Batched translation with glossary. |
| Turkish OCR of proper nouns | Low | REVIEW flags. |

**Assumptions (state, don't ask):** "all available past exams" = every exam type/year listed for the course, no filtering; output root is `./output` inside this project; Phase 1 only, Phase 2 untouched; no login; answers only when published.

**Blocking questions (only these):**
1. **Approve the plan?**
2. If the site turns out to be **partly login-gated**, should I take the public subset and report, or stop entirely? (Default: public subset + report.)
3. If pages are **scanned images with no text layer**, may I install `tesseract-ocr-tur` (and `-ara` for QA)? (Default: ask before installing, then proceed.)

## 9. Execution order after approval

1. Pre-flight: robots.txt + terms + one seed fetch → print structure, confirm scope.
2. Course discovery → `config/courses.json` → show you the mapped list *before* bulk scraping (fast, cheap checkpoint).
3. One exam end-to-end (scrape → translate → render → validate) as a **golden sample** for your review.
4. Remaining exams, course by course, checkpointing after each.
5. Full validation + report; **stop** and wait for Phase 2 approval.

---

Stopping here. Nothing has been requested from lolonolo.com.
