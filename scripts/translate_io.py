#!/usr/bin/env python3
"""Build per-exam translation queues and merge results back into canonical JSON.

Queue:  output/.translate/queue/<course_slug>__<exam_slug>.json
Result: output/.translate/done/<course_slug>__<exam_slug>.json

A result must echo source_hash and contain every id exactly once. The merger
never modifies the Turkish fields; it only adds *_ar fields.
"""
import argparse
import json
import re
from pathlib import Path

from common import exam_id as common_exam_id, sha256_json
from translation import hash_matches, missing_items

ROOT = Path(__file__).resolve().parent.parent
JSONDIR = ROOT / "output/.cache/json"
QDIR = ROOT / "output/.translate/queue"
DDIR = ROOT / "output/.translate/done"


def exam_id(d: dict) -> str:
    """Exam id for a canonical JSON document."""
    return common_exam_id(d["course_slug"], d["exam_slug"])


def build(d: dict) -> dict:
    items = []
    for q in d["questions"]:
        items.append({"id": f"q{q['n']}.stem", "tr": q["stem"]})
        for c in q["choices"]:
            items.append({"id": f"q{q['n']}.{c['letter']}", "tr": c["text"]})
        for ti, t in enumerate(q.get("tables") or []):
            items.append({"id": f"q{q['n']}.table{ti}", "tr": t})
    payload = {"exam_id": exam_id(d), "course": d["course"], "exam": d["exam"],
               "items": items}
    payload["source_hash"] = sha256_json(items)
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--merge", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()
    QDIR.mkdir(parents=True, exist_ok=True)
    DDIR.mkdir(parents=True, exist_ok=True)
    files = sorted(JSONDIR.glob("*__*.json"))
    if args.only:
        files = [f for f in files if args.only in f.name]

    if args.build:
        keep = set()
        for f in files:
            d = json.load(open(f, encoding="utf-8"))
            q = build(d)
            keep.add(f"{q['exam_id']}.json")
            (QDIR / f"{q['exam_id']}.json").write_text(
                json.dumps(q, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for qf in QDIR.glob("*.json"):
            if qf.name not in keep:
                qf.unlink()
        orphan = [rf.name for rf in DDIR.glob("*.json") if rf.name not in keep]
        if orphan:
            # Translation work outlives its exam only when the exam was removed
            # (duplicate / quality-skipped). Report it; never delete by hand.
            print(f"done files without a parsed exam (kept): {len(orphan)} "
                  + ", ".join(sorted(orphan)[:3]))
        print(f"queued {len(files)} exams -> {QDIR}")

    if args.merge:
        merged = 0
        for f in files:
            d = json.load(open(f, encoding="utf-8"))
            eid = exam_id(d)
            qf = QDIR / f"{eid}.json"
            rf = DDIR / f"{eid}.json"
            if not (qf.exists() and rf.exists()):
                continue
            q = json.load(open(qf, encoding="utf-8"))
            r = json.load(open(rf, encoding="utf-8"))
            if not hash_matches(q, r):
                print(f"SKIP hash mismatch {eid}")
                continue
            missing = missing_items(q, r)
            if missing:
                print(f"SKIP incomplete {eid}: {len(missing)} missing")
                continue
            got = {item["id"]: item.get("ar", "")
                   for item in r.get("items", [])}
            for qq in d["questions"]:
                qq["stem_ar"] = got[f"q{qq['n']}.stem"]
                for c in qq["choices"]:
                    c["text_ar"] = got[f"q{qq['n']}.{c['letter']}"]
                for ti in range(len(qq.get("tables") or [])):
                    t = got.get(f"q{qq['n']}.table{ti}")
                    if t:
                        qq.setdefault("tables_ar", []).append(t)
                qq.pop("review", None)
            if r.get("review"):
                # Attach each note to the question it concerns so it renders as
                # an inline <!-- REVIEW: ... --> comment at the right place.
                by_n = {qq["n"]: qq for qq in d["questions"]}
                leftovers = {}
                for rid, reason in r["review"].items():
                    m = re.match(r"q(\d+)\.", rid)
                    if m and int(m.group(1)) in by_n:
                        by_n[int(m.group(1))].setdefault("review", []).append(
                            f"{rid}: {reason}")
                    else:
                        leftovers[rid] = reason
                if leftovers:
                    d["review_notes"] = leftovers
            f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            merged += 1
        print(f"merged {merged}")


if __name__ == "__main__":
    main()
