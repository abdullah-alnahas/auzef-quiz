#!/usr/bin/env python3
"""Parse a cached exam page into canonical JSON.

Canonical JSON (output/.cache/json/<exam-slug>.json) is the single source of
truth; Markdown is rendered from it. Turkish fields are produced only here and
are never rewritten by translation.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "output/.cache/html"
JSONDIR = ROOT / "output/.cache/json"

BLOCK = {"p", "div", "li", "tr", "blockquote", "section", "article", "h1", "h2",
         "h3", "h4", "h5", "h6"}


def clean(s: str) -> str:
    s = s.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
    # Some authors paste literal markup into the post body. A textual "<br>"
    # is a line break, not three words, so normalise it like the tag itself.
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def text_of(node: Tag) -> str:
    """Text with <br> as newline and block children separated by newlines.

    No wording changes: only whitespace normalisation and structural newlines.
    """
    parts = []

    def walk(n):
        if isinstance(n, NavigableString):
            parts.append(str(n))
            return
        if not isinstance(n, Tag):
            return
        if n.name == "br":
            parts.append("\n")
            return
        if n.name == "img":
            return  # images are handled separately
        if n.name == "table":
            parts.append("\n" + table_md(n) + "\n")
            return
        if n.name == "script" or n.name == "style":
            return
        if n.name in BLOCK:
            parts.append("\n")
        for c in n.children:
            walk(c)
        if n.name in BLOCK:
            parts.append("\n")

    for c in node.children:
        walk(c)
    return clean("".join(parts))


def table_md(t: Tag) -> str:
    rows = []
    for tr in t.find_all("tr"):
        cells = []
        for c in tr.find_all(["th", "td"]):
            cells.append(clean(text_of(c)).replace("\n", " ").replace("|", "\\|"))
            span = int(c.get("colspan") or 1)
            cells.extend([""] * (span - 1))
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |",
           "| " + " | ".join(["---"] * width) + " |"]
    for r in rows[1:]:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def real_images(node: Tag):
    out = []
    for img in node.find_all("img"):
        src = img.get("data-src") or img.get("src") or ""
        cls = " ".join(img.get("class") or [])
        if "emoji" in cls or "s.w.org/images/core/emoji" in src or src.startswith("data:"):
            continue
        if not src:
            continue
        out.append({"src": src, "alt": img.get("alt") or "",
                    "width": img.get("width"), "height": img.get("height")})
    return out


def parse(html_path: Path, course: str, course_slug: str, exam_label: str,
          url: str, exam_slug: str) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "lxml")

    h1 = soup.find("h1")
    page_title = clean(h1.get_text(" ", strip=True)) if h1 else ""
    if not page_title and soup.title:
        page_title = clean(soup.title.get_text(" ", strip=True))

    wrappers = soup.select(".hdq_quiz_wrapper")
    questions = []
    answer_source = "none"
    sources_seen = set()

    if not wrappers:
        # Legacy plain-text exam pages.
        from parse_legacy import extract as extract_legacy
        questions = extract_legacy(html_path.read_text(encoding="utf-8"))
        if questions:
            answered = sum(1 for q in questions if q["answer"] != "UNKNOWN")
            answer_source = "inline" if answered else "none"
        return {
            "course": course, "course_slug": course_slug, "exam": exam_label,
            "exam_slug": exam_slug, "page_title": page_title or exam_label,
            "source_url": url,
            "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "answer_source": answer_source, "question_count": len(questions),
            "questions": questions, "_debug": {"format": "legacy"},
        }

    for wi, wrap in enumerate(wrappers):
        for q in wrap.select(".hdq_question"):
            num_node = q.select_one(".hdq_question_number")
            num = None
            if num_node:
                m = re.search(r"\d+", num_node.get_text())
                if m:
                    num = int(m.group())
            heading = q.select_one(".hdq_question_heading")
            if heading is None:
                continue
            if num_node is not None:
                # Remove the number span from a copy of the heading.
                heading = BeautifulSoup(str(heading), "lxml").find(
                    class_="hdq_question_heading")
                for s in heading.select(".hdq_question_number"):
                    s.decompose()
            stem = text_of(heading)

            choices: list = []
            answer = None
            for label in q.select(".hdq_label_answer"):
                aria = label.select_one(".hdq_aria_label")
                txt = text_of(aria) if aria else text_of(label)
                m = re.match(r"^\s*([A-Ea-e])\s*[\)\.\-]\s*(.*)$", txt, re.S)
                if m:
                    letter = m.group(1).upper()
                    body = clean(m.group(2))
                else:
                    letter = chr(ord("A") + len(choices))
                    body = txt.strip()
                inp = label.find("input")
                val = 0
                if inp is not None:
                    try:
                        val = int(inp.get("value") or 0)
                    except ValueError:
                        val = 0
                correct = val > 0
                if correct:
                    if answer is None:
                        answer = letter
                    else:
                        answer = answer + ", " + letter  # multi-select
                choices.append({"letter": letter, "text": body,
                                "images": real_images(label)})

            if answer:
                sources_seen.add("markup")

            qtype = q.get("data-type") or ""
            tables = [table_md(t) for t in q.find_all("table")]
            questions.append({
                "n": num,
                "type": qtype,
                "stem": stem,
                "stem_images": real_images(heading),
                "tables": [t for t in tables if t],
                "choices": choices,
                "answer": answer if answer else "UNKNOWN",
            })

    if "markup" in sources_seen:
        answer_source = "markup"
    if not questions:
        raise ValueError("no questions found")

    nums = [q["n"] for q in questions]
    return {
        "course": course,
        "course_slug": course_slug,
        "exam": exam_label,
        "exam_slug": exam_slug,
        "page_title": page_title,
        "source_url": url,
        "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "answer_source": answer_source,
        "question_count": len(questions),
        "questions": questions,
        "_debug": {"numbers": nums, "wrappers": len(wrappers)},
    }


def main() -> int:
    if len(sys.argv) < 5:
        print("usage: parse_exam.py <html> <course> <course_slug> <exam_slug> [label] [url]",
              file=sys.stderr)
        return 2
    html_path = Path(sys.argv[1])
    course, course_slug, exam_slug = sys.argv[2], sys.argv[3], sys.argv[4]
    label = sys.argv[5] if len(sys.argv) > 5 else exam_slug
    url = sys.argv[6] if len(sys.argv) > 6 else ""
    data = parse(html_path, course, course_slug, label, url, exam_slug)
    JSONDIR.mkdir(parents=True, exist_ok=True)
    out = JSONDIR / f"{course_slug}__{exam_slug}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{out} questions={data['question_count']} answer_source={data['answer_source']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
