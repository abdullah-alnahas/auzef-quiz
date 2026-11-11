#!/usr/bin/env python3
"""List translation work that is actually pending, from the state model.

An exam counts as pending when its derived translation state is `queued`,
`translation_stale` or `translation_incomplete` — not merely when a done file is
absent. That distinction matters: a stale or incomplete done file used to look
"finished" here while the merger refused it, which deadlocked the exam.

Output keys (all additive to the old ones):
    pending_exams  number of exams awaiting translation
    batches        how many size-bounded groups they form
    next           the first few batches, now with per-exam state
    queue_needed   exams with no translation queue yet (run translate_io --build)
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QDIR = ROOT / "output/.translate/queue"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import PENDING_TRANSLATION as PENDING, Pipeline  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=4)
    ap.add_argument("--items", type=int, default=420)
    ap.add_argument("--limit", type=int, default=6)
    args = ap.parse_args()

    snap = Pipeline().snapshot()
    pending, queue_needed = [], []
    for e in snap["exams"]:
        eid = f"{e['course_slug']}__{e['exam_slug']}"
        if e["state"] == "needs_translation":
            queue_needed.append({"id": eid, "state": e["state"],
                                 "questions": e["questions"]})
            continue
        if e["translation_state"] not in PENDING:
            continue
        n = e["translation"].get("queue_items")
        if n is None:
            qf = QDIR / f"{eid}.json"
            n = (len(json.load(open(qf, encoding="utf-8"))["items"])
                 if qf.exists() else 1)
        pending.append((eid, n, e["translation_state"]))

    batches, cur, cur_items = [], [], 0
    for eid, n, st in pending:
        if cur and cur_items + n > args.items:
            batches.append(cur)
            cur, cur_items = [], 0
        cur.append((eid, n, st))
        cur_items += n
    if cur:
        batches.append(cur)

    print(json.dumps({
        "pending_exams": len(pending),
        "batches": len(batches),
        "next": [{"ids": [x[0] for x in b],
                  "items": sum(x[1] for x in b),
                  "states": {x[0]: x[2] for x in b}} for b in batches[:args.limit]],
        "queue_needed": queue_needed,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
