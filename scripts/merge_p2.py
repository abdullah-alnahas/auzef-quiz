#!/usr/bin/env python3
"""Fold Phase 2 discovery output into the single canonical config.

Phase 1 lives in config/exams.json + config/courses.json. discover_courses.py
writes Phase 2 to separate files (exams_p2.json, courses_p2_discovered.json).
This script appends the new courses, exams and out-of-scope records to the
canonical config so every downstream script keeps using one source of truth.

Idempotent: records are keyed by (course_slug, url) / course slug.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"


def load(name):
    return json.load(open(CONFIG / name, encoding="utf-8"))


def dump(name, data):
    (CONFIG / name).write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    exams = load("exams.json")
    courses = load("courses.json")
    p2_exams = load("exams_p2.json")
    p2_courses = load("courses_p2_discovered.json")

    have_course = {c["slug"] for c in courses["courses"]}
    new_courses = 0
    for c in p2_courses["courses"]:
        if c["slug"] in have_course:
            continue
        courses["courses"].append({
            "course": c["course"], "slug": c["slug"],
            "page_url": c["page_url"], "page_file": c["page_file"],
            "exams": c["exams"],
        })
        have_course.add(c["slug"])
        new_courses += 1

    have_exam = {(e["course_slug"], e["url"]) for e in exams["exams"]}
    new_exams = 0
    for e in p2_exams["exams"]:
        if (e["course_slug"], e["url"]) in have_exam:
            continue
        exams["exams"].append({
            "label": e["label"], "type": e["type"], "period": e["period"],
            "mock": e["mock"], "url": e["url"], "course": e["course"],
            "course_slug": e["course_slug"],
            "provisional_slug": e["provisional_slug"],
            "status": "fetch_missing",
        })
        have_exam.add((e["course_slug"], e["url"]))
        new_exams += 1

    have_skip = {(s["course_slug"], s["url"]) for s in exams["skipped"]}
    new_skips = 0
    for s in p2_exams["skipped"]:
        if (s["course_slug"], s["url"]) in have_skip:
            continue
        exams["skipped"].append(s)
        have_skip.add((s["course_slug"], s["url"]))
        new_skips += 1

    dump("exams.json", exams)
    dump("courses.json", courses)
    print(f"courses +{new_courses} (total {len(courses['courses'])})")
    print(f"exams   +{new_exams} (total {len(exams['exams'])})")
    print(f"skipped +{new_skips} (total {len(exams['skipped'])})")


if __name__ == "__main__":
    main()
