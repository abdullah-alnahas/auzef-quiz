#!/usr/bin/env python3
"""Validate one or more translation result files against their queues.

Usage: check_batch.py <exam_id> [<exam_id> ...]
Exit 0 only when every item is present, non-empty and Arabic.
"""
import json
import re
import sys
from pathlib import Path

from translation import hash_matches

ROOT = Path(__file__).resolve().parent.parent
QDIR = ROOT / "output/.translate/queue"
DDIR = ROOT / "output/.translate/done"
ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")


def ratio(s: str) -> float:
    s = re.sub(r"(?<![A-Za-z])[IVXLC]+(?![A-Za-z])", " ", s)
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if ARABIC.match(c) or c in "،؛؟") / len(letters)


def main() -> int:
    ok = True
    for eid in sys.argv[1:]:
        qf, df = QDIR / f"{eid}.json", DDIR / f"{eid}.json"
        if not df.exists():
            print(f"{eid}: MISSING result file")
            ok = False
            continue
        q = json.load(open(qf, encoding="utf-8"))
        d = json.load(open(df, encoding="utf-8"))
        errs = []
        if not hash_matches(q, d):
            errs.append("source_hash mismatch")
        got = {i["id"]: i.get("ar", "") for i in d.get("items", [])}
        if len(got) != len(d.get("items", [])):
            errs.append("duplicate ids")
        missing = [i["id"] for i in q["items"] if i["id"] not in got]
        extra = [k for k in got if k not in {i["id"] for i in q["items"]}]
        empty = [k for k, v in got.items() if not str(v).strip()]
        low = [k for k, v in got.items() if str(v).strip() and ratio(v) < 0.7]
        if missing:
            errs.append(f"{len(missing)} missing: {missing[:6]}")
        if extra:
            errs.append(f"{len(extra)} unknown ids: {extra[:6]}")
        if empty:
            errs.append(f"{len(empty)} empty: {empty[:6]}")
        if low:
            errs.append(f"{len(low)} low-Arabic: {low[:6]}")
        if errs:
            ok = False
            print(f"{eid}: FAIL " + "; ".join(errs))
        else:
            print(f"{eid}: OK ({len(got)} items)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
