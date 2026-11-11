#!/usr/bin/env python3
"""Explicit state model for the exam corpus pipeline.

Every stage of this project used to encode "where am I?" implicitly: a file
exists or it does not, config/exams.json carries a status string, a translation
result echoes a hash, the manifest says done/partial. Those are five
overlapping state machines. This module derives one authoritative state per
exam from the artifacts on disk, without writing anything.

States (exam lifecycle, in order):

    out_of_scope -> fetch_pending -> fetched -> needs_translation -> queued
                 -> translated -> ready_to_render -> rendered
    terminal branches: fetch_failed, parse_error, quality_skipped, duplicate,
    translation_stale, translation_incomplete

`next_action` is the single command a human or agent should run next:
fetch | retry_fetch | parse | translate | fix_translation | merge | render |
review | none.

Usage:
    state.py                 # course table + next actions
    state.py --exams         # per-exam state
    state.py --json          # stable machine-readable snapshot
    state.py --check         # exit 1 on contradictory artifacts
    state.py --diagram       # Mermaid state machine
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import exam_id, sha1  # noqa: E402
from render_md import render  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
JSONDIR = OUT / ".cache/json"
CACHE = OUT / ".cache/html"
QDIR = OUT / ".translate/queue"
DDIR = OUT / ".translate/done"
LOGDIR = OUT / "logs"
CONFIG = ROOT / "config"

SCHEMA = "pipeline_state/v1"

EXAM_STATES = [
    "out_of_scope", "fetch_pending", "fetch_failed", "fetched",
    "parse_error", "duplicate", "quality_skipped",
    "needs_translation", "queued", "translation_stale",
    "translation_incomplete", "translated", "ready_to_render", "rendered",
]

NEXT_ACTION = {
    "out_of_scope": "none",
    "fetch_pending": "fetch",
    "fetch_failed": "retry_fetch",
    "fetched": "parse",
    "parse_error": "review",
    "duplicate": "review",
    "quality_skipped": "review",
    "needs_translation": "translate",
    "queued": "translate",
    "translation_stale": "fix_translation",
    "translation_incomplete": "fix_translation",
    "translated": "merge",
    "ready_to_render": "render",
    "rendered": "none",
}

# States whose exam content counts toward the corpus (has canonical JSON and is
# not a rejected page).
INCLUDED_STATES = {
    "needs_translation", "queued", "translation_stale",
    "translation_incomplete", "translated", "ready_to_render", "rendered",
}

# Values of the per-exam `translation_state` field that still need work. This
# vocabulary is deliberately separate from exam states: "stale" and
# "incomplete" are translation states, "translation_stale" is the exam state.
PENDING_TRANSLATION = {"queued", "stale", "incomplete"}

# Course roll-up: the action a course is waiting on, in blocking order. A course
# is "complete" only when every exam is rendered.
ACTION_PRIORITY = ["fetch", "retry_fetch", "parse", "fix_translation",
                   "translate", "merge", "render", "review"]

COURSE_STATE = {
    "fetch": "fetching",
    "retry_fetch": "fetching",
    "parse": "parsing",
    "fix_translation": "translating",
    "translate": "translating",
    "merge": "merging",
    "render": "rendering",
    "review": "review",
}

DIAGRAM = """stateDiagram-v2
    [*] --> fetch_pending
    fetch_pending --> fetched: page cached
    fetch_pending --> fetch_failed: navigation error
    fetch_failed --> fetch_pending: retry
    fetched --> parse_error: unreadable
    fetched --> quality_skipped: bad structure
    fetched --> duplicate: same content
    fetched --> needs_translation: JSON written
    needs_translation --> queued: queue built
    queued --> translation_stale: source changed
    queued --> translation_incomplete: ids missing
    translation_stale --> translated: re-translated
    translation_incomplete --> translated: completed
    queued --> translated: done file valid
    translated --> ready_to_render: merged
    ready_to_render --> rendered: Markdown written
    rendered --> [*]
    [*] --> out_of_scope: mock / unit set
