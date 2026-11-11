#!/usr/bin/env python3
"""Render Markdown from canonical JSON. Never touches Turkish text."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSONDIR = ROOT / "output/.cache/json"
OUT = ROOT / "output"


def esc_line(s: str) -> str:
    """One logical line: newlines become <br> (content unchanged)."""
    return s.replace("\r", "").replace("\n", "<br>")


def rel_asset(p: str) -> str:
    return p


def render(d: dict) -> str:
    lines = ["---",
             f"course: {d['course']}",
             f"exam: {d['exam']}",
             f"source_url: {d['source_url']}",
             f"question_count: {d['question_count']}",
             f"scraped_at: {d['scraped_at']}",
             "---", ""]
    for q in d["questions"]:
        n = q["n"]
        tr = esc_line(q["stem"])
        ar = esc_line(q.get("stem_ar") or "")
        img_tr = "".join(f" [IMAGE]({i['path']})" for i in q.get("stem_images", [])
                         if i.get("path"))
        lines.append(f"### Q{n}")
        lines.append(f"**Question:** {tr}{img_tr} | {ar}")
        lines.append("**Choices:**")
        for c in q["choices"]:
            ctr = esc_line(c["text"])
            car = esc_line(c.get("text_ar") or "")
            cimg = "".join(f" [IMAGE]({i['path']})" for i in c.get("images", [])
                           if i.get("path"))
            lines.append(f"- {c['letter']}) {ctr}{cimg} — {car}")
        if q.get("tables"):
            for t in q["tables"]:
                lines.append("")
                lines.append("[TABLE]")
                lines.append("```")
                lines.append(t)
                lines.append("```")
        for note in q.get("review", []):
            lines.append(f"<!-- REVIEW: {note} -->")
        lines.append(f"**Answer:** {q.get('answer', 'UNKNOWN')}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    d = json.load(open(args.json, encoding="utf-8"))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(render(d), encoding="utf-8")
    tmp.replace(out)
    print(out)


if __name__ == "__main__":
    main()
