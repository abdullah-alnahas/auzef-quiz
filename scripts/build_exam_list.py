#!/usr/bin/env python3
"""Build the fetch list and provisional exam slugs from discovered courses.

Scope: real past exams (vize / final / butunleme / yaz-okulu / uc-ders).
Mock ("deneme") and unit ("ünite") sets are excluded from Phase 1 and recorded
as out_of_scope in the manifest.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"


def slug(s: str) -> str:
    s = s.lower()
    for a, b in [("ı", "i"), ("i̇", "i"), ("ş", "s"), ("ğ", "g"), ("ü", "u"),
                 ("ö", "o"), ("ç", "c")]:
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main() -> None:
    data = json.load(open(CONFIG / "courses.json", encoding="utf-8"))
    out = []
    skipped = []
    for c in data["courses"]:
        used = {}
        seen = set()
        for e in c["exams"]:
            if e["mock"] or e["type"] in ("unite",):
                skipped.append({**e, "course": c["course"], "course_slug": c["slug"],
                                "reason": "mock" if e["mock"] else "unit"})
                continue
            if e["url"] in seen:
                skipped.append({**e, "course": c["course"], "course_slug": c["slug"],
                                "reason": "duplicate_url"})
                continue
            seen.add(e["url"])
            period = e["period"] or "unknown"
            base = f"{e['type']}-{period}"
            n = used.get(base, 0) + 1
            used[base] = n
            ex = {**e, "course": c["course"], "course_slug": c["slug"],
                  "provisional_slug": base if n == 1 else f"{base}-{n}"}
            out.append(ex)
    (CONFIG / "exams.json").write_text(
        json.dumps({"exams": out, "skipped": skipped}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (CONFIG / "fetch_list.txt").write_text(
        "\n".join(e["url"] for e in out) + "\n", encoding="utf-8")
    print("exams to fetch:", len(out), "skipped:", len(skipped))
    from collections import Counter
    for c in data["courses"]:
        print(f"  {c['slug']:<46}", sum(1 for e in out if e['course_slug'] == c['slug']),
              "skipped", sum(1 for e in skipped if e['course_slug'] == c['slug']))


if __name__ == "__main__":
    main()
