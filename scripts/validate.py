#!/usr/bin/env python3
"""Validate rendered Markdown against canonical JSON and the output spec."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
JSONDIR = OUT / ".cache/json"

ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
TURKISH_ONLY = set("ğışĞİŞ")


def is_arabic(s: str) -> bool:
    # Numerals, Roman numerals and a Latin gloss in parentheses are neutral.
    s = re.sub(r"\([^)]*\)", " ", s)
    # Quoted source examples ("meydaaana", "bööörek") stay in Latin script by
    # definition; only quotes with no Arabic at all are neutral.
    s = re.sub(r"«([^»]*)»", lambda m: " " if not ARABIC.search(m.group(1)) else m.group(0), s)
    s = re.sub(r"“([^”]*)”", lambda m: " " if not ARABIC.search(m.group(1)) else m.group(0), s)
    s = re.sub(r"(?<![A-Za-z])[IVXLC]+(?![A-Za-z])", " ", s)
    s = re.sub(r"\b[A-Z]{1,3}[0-9]{1,2}\b", " ", s)  # CEFR-style codes: A1, B2
    s = re.sub(r"\b[A-ZÇĞİÖŞÜ]{2,}\b", " ", s)
    s = re.sub(r"[0-9]", " ", s)
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return True  # pure numeric option
    ar = sum(1 for c in letters if ARABIC.match(c) or c in "،؛؟")
    return ar / len(letters) >= 0.7


def unesc(s: str) -> str:
    return s.replace("<br>", "\n")


def parse_md(text: str):
    if not text.startswith("---\n"):
        raise ValueError("no front matter")
    _, fm, body = text.split("---\n", 2)
    meta = {}
    for line in fm.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    blocks = re.split(r"^### Q(\d+)\s*$", body, flags=re.M)
    qs = []
    for i in range(1, len(blocks), 2):
        n = int(blocks[i])
        chunk = blocks[i + 1]
        qline = re.search(r"^\*\*Question:\*\* (.*)$", chunk, re.M)
        if not qline:
            raise ValueError(f"Q{n}: no Question line")
        raw = qline.group(1)
        if " | " not in raw:
            raise ValueError(f"Q{n}: no TR | AR separator")
        tr, ar = raw.split(" | ", 1)
        choices = re.findall(r"^- ([A-E])\) (.*?) — (.*)$", chunk, re.M)
        ans = re.search(r"^\*\*Answer:\*\* (.*)$", chunk, re.M)
        qs.append({"n": n, "tr": tr, "ar": ar, "choices": choices,
                   "answer": ans.group(1).strip() if ans else None,
                   "chunk": chunk})
    return meta, qs


def main() -> int:
    problems = []
    review_flags = []
    pending = []
    total_q = 0
    total_unknown = 0
    files = 0
    per_course: Counter = Counter()
    for jf in sorted(JSONDIR.glob("*__*.json")):
        d = json.load(open(jf, encoding="utf-8"))
        md_path = OUT / d["course_slug"] / f"{d['exam_slug']}.md"
        if not md_path.exists():
            if "--strict" in sys.argv:
                problems.append(f"MISSING FILE {md_path}")
            else:
                pending.append(str(md_path))
            continue
        files += 1
        meta, qs = parse_md(md_path.read_text(encoding="utf-8"))
        if int(meta.get("question_count", -1)) != len(qs):
            problems.append(f"{md_path}: front matter count {meta.get('question_count')} != {len(qs)}")
        if len(qs) != d["question_count"]:
            problems.append(f"{md_path}: md questions {len(qs)} != json {d['question_count']}")
        if [q["n"] for q in qs] != list(range(1, len(qs) + 1)):
            problems.append(f"{md_path}: question numbers not sequential: {[q['n'] for q in qs][:10]}")
        total_q += len(qs)
        per_course[d["course_slug"]] += len(qs)

        for q in qs:
            jq = d["questions"][q["n"] - 1]
            if unesc(q["tr"]) != jq["stem"]:
                problems.append(f"{md_path} Q{q['n']}: TR differs from canonical JSON")
            if not q["ar"].strip():
                problems.append(f"{md_path} Q{q['n']}: empty Arabic")
            elif not is_arabic(q["ar"]):
                problems.append(f"{md_path} Q{q['n']}: Arabic script ratio too low")
            if not (4 <= len(q["choices"]) <= 5):
                problems.append(f"{md_path} Q{q['n']}: {len(q['choices'])} choices")
            letters = [c[0] for c in q["choices"]]
            if letters != [chr(ord("A") + i) for i in range(len(letters))]:
                problems.append(f"{md_path} Q{q['n']}: letters {letters}")
            for letter, ctr, car in q["choices"]:
                if not car.strip():
                    problems.append(f"{md_path} Q{q['n']}{letter}: empty Arabic")
                elif not is_arabic(car):
                    problems.append(f"{md_path} Q{q['n']}{letter}: Arabic script ratio too low")
                stripped = re.sub(r"\([^)]*\)", " ", car)
                stripped = re.sub(r"\b[A-ZÇĞİÖŞÜ]{2,}\b", " ", stripped)
                # A standalone single letter is a phoneme symbol, not a word
                # ("ı, ü, ö, ç, ş" in a Turkish phonetics question).
                stripped = re.sub(
                    r"(?<![A-Za-z0-9ÇĞİÖŞÜçğıöşü])"
                    r"[A-Za-zÇĞİÖŞÜçğıöşü]"
                    r"(?![A-Za-z0-9ÇĞİÖŞÜçğıöşü])", " ", stripped)
                if set(stripped) & TURKISH_ONLY:
                    problems.append(f"{md_path} Q{q['n']}{letter}: Turkish-only letter in Arabic")
            ans = q["answer"]
            if ans == "UNKNOWN":
                total_unknown += 1
            elif ans is None:
                problems.append(f"{md_path} Q{q['n']}: missing Answer line")
            else:
                for part in ans.split(","):
                    if part.strip() not in letters:
                        problems.append(f"{md_path} Q{q['n']}: answer {ans} not in choices")
            if "REVIEW" in q["chunk"]:
                review_flags.append(f"{md_path} Q{q['n']}")

    # duplicates across the whole corpus
    hashes: dict = {}
    for jf in sorted(JSONDIR.glob("*__*.json")):
        d = json.load(open(jf, encoding="utf-8"))
        h = json.dumps([q["stem"] for q in d["questions"]], ensure_ascii=False)
        kh = __import__("hashlib").sha256(h.encode()).hexdigest()
        if kh in hashes:
            problems.append(f"DUPLICATE EXAM {d['course_slug']}/{d['exam_slug']} == {hashes[kh]}")
        hashes[kh] = f"{d['course_slug']}/{d['exam_slug']}"

    # manifest vs disk
    mpath = OUT / "manifest.json"
    if mpath.exists():
        m = json.load(open(mpath, encoding="utf-8"))
        for e in m["exams"]:
            if e["status"] == "done" and not (OUT / e["file"]).exists():
                problems.append(f"manifest done but missing file: {e['file']}")
            if e["status"] == "done" and e["translated"] is False:
                problems.append(f"manifest done but untranslated: {e['file']}")
    else:
        problems.append("no manifest.json")

    print(f"files validated: {files}   pending (no markdown yet): {len(pending)}")
    print(f"questions: {total_q}   UNKNOWN answers: {total_unknown}   REVIEW flags: {len(review_flags)}")
    print("per course:", dict(per_course))
    if review_flags:
        print("review:", *review_flags[:40], sep="\n  ")
    if problems:
        print(f"\nPROBLEMS ({len(problems)}):")
        for p in problems[:80]:
            print("  -", p)
        return 1
    print("\nOK: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
