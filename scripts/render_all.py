#!/usr/bin/env python3
"""Merge done translations, render every translated exam, rebuild manifest."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from render_md import render  # noqa: E402

JSONDIR = ROOT / "output/.cache/json"
OUT = ROOT / "output"


def main() -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts/translate_io.py"), "--merge"],
                   check=True)
    n = 0
    expected = set()
    for f in sorted(JSONDIR.glob("*__*.json")):
        d = json.load(open(f, encoding="utf-8"))
        if not d["questions"] or not all(q.get("stem_ar") for q in d["questions"]):
            continue
        path = OUT / d["course_slug"] / f"{d['exam_slug']}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        expected.add(path)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(render(d), encoding="utf-8")
        tmp.replace(path)
        n += 1
    # Markdown must not outlive the JSON it came from (deleted, duplicate or
    # quality-skipped exams). Only exam files inside course directories.
    pruned = 0
    for course_dir in OUT.iterdir():
        if not course_dir.is_dir() or course_dir.name.startswith("."):
            continue
        for md in course_dir.glob("*.md"):
            if md not in expected:
                md.unlink()
                pruned += 1
    subprocess.run([sys.executable, str(ROOT / "scripts/build_manifest.py")], check=True)
    print("rendered", n, "pruned", pruned)


if __name__ == "__main__":
    main()