"""


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def is_translated(d: dict) -> bool:
    return all(q.get("stem_ar") and all(c.get("text_ar") for c in q["choices"])
               for q in d.get("questions", []))


def fetch_log() -> dict:
    """Last fetch record per URL (the log is append-only and may be mid-write)."""
    out: dict = {}
    p = LOGDIR / "fetch_exams.jsonl"
    if not p.exists():
        return out
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if isinstance(rec, dict) and rec.get("url"):
            out[rec["url"]] = rec
    return out


class Pipeline:
    def __init__(self) -> None:
        self.cfg = read_json(CONFIG / "exams.json") or {"exams": [], "skipped": []}
        self.courses = (read_json(CONFIG / "courses.json") or {}).get("courses", [])
        self.fetch = fetch_log()
        self.manifest = read_json(OUT / "manifest.json") or {"exams": []}
        self.manifest_idx = {(e["course_slug"], e["exam_slug"]): e
                             for e in self.manifest.get("exams", [])}
        self.json_idx = {}
        for f in JSONDIR.glob("*__*.json"):
            d = read_json(f)
            if d:
                self.json_idx[(d["course_slug"], d["exam_slug"])] = d
        self.exams = [self._derive(e) for e in self.cfg["exams"]]
        known = {(e["course_slug"], e["exam_slug"]) for e in self.exams}
        for key, d in sorted(self.json_idx.items()):
            if key not in known:
                self.exams.append(self._derive_synthetic(d))
        self.out_of_scope = [{
            "course": s["course"], "course_slug": s["course_slug"],
            "exam": s["label"], "exam_slug": s.get("provisional_slug", ""),
            "source_url": s["url"], "state": "out_of_scope",
            "next_action": "none", "reason": s["reason"],
            "questions": None, "issues": [],
        } for s in self.cfg.get("skipped", [])]
        self.exams.sort(key=lambda e: (e["course_slug"], e["exam_slug"] or ""))

    # --- derivation -----------------------------------------------------
    def _fetch_state(self, url: str) -> str:
        cache = CACHE / (sha1(url) + ".html")
        if cache.exists() and cache.stat().st_size > 2000:
            return "cached"
        rec = self.fetch.get(url)
        if rec and rec.get("status") == "failed":
            return "failed"
        if rec:
            return "missing"  # reported success but the cache is gone
        return "pending"

    def _translation(self, d: dict, course_slug: str, exam_slug: str) -> dict:
        eid = exam_id(course_slug, exam_slug)
        q = read_json(QDIR / f"{eid}.json")
        r = read_json(DDIR / f"{eid}.json")
        missing = []
        if q and r:
            got = {i.get("id"): i.get("ar", "") for i in r.get("items", [])}
            missing = [i["id"] for i in q.get("items", [])
                       if not str(got.get(i["id"], "")).strip()]
        if is_translated(d):
            return {"state": "merged", "queue_items": len(q["items"]) if q else None,
                    "done_items": len(r.get("items", [])) if r else None,
                    "missing": [], "review": len(r.get("review", {})) if r else 0}
        if r is None:
            return {"state": "queued" if q else "none",
                    "queue_items": len(q["items"]) if q else None,
                    "done_items": None, "missing": [], "review": 0}
        if q is None:
            return {"state": "incomplete", "queue_items": None,
                    "done_items": len(r.get("items", [])), "missing": [],
                    "review": 0, "note": "done file without queue"}
        if r.get("source_hash") != q.get("source_hash"):
            return {"state": "stale", "queue_items": len(q["items"]),
                    "done_items": len(r.get("items", [])), "missing": [],
                    "review": len(r.get("review", {}))}
        if missing:
            return {"state": "incomplete", "queue_items": len(q["items"]),
                    "done_items": len(r.get("items", [])), "missing": missing,
                    "review": len(r.get("review", {}))}
        return {"state": "complete", "queue_items": len(q["items"]),
                "done_items": len(r.get("items", [])), "missing": [],
                "review": len(r.get("review", {}))}

    @staticmethod
    def _fresh(d: dict, md: Path) -> bool:
        """True when the rendered Markdown is exactly what the JSON produces."""
        try:
            return md.read_text(encoding="utf-8") == render(d)
        except OSError:
            return False

    def _derive(self, e: dict) -> dict:
        course_slug = e["course_slug"]
        slug = e.get("slug") or e.get("provisional_slug") or ""
        url = e["url"]
        d = self.json_idx.get((course_slug, slug))
        md = OUT / course_slug / f"{slug}.md"
        issues = []
        fetch = self._fetch_state(url)
        status = e.get("status", "")

        if status == "skipped_quality":
            state = "quality_skipped"
        elif status == "duplicate_content":
            state = "duplicate"
        elif status.startswith("parse_error"):
            state = "parse_error"
        elif fetch == "failed":
            state = "fetch_failed"
        elif fetch in ("pending", "missing"):
            state = "fetch_pending"
        elif d is None:
            state = "fetched"
        else:
            tr = self._translation(d, course_slug, slug)
            fresh = md.exists() and self._fresh(d, md)
            if tr["state"] == "merged":
                state = "rendered" if fresh else "ready_to_render"
                if md.exists() and not fresh:
                    issues.append({"kind": "markdown_stale", "severity": "warning",
                                   "detail": str(md)})
            elif tr["state"] == "complete":
                state = "translated"
            elif tr["state"] == "stale":
                state = "translation_stale"
            elif tr["state"] == "incomplete":
                state = "translation_incomplete"
            elif tr["state"] == "queued":
                state = "queued"
            else:
                state = "needs_translation"
            if md.exists() and tr["state"] != "merged":
                issues.append({"kind": "markdown_without_translation",
                               "severity": "error", "detail": str(md)})

        if d is not None and status in ("skipped_quality", "duplicate_content"):
            issues.append({"kind": "json_for_skipped_exam", "severity": "error",
                           "detail": str(JSONDIR / f"{exam_id(course_slug, slug)}.json")})
        if md.exists() and d is None:
            issues.append({"kind": "markdown_without_json", "severity": "error",
                           "detail": str(md)})

        qcount = len(d["questions"]) if d else e.get("question_count")
        unknown = (sum(1 for q in d["questions"] if q.get("answer") == "UNKNOWN")
                   if d else None)
        review = 0
        if d:
            review = sum(len(q.get("review", [])) for q in d["questions"])
            review += len(d.get("review_notes", []))
        tr = self._translation(d, course_slug, slug) if d else {
            "state": "none", "queue_items": None, "done_items": None,
            "missing": [], "review": 0}

        if state == "rendered":
            m = self.manifest_idx.get((course_slug, slug))
            if m is None:
                issues.append({"kind": "manifest_missing", "severity": "warning",
                               "detail": "rendered but absent from manifest"})
            elif m.get("status") != "done":
                issues.append({"kind": "manifest_stale", "severity": "warning",
                               "detail": f"manifest says {m.get('status')}"})
        m = self.manifest_idx.get((course_slug, slug))
        if m and m.get("status") == "done":
            if not md.exists():
                issues.append({"kind": "manifest_done_missing_file",
                               "severity": "error", "detail": m.get("file", "")})
            if not (d and is_translated(d)):
                issues.append({"kind": "manifest_done_untranslated",
                               "severity": "error", "detail": m.get("file", "")})

        return {
            "course": e["course"], "course_slug": course_slug,
            "exam": e.get("label"), "exam_slug": slug, "source_url": url,
            "state": state, "next_action": NEXT_ACTION[state],
            "translation_state": tr["state"],
            "fetch_state": fetch,
            "questions": qcount, "unknown": unknown, "review": review,
            "translation": tr,
            "issues": issues,
        }

    def _derive_synthetic(self, d: dict) -> dict:
        """JSON on disk with no matching config entry."""
        tr = self._translation(d, d["course_slug"], d["exam_slug"])
        md = OUT / d["course_slug"] / f"{d['exam_slug']}.md"
        if tr["state"] == "merged":
            state = "rendered" if (md.exists() and self._fresh(d, md)) else "ready_to_render"
        elif tr["state"] == "complete":
            state = "translated"
        else:
            state = "needs_translation"
        return {
            "course": d["course"], "course_slug": d["course_slug"],
            "exam": d.get("exam"), "exam_slug": d["exam_slug"],
            "source_url": d.get("source_url", ""), "state": state,
            "next_action": NEXT_ACTION[state],
            "translation_state": tr["state"], "fetch_state": "cached",
            "questions": len(d.get("questions", [])),
            "unknown": sum(1 for q in d.get("questions", [])
                           if q.get("answer") == "UNKNOWN"),
            "review": sum(len(q.get("review", [])) for q in d.get("questions", [])),
            "translation": tr,
            "issues": [{"kind": "json_without_config", "severity": "error",
                        "detail": f"{d['course_slug']}__{d['exam_slug']}"}],
        }

    # --- aggregates -----------------------------------------------------
    def course_rows(self) -> list:
        order = {c["slug"]: i for i, c in enumerate(self.courses)}
        rows: dict = {}
        for e in self.exams:
            r = rows.setdefault(e["course_slug"], {
                "course_slug": e["course_slug"], "course": e["course"],
                "found": 0, "saved": 0, "rendered": 0, "questions": 0,
                "unknown": 0, "review": 0, "states": Counter(),
                "next": Counter(),
            })
            r["found"] += 1
            r["states"][e["state"]] += 1
            r["next"][e["next_action"]] += 1
            if e["state"] in INCLUDED_STATES:
                r["saved"] += 1
                r["questions"] += e["questions"] or 0
                r["unknown"] += e["unknown"] or 0
                r["review"] += e["review"] or 0
            if e["state"] == "rendered":
                r["rendered"] += 1
        for c in self.courses:
            r = rows.setdefault(c["slug"], {
                "course_slug": c["slug"], "course": c["course"],
                "found": 0, "saved": 0, "rendered": 0, "questions": 0,
                "unknown": 0, "review": 0, "states": Counter(), "next": Counter(),
            })
            r["page_cached"] = (CACHE / (sha1(c["page_url"]) + ".html")).exists()
        out = []
        for slug, r in rows.items():
            r["states"] = dict(sorted(r["states"].items()))
            r["next"] = dict(sorted(r["next"].items(),
                                    key=lambda kv: (-kv[1], kv[0])))
            pending = [a for a in ACTION_PRIORITY if r["next"].get(a)]
            if not r["found"]:
                r["state"] = "page_cached" if r.get("page_cached") else "page_pending"
                r["next_action"] = "discover" if r.get("page_cached") else "fetch_page"
            elif pending:
                r["state"] = COURSE_STATE[pending[0]]
                r["next_action"] = pending[0]
            else:
                r["state"] = "complete"
                r["next_action"] = "none"
            r["_order"] = order.get(slug, 999)
            out.append(r)
        out.sort(key=lambda r: (r["_order"], r["course_slug"]))
        for r in out:
            r.pop("_order", None)
        return out

    def issues(self) -> list:
        out = []
        for e in self.exams:
            for i in e["issues"]:
                out.append({**i, "course_slug": e["course_slug"],
                            "exam_slug": e["exam_slug"]})
        return out

    def snapshot(self) -> dict:
        issues = self.issues()
        states = Counter(e["state"] for e in self.exams)
        actions = Counter(e["next_action"] for e in self.exams)
        included = [e for e in self.exams if e["state"] in INCLUDED_STATES]
        courses = self.course_rows()
        totals = {
            "real_exams": len(self.exams),
            "out_of_scope": len(self.out_of_scope),
            "saved_exams": len(included),
            "questions": sum(e["questions"] or 0 for e in included),
            "unknown": sum(e["unknown"] or 0 for e in included),
            "review": sum(e["review"] or 0 for e in included),
            "rendered": states.get("rendered", 0),
            "courses": len(courses),
            "courses_complete": sum(1 for c in courses
                                    if c["state"] == "complete"),
            "errors": sum(1 for i in issues if i["severity"] == "error"),
            "warnings": sum(1 for i in issues if i["severity"] == "warning"),
        }
        # A manifest copied from an earlier snapshot is stale, not corrupt. It
        # is a warning (rebuild it) rather than an error (fix the data).
        drift = {}
        mp = self.manifest.get("pipeline")
        if mp:
            for k in ("saved_exams", "questions", "rendered", "review"):
                if mp.get(k) != totals[k]:
                    drift[k] = {"manifest": mp.get(k), "state": totals[k]}
        if drift:
            totals["warnings"] += 1
        return {
            "schema": SCHEMA,
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "totals": totals,
            "states": {s: states.get(s, 0) for s in EXAM_STATES},
            "next_actions": dict(sorted(actions.items())),
            "courses": courses,
            "exams": self.exams,
            "out_of_scope": self.out_of_scope,
            "issues": issues,
            "manifest_drift": drift,
        }


def print_summary(snap: dict, show_exams: bool) -> None:
    t = snap["totals"]
    print(f"PIPELINE STATE  {snap['generated_at']}")
    print(f"real exams {t['real_exams']}  out of scope {t['out_of_scope']}  "
          f"rendered {t['rendered']}  questions {t['questions']}  "
          f"UNKNOWN {t['unknown']}  REVIEW {t['review']}")
    print("states: " + "  ".join(f"{k}={v}" for k, v in snap["states"].items() if v))
    print("next:   " + "  ".join(f"{k}={v}" for k, v in snap["next_actions"].items()
                                 if v))
    print()
    print(f"{'course':<46} {'real':>4} {'saved':>6} {'done':>4} {'q':>5} "
          f"{'unk':>3} {'rev':>3}  {'state':<12} next")
    for c in snap["courses"]:
        nxt = ", ".join(f"{k} {v}" for k, v in c["next"].items()
                        if k not in ("none",)) or "-"
        print(f"{c['course']:<46} {c['found']:>4} {c['saved']:>6} "
              f"{c['rendered']:>4} {c['questions']:>5} {c['unknown']:>3} "
              f"{c['review']:>3}  {c['state']:<12} {nxt}")
    if show_exams:
        print()
        print(f"{'exam':<58} {'state':<22} {'tr':<12} {'q':>3}  next")
        for e in snap["exams"]:
            print(f"{e['course_slug'] + '/' + (e['exam_slug'] or '?'):<58} "
                  f"{e['state']:<22} {e['translation_state']:<12} "
                  f"{str(e['questions'] or '-'):>3}  {e['next_action']}")
    errs = [i for i in snap["issues"] if i["severity"] == "error"]
    warns = [i for i in snap["issues"] if i["severity"] == "warning"]
    print()
    print(f"issues: {len(errs)} error(s), {len(warns)} warning(s)")
    for i in errs[:20]:
        print(f"  ERROR {i['kind']}: {i['course_slug']}/{i['exam_slug']} {i['detail']}")
    for i in warns[:10]:
        print(f"  warn  {i['kind']}: {i['course_slug']}/{i['exam_slug']} {i['detail']}")
    drift = snap.get("manifest_drift") or {}
    if drift:
        print("  warn  manifest_drift: " + ", ".join(
            f"{k} {v['manifest']}->{v['state']}" for k, v in drift.items())
            + "  (run scripts/build_manifest.py)")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--exams", action="store_true", help="one row per exam")
    ap.add_argument("--json", action="store_true", help="machine-readable snapshot")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if artifacts contradict each other")
    ap.add_argument("--diagram", action="store_true", help="print Mermaid diagram")
    ap.add_argument("--course", help="filter to one course slug")
    args = ap.parse_args(argv)

    if args.diagram:
        print(DIAGRAM.rstrip())
        return 0

    p = Pipeline()
    snap = p.snapshot()
    if args.course:
        snap["exams"] = [e for e in snap["exams"]
                         if e["course_slug"] == args.course]
        snap["courses"] = [c for c in snap["courses"]
                           if c["course_slug"] == args.course]
    if args.json:
        print(json.dumps(snap, ensure_ascii=False, indent=2))
        return 0
    print_summary(snap, args.exams)
    if args.check:
        return 1 if snap["totals"]["errors"] else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
