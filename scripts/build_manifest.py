#!/usr/bin/env python3
"""Build output/manifest.json from canonical JSON + files on disk.

Pipeline lifecycle states are owned by scripts/state.py; this builder only
imports them so the manifest and `state.py --json` can never disagree.
"""
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
JSONDIR = OUT / ".cache/json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import Pipeline  # noqa: E402


def pipeline_index() -> tuple[dict, dict]:
    """Snapshot the state model once: per-exam rows plus the totals."""
    snap = Pipeline().snapshot()
    idx = {(e["course_slug"], e["exam_slug"]): e for e in snap["exams"]}
    return idx, snap["totals"]


def main() -> None:
    states, totals = pipeline_index()
    cfg = {}
    ex_path = ROOT / "config/exams.json"
    if ex_path.exists():
        cfg = json.load(open(ex_path, encoding="utf-8"))
    by_id = {(e["course_slug"], e.get("slug") or e.get("provisional_slug") or ""): e
             for e in cfg.get("exams", [])}
    manifest = []
    for f in sorted(JSONDIR.glob("*__*.json")):
        d = json.load(open(f, encoding="utf-8"))
        md = OUT / d["course_slug"] / f"{d['exam_slug']}.md"
        answered = sum(1 for q in d["questions"] if q.get("answer") != "UNKNOWN")
        reviews = sum(len(q.get("review", [])) for q in d["questions"])
        reviews += len(d.get("review_notes", []))
        entry = {
            "course": d["course"],
            "course_slug": d["course_slug"],
            "exam": d["exam"],
            "exam_slug": d["exam_slug"],
            "type": by_id.get((d["course_slug"], d["exam_slug"]), {}).get("type", "unknown"),
            "mock": bool(by_id.get((d["course_slug"], d["exam_slug"]), {}).get("mock")),
            "source_url": d["source_url"],
            "file": f"{d['course_slug']}/{d['exam_slug']}.md",
            "question_count": d["question_count"],
            "answered_count": answered,
            "unknown_count": d["question_count"] - answered,
            "review_flags": reviews,
            "answer_source": d.get("answer_source", "none"),
            "status": "done" if md.exists() else "partial",
            "scraped_at": d["scraped_at"],
            "content_hash": d.get("content_hash", ""),
            "file_hash": ("sha256:" + hashlib.sha256(md.read_bytes()).hexdigest()) if md.exists() else None,
            "translated": all(q.get("stem_ar") for q in d["questions"]),
            "omitted_questions": d.get("omitted_questions", []),
        }
        st = states.get((d["course_slug"], d["exam_slug"]))
        if st:
            entry["state"] = st["state"]
            entry["translation_state"] = st["translation_state"]
            entry["next_action"] = st["next_action"]
        manifest.append(entry)

    # Record everything deliberately left out, so the corpus is auditable.
    skipped = []
    if cfg:
        for e in cfg["exams"]:
            if e.get("status") in ("skipped_quality", "duplicate_content",
                                   "parse_error", "fetch_missing"):
                st = states.get((e["course_slug"],
                                 e.get("slug") or e.get("provisional_slug") or ""))
                # "fetch_missing" is a parse-time snapshot, not a decision: once
                # the page is cached (or parsed) it is work in progress, not a
                # skip. Only a page still waiting to be fetched belongs here.
                if (e["status"] == "fetch_missing" and st
                        and st["state"] not in ("fetch_pending", "fetch_failed")):
                    continue
                rec = {
                    "course": e["course"], "course_slug": e["course_slug"],
                    "exam": e.get("label"), "source_url": e["url"],
                    "status": e["status"],
                    "reason": e.get("quality_reason") or e.get("status"),
                }
                if st:
                    rec["state"] = st["state"]
                    rec["translation_state"] = st["translation_state"]
                    rec["next_action"] = st["next_action"]
                skipped.append(rec)
        for s in cfg.get("skipped", []):
            skipped.append({
                "course": s["course"], "course_slug": s["course_slug"],
                "exam": s["label"], "source_url": s["url"],
                "status": "out_of_scope",
                "reason": s["reason"],
                "state": "out_of_scope",
                "translation_state": "none",
                "next_action": "none",
            })

    (OUT / "manifest.json").write_text(
        json.dumps({"generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "count": len(manifest), "exams": manifest,
                    "skipped_count": len(skipped), "skipped": skipped,
                    "pipeline": totals},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("manifest entries:", len(manifest), "skipped records:", len(skipped))
    print("saved exams:", totals["saved_exams"], "rendered:", totals["rendered"],
          "questions:", totals["questions"])


if __name__ == "__main__":
    main()
