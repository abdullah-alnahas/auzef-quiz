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
from discover import period_of  # noqa: E402
from parse_exam import parse, CACHE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
JSONDIR = ROOT / "output/.cache/json"

TYPE_TR = {"vize": "Vize", "final": "Final", "butunleme": "Bütünleme",
           "yaz-okulu": "Yaz Okulu", "uc-ders": "Üç Ders", "unite": "Ünite",
           "deneme": "Deneme"}


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


def question_defect(q: dict):
    """Why a question cannot enter the corpus, or None when it is usable."""
    letters = [c["letter"] for c in q["choices"]]
    if not (4 <= len(q["choices"]) <= 5):
        return "choice_count"
    if letters != list("ABCDE"[:len(letters)]):
        # A missing letter means the page collapsed two options onto one line;
        # the text cannot be split without guessing.
        return "option_letters"
    if len(q["stem"]) < 10:
        return "short_stem"
    return None


def normalise_numbering(doc: dict) -> list:
    """Close the page's own numbering gaps, recording the original labels."""
    nums = [q["n"] for q in doc["questions"]]
    if nums:
        dup = sum(c - 1 for c in Counter(nums).values() if c > 1)
        if (nums != list(range(1, len(nums) + 1))
                and dup <= max(1, len(nums) // 10)):
            doc["source_numbers"] = nums
            for i, q in enumerate(doc["questions"], 1):
                q["n"] = i
    return [q["n"] for q in doc["questions"]]


def apply_quality_gate(doc: dict):
    """Drop a small number of malformed questions, then list blocking defects.

    A defect isolated to one or two questions (the site lost an option) should
    not discard a whole good exam: those questions are dropped, the rest are
    renumbered, and the loss is recorded in `omitted_questions`. Returns
    (blocking_reasons, dropped_questions); mutates doc exactly as before.
    """
    nums = normalise_numbering(doc)
    numbering_ok = bool(nums) and len(nums) == len(set(nums)) \
        and nums == list(range(1, len(nums) + 1))
    dropped = []
    if numbering_ok:
        dropped = [q for q in doc["questions"] if question_defect(q)]
        limit = max(1, len(doc["questions"]) // 10)
        if (dropped and len(dropped) <= limit
                and len(doc["questions"]) - len(dropped) >= 5):
            doc["omitted_questions"] = [
                {"n": q["n"], "reason": question_defect(q), "stem": q["stem"]}
                for q in dropped]
            doc["questions"] = [q for q in doc["questions"]
                                if question_defect(q) is None]
            for i, q in enumerate(doc["questions"], 1):
                q["n"] = i
            doc["question_count"] = len(doc["questions"])
            nums = [q["n"] for q in doc["questions"]]
        else:
            dropped = []

    bad = []
    if not doc["questions"]:
        bad.append("no_questions")
    if len(nums) != len(set(nums)) or nums != list(range(1, len(nums) + 1)):
        bad.append("numbering")
    if any(not (4 <= len(q["choices"]) <= 5) for q in doc["questions"]):
        bad.append("choice_count")
    if any([c["letter"] for c in q["choices"]]
           != list("ABCDE"[:len(q["choices"])]) for q in doc["questions"]):
        bad.append("option_letters")
    if any(len(q["stem"]) < 10 for q in doc["questions"]):
        bad.append("short_stem")
    return bad, dropped


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


def ascii_fold(s: str) -> str:
    """Lowercase + Turkish-to-ASCII letters, keeping punctuation."""
    table = str.maketrans({
        "İ": "i", "I": "i", "ı": "i", "i": "i",
        "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g",
        "Ü": "u", "ü": "u", "Ö": "o", "ö": "o",
        "Ç": "c", "ç": "c",
    })
    return s.translate(table).lower()


def is_other_programme(page_title: str, course_slug: str) -> bool:
    """True when a shared course page lists another programme's exam.

    e.g. "Anatomi (TDS)" (Tıbbi Dokümantasyon) appears on the Anatomi page.
    """
    return bool(re.search(r"\bTDS\b", page_title)) and "tds" not in course_slug


def is_mock_page(page_title: str) -> bool:
    """A "Deneme" / "Online Test" page is a mock, never a past exam sitting."""
    return bool(re.search(r"\bdeneme\b|online\s+test", page_title, re.I))


def is_unit_page(page_title: str) -> bool:
    """A unit-by-unit set is out of scope, even if cross-listed as an exam."""
    return bool(re.search(r"\bünite\b", page_title, re.I))


def is_compilation_title(title: str) -> bool:
    """A term-less "Vize Ve Final Soruları" page is a unit study compilation."""
    return bool(re.search(r"vize\s+ve\s+final", title, re.I)) \
        and not re.search(r"\d{4}", title)


def is_compilation_body(questions: list) -> bool:
    """A unit question bank interleaves true/false items and dash separators."""
    for q in questions:
        for line in q["stem"].split("\n"):
            text = line.strip()
            # True/false items and dash separators are the reliable signals of
            # a unit question bank. "Cevap :" alone is not: some legacy pages
            # embed it in a normal stem when their options use lowercase a-e.
            if text in ("Doğru", "Yanlış"):
                return True
            if re.fullmatch(r"-{5,}", text):
                return True
    return False


def slugify_label(value: str) -> str:
    """URL-safe slug for a mock/unit set, preserving its own label."""
    folded = ascii_fold(value)
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-") or "set"


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
    hashes: dict = {}
    sigs: dict = {}
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
        # Mock ("Deneme") and unit ("Ünite") sets are now part of the corpus
        # when the course page explicitly lists them. The title guards below
        # only reject *accidental* mocks/units cross-listed as real exams.
        explicit_mock = bool(e.get("mock"))
        explicit_unit = e.get("type") == "unite" or e.get("reason") == "unit"
        if is_mock_page(d["page_title"]) and not explicit_mock:
            e.update({"status": "skipped_quality", "quality_reason": "mock_page",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        if is_unit_page(d["page_title"]) and not explicit_unit:
            e.update({"status": "skipped_quality", "quality_reason": "unit_page",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        if is_other_programme(d["page_title"], e["course_slug"]) \
                and not (explicit_mock or explicit_unit):
            e.update({"status": "skipped_quality",
                      "quality_reason": "other_programme",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        ttype = classify(title) or classify(e["label"]) or e["type"]
        tper = period_of(title) or e["period"] or "unknown"
        if explicit_unit:
            ttype = "unite"
        elif explicit_mock:
            ttype = e.get("type") or ttype
        # A "Vize Ve Final Soruları" page with no term is a unit-by-unit study
        # compilation, not a sitting of an exam. It spans many units with its
        # own numbering, so it is out of scope rather than a defective exam.
        # A term-less page with dozens of questions is a unit question bank,
        # not one sitting (e.g. "Final Soruları-1" with 91 questions).
        if not (explicit_mock or explicit_unit) and d["question_count"] > 60 and tper == "unknown":
            e.update({"status": "skipped_quality", "quality_reason": "compilation",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        if not (explicit_mock or explicit_unit) and is_compilation_title(title):
            e.update({"status": "skipped_quality", "quality_reason": "compilation",
                      "page_title": d["page_title"],
                      "question_count": d["question_count"]})
            out.append(e)
            continue
        # Mock/unit sets keep their own label ("2021 Vize Deneme Sınavı",
        # "Ünite-1"). Real exams keep the normalised term form.
        if explicit_mock or ttype == "unite":
            display = norm_label(strip_course(d["page_title"], e["course"])) \
                or norm_label(e["label"])
            slug = slugify_label(display)
        else:
            tname = f"{TYPE_TR.get(ttype, ttype.title())} Soruları"
            display = tname if tper == "unknown" else f"{tper} {tname}"
            slug = f"{ttype}-{tper}" if ttype != "unknown" else "exam"
        e.update({"label": display, "type": ttype, "period": tper,
                  "slug": slug, "page_title": d["page_title"],
                  "mock": bool(explicit_mock or is_mock_page(d["page_title"])),
                  "question_count": d["question_count"],
                  "answer_source": d["answer_source"],
                  "status": "parsed"})
        out.append(e)

    # Unique slugs per course; duplicate content detection.
    seen_slug: dict = {}
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
        if is_compilation_body(d["questions"]):
            e["status"] = "skipped_quality"
            e["quality_reason"] = "compilation"
            final.append(e)
            continue
        chash = sha256_json(d["questions"])
        # Mock and unit sets are deliberately kept even when they repeat a
        # real exam: they are separate practice sets, not duplicate pages.
        if not (e.get("mock") or ttype == "unite") and chash in hashes:
            e["status"] = "duplicate_content"
            e["duplicate_of"] = hashes[chash]
            final.append(e)
            continue
        bad, dropped = apply_quality_gate(d)
        if dropped:
            e["omitted_questions"] = [q["n"] for q in dropped]
            e["question_count"] = d["question_count"]
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
        if not (e.get("mock") or ttype == "unite"):
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
        if e.get("status") != "skipped_quality":
            continue
        base = e.get("slug") or e.get("provisional_slug")
        if not base:
            continue
        e["slug"] = base
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
