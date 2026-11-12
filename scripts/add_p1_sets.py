#!/usr/bin/env python3
"""Add the explicitly listed mock ("Deneme") and unit ("Ünite") sets to the
Phase 1 corpus.

Phase 1 originally kept only real exam sittings; the course pages also list
practice sets in the same tables (often two links per row: vize + final/büt).
This script reads the cached course pages, finds every dated exam link that is
not already a real exam, promotes it from `skipped` to `exams`, and writes the
URLs that still need fetching.

Idempotent: entries are keyed by URL.
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from discover import classify, is_mock, norm, period_of  # noqa: E402
from parse_all import slugify_label  # noqa: E402

P1 = {
    "anne-baba-egitimi",
    "cocuk-gelisimi-uygulamalari-i",
    "cocuk-haklari-ve-hukuku",
    "cocuklukta-yabanci-dil-olarak-turkce-ogretimi",
    "ilkokula-hazirlik",
    "okul-oncesi-donemde-duyu-egitimi",
    "oyun-ve-oyun-terapisi",
    "psikometrik-gelisimsel-olcme-ve-degerlendirme",
    "sosyal-duygusal-gelisim",
}


def main() -> None:
    cfg = json.load(open(CONFIG / "exams.json", encoding="utf-8"))
    courses = json.load(open(CONFIG / "courses.json", encoding="utf-8"))["courses"]
    have = {e["url"] for e in cfg["exams"]}
    skipped = {s["url"]: s for s in cfg["skipped"]}
    moved = set()
    added = []

    for course in courses:
        if course["slug"] not in P1:
            continue
        path = Path(course["page_file"])
        if not path.exists():
            print(f"missing page: {course['slug']}", file=sys.stderr)
            continue
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
        found = {}
        for table in soup.find_all("table"):
            for anchor in table.find_all("a", href=True):
                href = anchor["href"].split("#")[0]
                if not re.match(r"^https://lolonolo\.com/20\d{2}/\d{2}/\d{2}/", href):
                    continue
                label = norm(anchor.get_text(" ", strip=True))
                if classify(label):
                    found.setdefault(href, label)

        used = {}
        for href, label in found.items():
            if href in have:
                continue
            old = skipped.get(href)
            if old and old.get("reason") == "duplicate_url":
                continue
            reason = old.get("reason") if old else None
            etype = "unite" if reason == "unit" or classify(label) == "unite" \
                else (old or {}).get("type") or classify(label) or "unknown"
            if etype == "deneme":
                url = href.lower()
                etype = "final" if "final" in url else "vize" if "vize" in url \
                    else "butunleme" if "but" in url else "deneme"
            mock = reason == "mock" or is_mock(label)
            if not (mock or etype == "unite"):
                # A real exam that was not in the config: keep it too.
                pass
            base = slugify_label(label)
            n = used.get(base, 0) + 1
            used[base] = n
            entry = {
                "label": label,
                "type": etype,
                "period": period_of(label) or (old or {}).get("period") or "unknown",
                "mock": mock,
                "url": href,
                "course": course["course"],
                "course_slug": course["slug"],
                "provisional_slug": base if n == 1 else f"{base}-{n}",
                "status": "fetch_missing",
            }
            cfg["exams"].append(entry)
            added.append(entry)
            have.add(href)
            if old:
                moved.add(href)

    cfg["skipped"] = [s for s in cfg["skipped"] if s["url"] not in moved]
    (CONFIG / "exams.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    list_path = CONFIG / "fetch_p1_sets.txt"
    old_urls = []
    if list_path.exists():
        old_urls = [line.strip() for line in list_path.read_text(encoding="utf-8").splitlines()
                    if line.strip()]
    urls = list(dict.fromkeys(old_urls + [e["url"] for e in added]))
    list_path.write_text("\n".join(urls) + "\n", encoding="utf-8")
    print(f"added {len(added)} sets, moved {len(moved)} from skipped")
    print(f"fetch list: {CONFIG / 'fetch_p1_sets.txt'}")


if __name__ == "__main__":
    main()
