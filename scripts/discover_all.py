#!/usr/bin/env python3
"""Build Phase 2 course list from the programme index (no network)."""
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
CACHE = ROOT / "output/.cache/html"


def slugify(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def main() -> None:
    seed = CACHE / "seed.html"
    soup = BeautifulSoup(seed.read_text(encoding="utf-8"), "lxml")
    # Phase 1 slugs come from the URLs, which differ for a few courses.
    p1_urls = {c["page_url"].rstrip("/") for c in
               json.load(open(CONFIG / "courses.json", encoding="utf-8"))["courses"]}
    seen, out = set(), []
    for a in soup.find_all("a", href=True):
        h = a["href"].split("#")[0].rstrip("/")
        if not re.match(r"^https://lolonolo\.com/auzef/[^/]+$", h):
            continue
        if h in p1_urls or "/auzef/cocukgelisimi" in h or h in seen:
            continue
        seen.add(h)
        name = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        out.append({"course": name, "slug": slugify(h), "page_url": h + "/"})
    (CONFIG / "courses_p2.json").write_text(
        json.dumps({"courses": out}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (CONFIG / "p2_pages.txt").write_text("\n".join(c["page_url"] for c in out) + "\n",
                                         encoding="utf-8")
    print("phase2 courses:", len(out))


if __name__ == "__main__":
    main()
