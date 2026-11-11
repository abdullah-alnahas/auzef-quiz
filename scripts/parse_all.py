#!/usr/bin/env python3
"""Parse every fetched exam, normalise its identity, and write canonical JSON.

Identity comes from the page's own <h1> (most authoritative), falling back to
the course-list anchor label. Content-identical exams are flagged as duplicates.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import fold, sha1, sha256_json  # noqa: E402
from parse_exam import parse, CACHE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
JSONDIR = ROOT / "output/.cache/json"

TYPE_TR = {"vize": "Vize", "final": "Final", "butunleme": "Bütünleme",
           "yaz-okulu": "Yaz Okulu", "uc-ders": "Üç Ders"}


def norm_label(s: str) -> str:
    s = s.replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip(" -–—")


def question_key(q: dict) -> tuple:
    """A question's identity that survives option reordering.

    Some pages republish an exam with the same stem, the same options and the
    same correct option, only shuffled. The letter alone would look different,
    so use the correct option's text, not its letter.
    """
    answer = next((fold(c["text"]) for c in q["choices"]
                   if c["letter"] == q.get("answer")), None)
    return (fold(q["stem"]),
            tuple(sorted(fold(c["text"]) for c in q["choices"])),
            answer)


def carry_translations(d: dict, old: dict) -> None:
    """Re-attach existing Arabic to a re-parsed page when Turkish is identical.

    parse_all rebuilds canonical JSON from HTML. Without this, every run would
    silently wipe `stem_ar` / `text_ar` / review notes until a merge, which is
    both slow and a data-loss footgun. Only exact stem + option matches are
    copied, so a changed question is never paired with a stale translation.
    """
    oldq = {q.get("n"): q for q in old.get("questions", [])}
    for q in d["questions"]:
        o = oldq.get(q["n"])
        if not o:
            continue
        if q["stem"] != o.get("stem"):
            continue
        if [(c["letter"], c["text"]) for c in q["choices"]] != \
                [(c.get("letter"), c.get("text")) for c in o.get("choices", [])]:
            continue
        if o.get("stem_ar"):
            q["stem_ar"] = o["stem_ar"]
        for c, oc in zip(q["choices"], o.get("choices", [])):
            if oc.get("text_ar"):
                c["text_ar"] = oc["text_ar"]
        if o.get("tables_ar"):
            q["tables_ar"] = o["tables_ar"]
        if o.get("review"):
            q["review"] = o["review"]
    if old.get("review_notes"):
        d["review_notes"] = old["review_notes"]


def classify(text: str):
    t = text.lower()
    if "üç ders" in t:
        return "uc-ders"
    if "yaz okulu" in t:
        return "yaz-okulu"
    if "büt" in t or "butunleme" in t:
        return "butunleme"
    if "final" in t:
        return "final"
    if "vize" in t or "ara sınav" in t:
        return "vize"
    return None


def period(text: str):
    m = re.search(r"(20\d{2})\s*[-–/]\s*(\d{2,4})", text)
    if m:
        a, b = m.group(1), m.group(2)
        if len(b) == 2:
            b = a[:2] + b
        return f"{a}-{b}"
    m = re.search(r"(20\d{2})", text)
    return m.group(1) if m else None


def ascii_fold(s: str) -> str:
    """Lowercase + Turkish-to-ASCII letters, keeping punctuation."""
    table = str.maketrans({
        "İ": "i", "I": "i", "ı": "i", "i": "i",
        "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g",
        "Ü": "u", "ü": "u", "Ö": "o", "ö": "o",
        "Ç": "c", "ç": "c",
    })
    return s.translate(table).lower()


def strip_course(title: str, course: str) -> str:
    t = norm_label(title)
    c = norm_label(course)
    if ascii_fold(t).startswith(ascii_fold(c)):
        t = t[len(c):].strip(" -–—:")
    # Titles often append a site suffix after a dash.
    t = re.split(r"\s+[–-]\s+(?:Auzef|AUZEF|Çocuk Gelişimi)", t)[0].strip()
    return t


def main() -> None:
    data = json.load(open(CONFIG / "exams.json", encoding="utf-8"))
    hashes = {}
    sigs = {}
    out = []
    parsed_cache = {}
    existing = {}
    for f in JSONDIR.glob("*__*.json"):
        try:
            old = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if old.get("source_url"):
            existing[old["source_url"]] = old
    for e in data["exams"]:
        path = CACHE / (sha1(e["url"]) + ".html")
        if not path.exists():
            e["status"] = "fetch_missing"
            out.append(e)
            continue
        try:
            d = parse(path, e["course"], e["course_slug"], e["label"], e["url"], "tmp")
            parsed_cache[e["url"]] = d
        except Exception as ex:  # noqa: BLE001
            e["status"] = f"parse_error: {ex}"
            out.append(e)
            print("PARSE FAIL", e["url"], ex, file=sys.stderr)
            continue

        title = strip_course(d["page_title"], e["course"])
        # A shared course page also lists exams for other programmes (e.g.
        # "Anatomi (TDS)" for Tıbbi Dokümantasyon). The corpus is the child
        # development programme, so a page that names another programme in its
        # own title is out of scope rather than a defective exam.
        if (re.search(r"\bTDS\b", d["page_title"])
                and "tds" not in e["course_slug"]):
            e.update({"status": "skipped_quality",
                      "quality_reason": "other_programme",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        ttype = classify(title) or classify(e["label"]) or e["type"]
        tper = period(title) or e["period"] or "unknown"
        # A "Vize Ve Final Soruları" page with no term is a unit-by-unit study
        # compilation, not a sitting of an exam. It spans many units with its
        # own numbering, so it is out of scope rather than a defective exam.
        if (re.search(r"vize\s+ve\s+final", title, re.I)
                and not re.search(r"\d{4}", title)):
            e.update({"status": "skipped_quality", "quality_reason": "compilation",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        # One consistent display form across courses; the slug carries identity.
        # When the page names no term, do not invent "unknown": drop the period.
        tname = f"{TYPE_TR.get(ttype, ttype.title())} Soruları"
        display = tname if tper == "unknown" else f"{tper} {tname}"
        slug = f"{ttype}-{tper}" if ttype != "unknown" else "exam"
        e.update({"label": display, "type": ttype, "period": tper,
                  "slug": slug, "page_title": d["page_title"],
                  "question_count": d["question_count"],
                  "answer_source": d["answer_source"],
                  "status": "parsed"})
        out.append(e)

    # Unique slugs per course; duplicate content detection.
    seen_slug = {}
    for e in out:
        if e.get("status") != "parsed":
            continue
        key = (e["course_slug"], e["slug"])
        n = seen_slug.get(key, 0) + 1
        seen_slug[key] = n
        if n > 1:
            e["slug"] = f"{e['slug']}-{n}"

    final = []
    for e in out:
        if e.get("status") != "parsed":
            final.append(e)
            continue
        d = parsed_cache[e["url"]]
        d["exam"] = e["label"]
        d["exam_slug"] = e["slug"]
        # A "Vize Soruları" page with no term can still be a unit question bank:
        # it interleaves true/false items ("Doğru / Yanlış / Cevap : ..."), unit
        # headings and dash separators inside what would be a single question.
        # That is a compilation, not an exam sitting, and translating it would
        # encode site structure as exam content.
        def compilation(q):
            for ln in q["stem"].split("\n"):
                t = ln.strip()
                if re.match(r"^(?:Cevap|CEVAP)\s*:", t):
                    return True
                if t in ("Doğru", "Yanlış"):
                    return True
                if re.fullmatch(r"-{5,}", t):
                    return True
            return False
        if any(compilation(q) for q in d["questions"]):
            e["status"] = "skipped_quality"
            e["quality_reason"] = "compilation"
            final.append(e)
            continue
        chash = sha256_json(d["questions"])
        if chash in hashes:
            e["status"] = "duplicate_content"
            e["duplicate_of"] = hashes[chash]
            final.append(e)
            continue
        # Structural quality gate: only well-formed exams enter the corpus.
        # A page defect isolated to one or two questions (e.g. a single option
        # where the site lost the rest) should not discard a whole good exam:
        # drop those questions, renumber what remains, and record them in
        # omitted_questions so the loss stays auditable.
        nums = [q["n"] for q in d["questions"]]
        # Some legacy pages skip a number (26 -> 28), repeat a label out of
        # order (13 in place of 36) or otherwise mislabel the page's own
        # numbering. Question order on the page is the order we keep; the
        # label is site metadata, so close the gaps, renumber 1..n and record
        # the page's original numbering for audit. A page whose numbers are
        # genuinely repeated is left alone: that could hide a parse defect.
        if nums:
            dup = sum(c - 1 for c in Counter(nums).values() if c > 1)
            if (nums != list(range(1, len(nums) + 1))
                    and dup <= max(1, len(nums) // 10)):
                d["source_numbers"] = nums
                for i, q in enumerate(d["questions"], 1):
                    q["n"] = i
                nums = [q["n"] for q in d["questions"]]
        numbering_ok = bool(nums) and len(nums) == len(set(nums)) \
            and nums == list(range(1, len(nums) + 1))
        if numbering_ok:
            def malformed(q):
                letters = [c["letter"] for c in q["choices"]]
                # A missing option letter (A,B,D,E or A,C,D,E) means the page
                # collapsed one option into another line or lost its label. The
                # remaining text cannot be split without guessing, so the
                # question is dropped rather than reconstructed.
                return (not (4 <= len(q["choices"]) <= 5)
                        or letters != list("ABCDE"[:len(letters)])
                        or len(q["stem"]) < 10)

            def defect(q):
                letters = [c["letter"] for c in q["choices"]]
                if not (4 <= len(q["choices"]) <= 5):
                    return "choice_count"
                if letters != list("ABCDE"[:len(letters)]):
                    return "option_letters"
                return "short_stem"
            dropped = [q for q in d["questions"] if malformed(q)]
            limit = max(1, len(d["questions"]) // 10)
            if dropped and len(dropped) <= limit and len(d["questions"]) - len(dropped) >= 5:
                d["omitted_questions"] = [
                    {"n": q["n"], "reason": defect(q), "stem": q["stem"]}
                    for q in dropped]
                d["questions"] = [q for q in d["questions"] if not malformed(q)]
                for i, q in enumerate(d["questions"], 1):
                    q["n"] = i
                d["question_count"] = len(d["questions"])
                nums = [q["n"] for q in d["questions"]]
                e["omitted_questions"] = [q["n"] for q in dropped]
                e["question_count"] = d["question_count"]

        bad = []
        if not d["questions"]:
            bad.append("no_questions")
        if len(nums) != len(set(nums)) or nums != list(range(1, len(nums) + 1)):
            bad.append("numbering")
        if any(not (4 <= len(q["choices"]) <= 5) for q in d["questions"]):
            bad.append("choice_count")
        if any([c["letter"] for c in q["choices"]]
               != list("ABCDE"[:len(q["choices"])]) for q in d["questions"]):
            bad.append("option_letters")
        if any(len(q["stem"]) < 10 for q in d["questions"]):
            bad.append("short_stem")
        if bad:
            e["status"] = "skipped_quality"
            e["quality_reason"] = ",".join(bad)
            final.append(e)
            continue
        # A page that republishes another exam with shuffled questions/options
        # still has the same content. Keep the first (newest term) and record
        # the other as a duplicate; translation is by content, so nothing is
        # lost by dropping the copy.
        sig = tuple(sorted(question_key(q) for q in d["questions"]))
        prev = sigs.get((e["course_slug"], sig))
        if prev:
            e["status"] = "duplicate_content"
            e["duplicate_of"] = prev
            e["quality_reason"] = f"same_questions_as:{prev}"
            final.append(e)
            continue
        sigs[(e["course_slug"], sig)] = f"{e['course_slug']}/{e['slug']}"
        hashes[chash] = f"{e['course_slug']}/{e['slug']}"
        d["content_hash"] = sha256_json(d["questions"])
        if e["url"] in existing:
            carry_translations(d, existing[e["url"]])
        JSONDIR.mkdir(parents=True, exist_ok=True)
        (JSONDIR / f"{e['course_slug']}__{e['slug']}.json").write_text(
            json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        final.append(e)

    # A skipped page can share (course, type, period) with a real exam, e.g.
    # "Anatomi 2020 Vize" (TDS) next to "Anatomi 2020 Vize". Slugs are only
    # allocated for parsed exams, so give the skipped twin a distinct one:
    # identity stays unambiguous and it can never claim the real exam's JSON.
    used = {(e["course_slug"], e["slug"]) for e in final
            if e.get("status") == "parsed"}
    for e in final:
        if e.get("status") != "skipped_quality" or not e.get("slug"):
            continue
        base = e["slug"]
        n = 1
        while (e["course_slug"], e["slug"]) in used:
            n += 1
            e["slug"] = f"{base}-skip{n}" if n > 1 else base
        used.add((e["course_slug"], e["slug"]))

    (CONFIG / "exams.json").write_text(
        json.dumps({"exams": final, "skipped": data["skipped"]},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    keep = {f"{e['course_slug']}__{e['slug']}.json" for e in final
            if e.get("status") == "parsed"}
    for f in JSONDIR.glob("*__*.json"):
        if f.name not in keep:
            f.unlink()

    print("status:", dict(Counter(e.get("status") for e in final)))
    print("questions:", sum(e.get("question_count", 0) for e in final))
    for e in final:
        if e.get("status") != "parsed":
            print("  !", e.get("status"), e["url"], file=sys.stderr)


if __name__ == "__main__":
    main()
