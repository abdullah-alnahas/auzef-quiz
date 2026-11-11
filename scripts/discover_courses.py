#!/usr/bin/env python3
"""Discover real past exams for Phase 2 course pages (from cached HTML).

Reads config/courses_p2.json (course name + page URL), finds the cached page,
extracts exam links, and writes:
  config/courses_p2_discovered.json  (per-course exam lists)
  config/exams_p2.json               (flat exam list + out-of-scope)
  config/fetch_p2.txt                (URLs still to fetch)

Nothing is guessed from URLs: an exam exists only if the course page links it
with a vize/final/bütünleme/yaz-okulu/üç-ders label.
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
from discover import classify, period_of, is_mock, norm  # noqa: E402


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def page_slug(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def exam_links(soup):
    """Every dated exam link inside the page's exam tables.

    A course page aggregates several exam tables (the course itself plus
    related programmes such as TDS variants). The table is the site's own
    grouping; sidebar and "related posts" links live outside it and would
    otherwise pollute the list. Course assignment happens after fetching, from
    each exam page's own <h1> (assign_courses.py).
    """
    tables = soup.find_all("table", id="anasayfa24")
    if not tables:
        tables = [soup]
    seen = set()
    for table in tables:
        for a in table.find_all("a", href=True):
            href = a["href"].split("#")[0]
            if re.match(r"^https://lolonolo\.com/20\d{2}/\d{2}/\d{2}/", href) and href not in seen:
                seen.add(href)
                yield href, norm(a.get_text(" ", strip=True))


def main() -> None:
    src = CONFIG / "courses_p2.json"
    data = json.load(open(src, encoding="utf-8"))
    out, exams, skipped, missing = [], [], [], []
    all_urls = set()

    for c in data["courses"]:
        page = c["page_url"]
        path = CACHE / (sha1(page) + ".html")
        if not path.exists():
            missing.append(page)
            continue
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
        h1 = soup.find("h1")
        name = norm(h1.get_text(" ", strip=True)) if h1 else c["course"]
        found, seen = [], set()
        for href, text in exam_links(soup):
            if href in seen:
                continue
            etype = classify(text)
            if not etype:
                continue
            seen.add(href)
            found.append({"label": text, "type": etype, "period": period_of(text),
                          "mock": is_mock(text), "url": href})
        out.append({"course": name, "slug": page_slug(page), "page_url": page,
                    "page_file": str(path), "exams": found,
                    "real": sum(1 for e in found if not e["mock"] and e["type"] != "unite")})

        used, seen_url = {}, set()
        for e in found:
            if e["mock"] or e["type"] == "unite":
                skipped.append({**e, "course": name, "course_slug": page_slug(page),
                                "reason": "mock" if e["mock"] else "unit"})
                continue
            if e["url"] in seen_url:
                skipped.append({**e, "course": name, "course_slug": page_slug(page),
                                "reason": "duplicate_url"})
                continue
            seen_url.add(e["url"])
            # One exam page belongs to one course. The same URL is listed on
            # several programme pages; keep the first occurrence and let
            # assign_courses.py move it by the page's own <h1>.
            if e["url"] in all_urls:
                continue
            all_urls.add(e["url"])
            base = f"{e['type']}-{e['period'] or 'unknown'}"
            n = used.get(base, 0) + 1
            used[base] = n
            exams.append({**e, "course": name, "course_slug": page_slug(page),
                          "provisional_slug": base if n == 1 else f"{base}-{n}"})

    (CONFIG / "courses_p2_discovered.json").write_text(
        json.dumps({"courses": out}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (CONFIG / "exams_p2.json").write_text(
        json.dumps({"exams": exams, "skipped": skipped}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (CONFIG / "fetch_p2.txt").write_text(
        "\n".join(e["url"] for e in exams) + "\n", encoding="utf-8")
    (CONFIG / "p2_missing_pages.txt").write_text(
        "\n".join(missing) + "\n", encoding="utf-8")

    print(f"courses discovered: {len(out)}  pages missing: {len(missing)}")
    print(f"real exams: {len(exams)}  excluded: {len(skipped)}")
    for c in out:
        print(f"  {c['slug']:<46} {c['real']:>3}")


if __name__ == "__main__":
    main()
