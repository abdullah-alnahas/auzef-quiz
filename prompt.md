# ROLE
You are an autonomous coding agent running Step 1 of a 2-step project:
- **Step 1 (this task):** Scrape university past exams and produce bilingual (Turkish → Arabic) Markdown files.
- **Step 2 (later, separate task):** An offline-first PWA quiz app with instant color-coded feedback will consume your output. Your files must therefore be consistent and machine-parseable.

# SOURCE & TOOLING
- Source: https://lolonolo.com/auzef/cocukgelisimi/
- Browser: the installed **Obscura** (https://github.com/h4ckf0r0day/obscura). Read its local README/help output first to confirm its real capabilities (JS rendering, session/cookie handling, wait strategies, headers, concurrency). Do not assume features it doesn't document; if something you need is missing, say so in the plan and propose a fallback.

# SCOPE
**Phase 1 (do this first):** all available past exams for:
1. ANNE BABA EĞİTİMİ
2. ÇOCUK GELİŞİMİ UYGULAMALARI I
3. ÇOCUK HAKLARI VE HUKUKU
4. ÇOCUKLUKTA YABANCI DİL OLARAK TÜRKÇE ÖĞRETİMİ
5. İLKOKULA HAZIRLIK
6. OKUL ÖNCESİ DÖNEMDE DUYU EĞİTİMİ
7. OYUN VE OYUN TERAPİSİ
8. PSİKOMETRİK - GELİŞİMSEL ÖLÇME VE DEĞERLENDİRME
9. SOSYAL-DUYGUSAL GELİŞİM

**Phase 2:** all remaining courses on the portal. Do not begin until I explicitly approve Phase 1 results.

# APPROVAL GATE (STEP 0, MANDATORY)
Do NOT launch Obscura, make any network request to lolonolo.com, or run any scraping/translation script until I reply with explicit approval.
Allowed before approval: reading local files, Obscura's README/--help, and inspecting the project directory.

Deliver a plan containing:
1. **Obscura configuration:** each setting you'll use (rendering/JS wait, timeouts, user-agent, headers, session handling, concurrency) with a one-line justification.
2. **Site-discovery approach:** how you'll map course → exam list → individual exam pages, and how you'll detect all exams per course (pagination, tabs, dropdowns, lazy loading).
3. **Politeness & compliance:** check robots.txt and any visible terms of use; request delay/rate limit; retry/backoff policy; no more than N parallel requests (state N).
4. **Extraction design:** selectors or strategy for questions and choices; handling of images, tables, math, and multi-paragraph/case-based questions; handling of questions with 4 vs. 5 choices.
5. **Translation approach:** how Arabic translation will be produced (model/tool used), plus the quality rules below.
6. **Output layout:** folder tree and file naming (see below).
7. **Validation & resume:** checks you'll run and how interrupted runs resume without re-scraping.
8. **Risks & open questions:** anything that could block you (login walls, anti-bot, missing answer keys, copyright concerns). Ask only blocking questions; state assumptions for everything else.

Then stop and wait.

# OUTPUT SPECIFICATION (after approval)
## Layout
/output/{course-slug}/{exam-slug}.md  (e.g., vize-2023, final-2022, butunleme-2023)
/output/manifest.json   → every course, exam, source URL, question count, status, scrape timestamp
/output/logs/           → errors, skipped items, retries

## Per-exam file
Start with YAML front matter:
---
course: <Turkish course name>
exam: <type + year/term as shown on site>
source_url: <url>
question_count: <n>
scraped_at: <ISO date>
---

## Per-question format (use exactly this, numbered as on the source)
### Q{n}
**Question:** {Turkish original} | {Arabic translation}
**Choices:**
- A) {Turkish} — {Arabic}
- B) {Turkish} — {Arabic}
- C) {Turkish} — {Arabic}
- D) {Turkish} — {Arabic}
- E) {Turkish} — {Arabic}   *(only if present in source)*
**Answer:** {letter, only if the source provides it; otherwise `UNKNOWN`}

If a question contains an image or table, save the asset to /output/assets/ and reference it inline; add `[IMAGE]` markers rather than silently dropping content.

# TRANSLATION RULES
- Turkish text must be copied verbatim. Never correct, reword, or "clean up" the original.
- Arabic = Modern Standard Arabic, accurate and neutral, not word-for-word if that harms meaning.
- Use consistent terminology across all files for recurring domain terms (child development, psychometrics, law). Build and reuse a glossary at /output/glossary.json.
- Preserve numbers, names, citations, and formatting; do not translate proper nouns that have no standard Arabic form.
- Never alter which choice is correct, and never merge or reorder choices.
- If a translation is uncertain, add `<!-- REVIEW: reason -->` after that item instead of guessing silently.

# VALIDATION (run before reporting a phase complete)
- Every question has a Turkish and an Arabic part, and 4–5 choices with sequential letters.
- Question count matches the source page; no duplicates or truncated text.
- Arabic is non-empty and actually Arabic script (flag any leftover Turkish).
- Manifest entries match files on disk.
- Report: courses covered, exams found vs. exams saved, total questions, and a list of failures and REVIEW flags.

# CONSTRAINTS
- Stay within lolonolo.com/auzef/cocukgelisimi/ and its linked assets; no other domains.
- Don't bypass logins, paywalls, or CAPTCHAs; if hit, stop and report.
- Checkpoint after each course so the run can resume.
- When Phase 1 is complete, present the validation report and wait for approval before Phase 2.