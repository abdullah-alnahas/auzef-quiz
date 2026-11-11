#!/usr/bin/env python3
"""Assign every fetched Phase 2 exam to its real course from the page's <h1>.

A programme page aggregates exam tables for several courses (the main course
plus related programmes), so the page an exam was discovered on is only a
provisional owner. The exam page itself states its course, e.g.
"Anne Çocuk Beslenmesi 2026 Vize Soruları".

Matching is name-based: the longest configured course name contained in the
normalised <h1> wins. With no match the provisional course is kept, so this
never guesses.

Run after fetching and before parse_all.py. Only course name/slug change.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
CACHE = ROOT / "output/.cache/html"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import fold  # noqa: E402
from discover import norm  # noqa: E402


def h1_of(path: Path) -> str:
    try:
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
    except OSError:
        return ""
    h1 = soup.find("h1")
    return norm(h1.get_text(" ", strip=True)) if h1 else ""


def main() -> None:
    cfg = json.load(open(CONFIG / "exams.json", encoding="utf-8"))
    courses = json.load(open(CONFIG / "courses.json", encoding="utf-8"))["courses"]
    names = [(c["slug"], fold(c["course"])) for c in courses if fold(c["course"])]

    moved = kept = missing = 0
    for e in cfg["exams"]:
        p = CACHE / (hashlib.sha1(e["url"].encode()).hexdigest() + ".html")
        if not p.exists():
            missing += 1
            continue
        h1 = fold(h1_of(p))
        if not h1:
            kept += 1
            continue
        best = None
        for slug, name in names:
            if len(name) < 4:
                continue
            # Token-boundary match: "…uygulamaları 2" must not match "…2023".
            pat = re.compile(
                r"(?<![0-9a-zçğıöşüâîû])" + re.escape(name)
                + r"(?![0-9a-zçğıöşüâîû])")
            if pat.search(h1):
                if best is None or len(name) > best[0]:
                    best = (len(name), slug)
        if not best:
            kept += 1
            continue
        slug = best[1]
        if slug == e["course_slug"]:
            kept += 1
            continue
        moved += 1
        e["course_slug"] = slug
        e["course"] = next(c["course"] for c in courses if c["slug"] == slug)

    (CONFIG / "exams.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"moved {moved}  kept {kept}  not fetched yet {missing}")


if __name__ == "__main__":
    main()
